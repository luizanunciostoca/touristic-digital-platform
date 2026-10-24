import { evaluateDependenciesAtMain } from "../mdctl/scheduler-live.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskStart,
  buildTaskTest,
  buildTaskSubmit,
  buildTaskCorrection,
  buildTaskRestart,
} from "../mdctl/task-lifecycle.mjs";
function changeSet() {
  return {
    schemaVersion: 2,
    id: "MD-TASK-LIFECYCLE",
    baseSha: "a".repeat(40),
    branch: "infra/task-lifecycle",
    state: "IMPLEMENTING",
    risk: "high",
    scope: "PLATFORM",
    owns: { paths: ["tooling/mdctl/**"], contracts: ["TASK"] },
    reads: { contracts: ["MAIN"] },
    produces: { events: ["TASK_SUBMITTED"], routes: [] },
    database: { tables: [] },
    auth: { capabilities: [] },
    dependencies: [],
    requiredEvidence: ["remote-proof"],
    requiredCapabilities: ["github:read", "workspace:write:claimed-paths"],
    contextPack: {
      maxBytes: 65536,
      include: ["changeset", "git-identity", "proof-plan"],
    },
    proof: {
      budget: { maxCommands: 2, maxSeconds: 120 },
      commands: [
        {
          id: "unit-one",
          argv: ["node", "--test", "tooling/one.test.mjs"],
          timeoutSeconds: 30,
        },
        {
          id: "unit-two",
          argv: ["node", "--test", "tooling/two.test.mjs"],
          timeoutSeconds: 30,
        },
      ],
      requiredRemoteEvidence: ["remote-proof"],
    },
    stopAt: "REMOTE_PROVEN",
  };
}

async function fixture(
  dependencies = [],
  delegated = false,
  baseSha = "a".repeat(40),
) {
  let n = 0;
  const idFactory = () => "correction-" + ++n;
  const manifest = changeSet();
  manifest.baseSha = baseSha;
  manifest.dependencies = dependencies;
  if (delegated) {
    manifest.id = CORRECTION.predecessor;
    manifest.branch = "fix/staging-node-governance-20261023";
    manifest.owns.paths = [
      ".morro/changesets/" + manifest.id + ".json",
      "tooling/quality/check-ci-governance.mjs",
    ];
  }
  const identity = {
    headSha: "b".repeat(40),
    treeSha: "c".repeat(40),
    branch: manifest.branch,
    baseIsAncestor: true,
    dirty: false,
  };
  const started = buildTaskStart({
    changeSet: manifest,
    owner: delegated ? CORRECTION.executor : "worker-1",
    identity,
    now: "2026-10-01T09:00:00Z",
    idFactory,
  });
  const tested = await buildTaskTest({
    task: started.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity,
    now: "2026-10-01T09:05:00Z",
    // Unit fixture output; this is not project execution evidence.
    commandRunner: async () => ({
      status: "PASS",
      stdout: "fixture",
      stderr: "",
    }),
  });
  const submitted = buildTaskSubmit({
    task: tested.task,
    changeSet: manifest,
    leaseRegistry: started.leaseRegistry,
    identity,
    now: "2026-10-01T09:06:00Z",
  });
  const successor = {
    ...structuredClone(manifest),
    id: delegated ? CORRECTION.successor : "MD-TASK-CORRECTION",
    branch: delegated ? CORRECTION.branch : "infra/task-correction",
    dependencies: [...manifest.dependencies],
  };
  if (delegated)
    successor.owns = {
      ...successor.owns,
      paths: successor.owns.paths.map((p) =>
        p === ".morro/changesets/" + manifest.id + ".json"
          ? ".morro/changesets/" + successor.id + ".json"
          : p,
      ),
    };
  const claimRegistry = {
    registryAuthority: "ORCHESTRATOR",
    claims: {
      [successor.id]: {
        owner: delegated ? CORRECTION.owner : "worker-1",
        reviewer: "AUTOMATED-INDEPENDENT-PROOF",
        branch: successor.branch,
        baseSha: successor.baseSha,
        paths: successor.owns.paths,
        domains: ["control-plane"],
        risk: "P1",
        status: "IMPLEMENTING",
        expiresAt: "2026-10-02T09:00:00Z",
      },
    },
  };
  return {
    ...submitted,
    changeSet: manifest,
    successor,
    claimRegistry,
    identity: {
      ...identity,
      branch: successor.branch,
      headSha: "d".repeat(40),
    },
    isAncestor: () => true,
    // Deterministic fixture for the trusted Git reader, not runtime evidence.
    readCandidateDiff: (identity) => ({
      ...identity,
      changedFiles: [
        delegated
          ? "tooling/quality/check-ci-governance.mjs"
          : "tooling/mdctl/correction.mjs",
      ],
    }),
    now: "2026-10-01T09:10:00Z",
    idFactory,
  };
}
test("submitted correction preserves predecessor and binds new task to receipt", async () => {
  const f = await fixture();
  const before = structuredClone({
    task: f.task,
    handoff: f.handoff,
    leases: f.leaseRegistry,
  });
  const result = buildTaskCorrection(f);
  assert.equal(result.task.state, "STARTED");
  assert.equal(result.task.localProof, null);
  assert.equal(result.task.handoffDigest, null);
  assert.equal(result.task.supersedes.handoffDigest, f.handoff.digest);
  assert.notEqual(result.task.taskId, f.task.taskId);
  assert.deepEqual(
    { task: f.task, handoff: f.handoff, leases: f.leaseRegistry },
    before,
  );
  assert.ok(result.task.leaseIds.every((id) => !f.task.leaseIds.includes(id)));
  assert.equal(
    result.authority,
    "LOCAL_CORRECTION_PROPOSAL_NOT_EXECUTION_RESERVATION",
  );
  assert.throws(
    () => buildTaskRestart({ ...f, changeSet: f.changeSet }),
    /STATE_NOT_RESTARTABLE/,
  );
});
for (const [name, mutate, code] of [
  [
    "modified receipt",
    (f) => (f.handoff.candidateSha = "f".repeat(40)),
    /HANDOFF_MISMATCH/,
  ],
  [
    "modified digest",
    (f) => (f.task.handoffDigest = "sha256:" + "0".repeat(64)),
    /HANDOFF_DIGEST_MISMATCH/,
  ],
  [
    "active old lease",
    (f) => (f.leaseRegistry.leases[f.task.leaseIds[0]].state = "ACTIVE"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "missing old lease",
    (f) => delete f.leaseRegistry.leases[f.task.leaseIds[0]],
    /CAPABILITIES_MISMATCH/,
  ],
  [
    "lease owned by another",
    (f) => (f.leaseRegistry.leases[f.task.leaseIds[0]].owner = "other"),
    /LEASE_OWNER_MISMATCH/,
  ],
  ["omitted lease", (f) => f.task.leaseIds.pop(), /CAPABILITIES_MISMATCH/],
  [
    "duplicate lease",
    (f) => (f.task.leaseIds[1] = f.task.leaseIds[0]),
    /DUPLICATE_LEASE/,
  ],
  ["wrong task ID", (f) => (f.task.taskId = "task-other"), /TASK_ID_MISMATCH/],
  ["same ID", (f) => (f.successor.id = f.changeSet.id), /NEW_ID_REQUIRED/],
  [
    "same branch",
    (f) => (f.successor.branch = f.changeSet.branch),
    /NEW_BRANCH_REQUIRED/,
  ],
  [
    "unexpected dependency",
    (f) => f.successor.dependencies.push("MD-UNRELATED"),
    /DEPENDENCY_MISMATCH/,
  ],
  [
    "broadened scope",
    (f) => f.successor.owns.paths.push("tooling/**"),
    /AUTHORITY_CHANGED/,
  ],
  [
    "weaker proof",
    (f) => f.successor.proof.commands.pop(),
    /AUTHORITY_CHANGED/,
  ],
  [
    "another claim owner",
    (f) => (f.claimRegistry.claims[f.successor.id].owner = "other"),
    /CLAIM_OWNER_MISMATCH/,
  ],
  [
    "expired claim",
    (f) =>
      (f.claimRegistry.claims[f.successor.id].expiresAt =
        "2026-09-01T00:00:00Z"),
    /CLAIM_EXPIRED/,
  ],
  ["dirty workspace", (f) => (f.identity.dirty = true), /WORKSPACE_DIRTY/],
  ["absent ancestry verifier", (f) => delete f.isAncestor, /ANCESTRY_REQUIRED/],
  ["regressed base", (f) => (f.isAncestor = () => false), /BASE_REGRESSED/],
  ["reversed clock", (f) => (f.now = "2026-10-01T09:01:00Z"), /TIME_REVERSED/],
  [
    "reused lease IDs",
    (f) => (f.idFactory = () => f.task.leaseIds[0].replace(/^lease-/, "")),
    /LEASE_ID_DUPLICATE/,
  ],
])
  test(`correction rejects ${name}`, async () => {
    const f = await fixture();
    mutate(f);
    assert.throws(() => buildTaskCorrection(f), code);
  });

for (const [name, paths] of [
  ["narrower claim", ["tooling/mdctl/narrow.mjs"]],
  ["broader claim", ["tooling/**"]],
  ["empty claim", []],
  ["duplicated claim pattern", ["tooling/mdctl/**", "tooling/mdctl/**"]],
])
  test(`correction rejects ${name} before proposing leases`, async () => {
    const f = await fixture();
    f.claimRegistry.claims[f.successor.id].paths = paths;
    const before = structuredClone(f.leaseRegistry);
    assert.throws(
      () => buildTaskCorrection(f),
      /TASK_CORRECTION_CLAIM_SCOPE_MISMATCH/,
    );
    assert.deepEqual(f.leaseRegistry, before);
  });

for (const [name, mutate, code] of [
  ["missing reader", (f) => delete f.readCandidateDiff, /DIFF_READER_REQUIRED/],
  [
    "missing result",
    (f) => (f.readCandidateDiff = () => null),
    /DIFF_REQUIRED/,
  ],
  ...["baseSha", "headSha", "treeSha"].map((key) => [
    `stale ${key}`,
    (f) => {
      const read = f.readCandidateDiff;
      f.readCandidateDiff = (identity) => ({
        ...read(identity),
        [key]: "f".repeat(40),
      });
    },
    /DIFF_IDENTITY_MISMATCH/,
  ]),
  [
    "out-of-scope candidate",
    (f) =>
      (f.readCandidateDiff = (identity) => ({
        ...identity,
        changedFiles: ["services/financial/unclaimed.ts"],
      })),
    /CLAIM_PATH_VIOLATION/,
  ],
  [
    "missing paths",
    (f) => (f.readCandidateDiff = (identity) => ({ ...identity })),
    /DIFF_PATHS_INVALID/,
  ],
  [
    "duplicate paths",
    (f) =>
      (f.readCandidateDiff = (identity) => ({
        ...identity,
        changedFiles: ["tooling/mdctl/a.mjs", "tooling/mdctl/a.mjs"],
      })),
    /DIFF_PATHS_DUPLICATE/,
  ],
]) {
  test(`correction rejects ${name} without proposing leases`, async () => {
    const f = await fixture();
    mutate(f);
    const before = structuredClone({ task: f.task, leases: f.leaseRegistry });
    assert.throws(() => buildTaskCorrection(f), code);
    assert.deepEqual({ task: f.task, leases: f.leaseRegistry }, before);
  });
}

test("correction rejects successor already in predecessor dependencies", async () => {
  const f = await fixture(["MD-TASK-CORRECTION"]);
  const before = structuredClone({
    task: f.task,
    handoff: f.handoff,
    leases: f.leaseRegistry,
  });
  assert.throws(
    () => buildTaskCorrection(f),
    /TASK_CORRECTION_DEPENDENCY_CYCLE/,
  );
  assert.deepEqual(
    { task: f.task, handoff: f.handoff, leases: f.leaseRegistry },
    before,
  );
});
test("correction preserves unrelated predecessor dependencies", async () => {
  const f = await fixture(["MD-EXISTING-DEPENDENCY"]);
  const result = buildTaskCorrection(f);
  assert.equal(result.task.state, "STARTED");
  assert.deepEqual(f.successor.dependencies, ["MD-EXISTING-DEPENDENCY"]);
});

test("correction lineage does not require the replaced task to merge", async () => {
  const f = await fixture();
  const result = buildTaskCorrection(f);
  const dependencies = await evaluateDependenciesAtMain({
    changeSet: f.successor,
    mainSha: f.successor.baseSha,
    cache: new Map([
      [f.changeSet.id, { ...f.changeSet, state: "LOCAL_PROVEN" }],
    ]),
    api: async () => {
      throw new Error("unexpected dependency request");
    },
  });
  assert.deepEqual(dependencies, { satisfied: true, unresolved: [] });
  assert.deepEqual(f.successor.dependencies, f.changeSet.dependencies);
  assert.equal(result.task.supersedes.changeSetId, f.changeSet.id);
  assert.equal(result.task.supersedes.handoffDigest, f.handoff.digest);
});
test("correction cannot drop an inherited execution dependency", async () => {
  const f = await fixture(["MD-EXISTING-DEPENDENCY"]);
  f.successor.dependencies = [];
  const before = structuredClone({ task: f.task, leases: f.leaseRegistry });
  assert.throws(
    () => buildTaskCorrection(f),
    /TASK_CORRECTION_DEPENDENCY_MISMATCH/,
  );
  assert.deepEqual({ task: f.task, leases: f.leaseRegistry }, before);
});

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  CORRECTION,
  correctionDigest,
  correctionEnvelope,
  correctionClaim,
  correctionKey,
  validateCorrectionHistory,
  collectCorrectionAuthority,
} from "../mdctl/task-correction-authority.mjs";

function grantHistory(f, consumed = true) {
  const issued = {
    schemaVersion: 1,
    kind: "TDP_GOVERNANCE_CORRECTION_DELEGATION",
    ...Object.fromEntries(
      [
        "repository",
        "owner",
        "executor",
        "predecessor",
        "successor",
        "branch",
      ].map((k) => [k, CORRECTION[k]]),
    ),
    taskDigest: correctionDigest(f.task),
    handoffDigest: f.handoff.digest,
    manifestDigest: f.task.changeSetDigest,
    envelopeDigest: correctionDigest(correctionEnvelope(f.successor)),
    claimDigest: correctionDigest(
      correctionClaim(f.claimRegistry.claims[f.successor.id]),
    ),
    nonce: "fixture-delegation-nonce-0001",
    issuedAt: "2026-10-01T09:09:00Z",
    expiresAt: "2026-10-01T10:09:00Z",
    state: "ISSUED",
    reservation: null,
  };
  const history = [{ commitSha: "1".repeat(40), grant: issued }];
  if (consumed)
    history.push({
      commitSha: "2".repeat(40),
      grant: {
        ...structuredClone(issued),
        state: "CONSUMED",
        reservation: {
          key: correctionKey(f.handoff.digest),
          commitSha: "3".repeat(40),
          issuedCommitSha: history[0].commitSha,
        },
      },
    });
  return history;
}
function liveGrantHistory(f, consumed = true) {
  const clock = Date.now();
  f.claimRegistry.claims[f.successor.id].expiresAt = new Date(
    clock + 3600000,
  ).toISOString();
  const h = grantHistory(f, consumed);
  for (const entry of h) {
    entry.grant.issuedAt = new Date(clock - 60000).toISOString();
    entry.grant.expiresAt = new Date(clock + 3600000).toISOString();
  }
  return h;
}
function blob(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    type: "file",
    encoding: "base64",
    content: bytes.toString("base64"),
    sha: createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex"),
  };
}
function providerFixture(f, history, main = f.successor.baseSha) {
  const prefix = "repos/" + CORRECTION.repository;
  const responses = {
    [prefix + "/commits/main"]: { sha: main },
    [prefix +
    "/commits?sha=" +
    main +
    "&path=" +
    encodeURIComponent(CORRECTION.path) +
    "&per_page=100&page=1"]: history
      .toReversed()
      .map((x) => ({ sha: x.commitSha })),
    [prefix + "/contents/" + CORRECTION.path + "?ref=" + main]: blob(
      history.at(-1).grant,
    ),
    [prefix + "/contents/.github/morro-control/claims.json?ref=" + main]: blob(
      f.claimRegistry,
    ),
    [prefix +
    "/contents/.morro/changesets/" +
    CORRECTION.successor +
    ".json?ref=" +
    main]: blob(f.successor),
  };
  for (const entry of history)
    responses[
      prefix + "/contents/" + CORRECTION.path + "?ref=" + entry.commitSha
    ] = blob(entry.grant);
  return { responses };
}
function withProvider(config, action) {
  const directory = mkdtempSync(join(tmpdir(), "correction-provider-fixture-"));
  const configPath = join(directory, "provider.json"),
    requests = join(directory, "requests.ndjson");
  writeFileSync(configPath, JSON.stringify(config));
  // Test-only executable replaces the transport; production has no injectable
  // token factory or reader. It cannot contact GitHub or any external service.
  writeFileSync(
    join(directory, "gh"),
    "#!/usr/bin/env node\nconst fs = require('node:fs'), crypto = require('node:crypto');\nconst cfg = JSON.parse(fs.readFileSync(process.env.CORRECTION_FIXTURE_CONFIG));\nconst statePath = process.env.CORRECTION_FIXTURE_CONFIG + '.state';\nconst state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath)) : { objects: {}, refs: {}, refPosts: 0 };\nconst args = process.argv.slice(2), path = args.find(x => x.startsWith('repos/')), method = args[args.indexOf('--method') + 1];\nfs.appendFileSync(process.env.CORRECTION_FIXTURE_REQUESTS, JSON.stringify({ method, path }) + '\\n');\nconst save = () => fs.writeFileSync(statePath, JSON.stringify(state));\nconst fail = () => { save(); process.stderr.write('FIXTURE_REJECTED'); process.exit(1); };\nconst out = value => { save(); process.stdout.write(JSON.stringify(value)); process.exit(0); };\nconst hash = bytes => crypto.createHash('sha1').update(bytes).digest('hex');\nif (method === 'POST') {\n  if (!cfg.runtimeFixture) fail();\n  const payload = JSON.parse(fs.readFileSync(0, 'utf8'));\n  if (path.endsWith('/git/blobs')) {\n    const bytes = Buffer.from(payload.content);\n    const sha = hash(Buffer.concat([Buffer.from('blob ' + bytes.length + '\\0'), bytes]));\n    state.objects[sha] = { sha, encoding: 'base64', content: bytes.toString('base64') };\n    out({ sha });\n  }\n  if (path.endsWith('/git/trees')) {\n    const sha = hash(JSON.stringify(payload)); state.objects[sha] = { sha, ...payload, truncated: false }; out({ sha });\n  }\n  if (path.endsWith('/git/commits')) {\n    const sha = hash(JSON.stringify(payload)); state.objects[sha] = { sha, tree: { sha: payload.tree }, parents: payload.parents.map(sha => ({ sha })) }; out({ sha });\n  }\n  if (path.endsWith('/git/refs')) {\n    state.refPosts++;\n    if (state.refs[payload.ref]) fail();\n    state.refs[payload.ref] = { ref: payload.ref, object: { type: 'commit', sha: payload.sha } };\n    if (state.refPosts === cfg.timeoutRefNumber) fail();\n    out(state.refs[payload.ref]);\n  }\n  fail();\n}\nif (method !== 'GET') fail();\nif (path.includes('/git/ref/')) {\n  const ref = 'refs/' + path.split('/git/ref/')[1];\n  if (!state.refs[ref]) fail(); out(state.refs[ref]);\n}\nif (/\\/git\\/(blobs|trees|commits)\\//.test(path)) {\n  const value = state.objects[path.split('/').at(-1)]; if (!value) fail(); out(value);\n}\nif (!Object.hasOwn(cfg.responses, path) || cfg.responses[path].fixtureError) fail();\nout(cfg.responses[path]);\n",
    { mode: 0o700 },
  );
  const old = {
    PATH: process.env.PATH,
    CORRECTION_FIXTURE_CONFIG: process.env.CORRECTION_FIXTURE_CONFIG,
    CORRECTION_FIXTURE_REQUESTS: process.env.CORRECTION_FIXTURE_REQUESTS,
  };
  process.env.PATH = directory + ":" + old.PATH;
  process.env.CORRECTION_FIXTURE_CONFIG = configPath;
  process.env.CORRECTION_FIXTURE_REQUESTS = requests;
  try {
    return action({
      directory,
      requests,
      configPath,
      statePath: configPath + ".state",
    });
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}
test("canonical owner can delegate only the historical GOVERNANCE correction through authenticated history", async () => {
  const f = await fixture([], true),
    history = liveGrantHistory(f);
  const before = structuredClone({
    task: f.task,
    leases: f.leaseRegistry,
    handoff: f.handoff,
  });
  withProvider(providerFixture(f, history), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
    });
    const result = buildTaskCorrection({ ...f, authority });
    assert.equal(result.task.owner, CORRECTION.executor);
    assert.equal(result.task.supersedes.handoffDigest, f.handoff.digest);
    assert.equal(
      result.authority,
      "LOCAL_CORRECTION_PROPOSAL_NOT_EXECUTION_RESERVATION",
    );
    assert.ok(Object.isFrozen(authority.grant.reservation));
    for (const forged of [
      { ...authority },
      structuredClone(authority),
      JSON.parse(JSON.stringify(authority)),
    ])
      assert.throws(
        () => buildTaskCorrection({ ...f, authority: forged }),
        /AUTHORITY_UNVERIFIED/,
      );
  });
  assert.deepEqual(
    { task: f.task, leases: f.leaseRegistry, handoff: f.handoff },
    before,
  );
});
for (const [name, mutate, code] of [
  ["missing authority", (f) => {}, /CLAIM_OWNER_MISMATCH/],
  [
    "self asserted authority",
    (f) => (f.authority = { verified: true }),
    /AUTHORITY_UNVERIFIED/,
  ],
])
  test("delegated correction rejects " + name, async () => {
    const f = await fixture([], true);
    mutate(f);
    assert.throws(() => buildTaskCorrection(f), code);
  });
for (const [name, mutate, code] of [
  [
    "new nonce after consumption",
    (h) =>
      h.push({
        commitSha: "4".repeat(40),
        grant: {
          ...structuredClone(h[0].grant),
          nonce: "another-fixture-nonce-0002",
        },
      }),
    /HISTORY_IDENTITY_CHANGED/,
  ],
  [
    "second consumption",
    (h) =>
      h.push({ commitSha: "4".repeat(40), grant: structuredClone(h[1].grant) }),
    /HISTORY_TRANSITION/,
  ],
  [
    "regression to issued",
    (h) =>
      h.push({ commitSha: "4".repeat(40), grant: structuredClone(h[0].grant) }),
    /HISTORY_TRANSITION/,
  ],
  [
    "substituted reservation",
    (h) => (h[1].grant.reservation.issuedCommitSha = "9".repeat(40)),
    /CONSUMPTION_ISSUANCE/,
  ],
  [
    "other predecessor",
    (h) => (h[0].grant.predecessor = "MD-OTHER"),
    /GRANT_IDENTITY/,
  ],
  ["other executor", (h) => (h[0].grant.executor = "OTHER"), /GRANT_IDENTITY/],
  ["other owner", (h) => (h[0].grant.owner = "OTHER"), /GRANT_IDENTITY/],
  [
    "other successor",
    (h) => (h[0].grant.successor = "MD-OTHER"),
    /GRANT_IDENTITY/,
  ],
  [
    "altered envelope",
    (h) => (h[1].grant.envelopeDigest = "sha256:" + "9".repeat(64)),
    /HISTORY_IDENTITY_CHANGED/,
  ],
  [
    "altered claim",
    (h) => (h[1].grant.claimDigest = "sha256:" + "9".repeat(64)),
    /HISTORY_IDENTITY_CHANGED/,
  ],
  [
    "extra authority field",
    (h) => (h[0].grant.allowAnyExecutor = true),
    /GRANT_FIELDS/,
  ],
  [
    "revoked grant",
    (h) =>
      h.push({
        commitSha: "4".repeat(40),
        grant: { ...structuredClone(h[1].grant), state: "REVOKED" },
      }),
    /GRANT_REVOKED/,
  ],
  [
    "recreated after revocation",
    (h) => {
      h.push({
        commitSha: "4".repeat(40),
        grant: { ...structuredClone(h[1].grant), state: "REVOKED" },
      });
      h.push({ commitSha: "5".repeat(40), grant: structuredClone(h[1].grant) });
    },
    /REVOKED_TERMINAL/,
  ],
])
  test("canonical grant history rejects " + name, async () => {
    const h = grantHistory(await fixture([], true));
    mutate(h);
    assert.throws(
      () => validateCorrectionHistory(h, "2026-10-01T09:10:00Z"),
      code,
    );
  });
test("grant expiry and early activation fail closed", async () => {
  const h = grantHistory(await fixture([], true));
  for (const now of ["2026-10-01T09:08:59Z", "2026-10-01T10:09:00Z", "invalid"])
    assert.throws(() => validateCorrectionHistory(h, now), /GRANT_EXPIRED/);
});
test("ISSUED cannot authorize correction proposal", async () => {
  const f = await fixture([], true),
    h = liveGrantHistory(f, false);
  withProvider(providerFixture(f, h), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
    });
    assert.throws(
      () => buildTaskCorrection({ ...f, authority }),
      /NOT_CONSUMED/,
    );
  });
});
test("branded token accepts current observation and rejects forged reanchor certificate", async () => {
  const f = await fixture([], true);
  withProvider(providerFixture(f, liveGrantHistory(f)), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
    });
    assert.equal(
      buildTaskCorrection({ ...f, authority }).task.state,
      "STARTED",
    );
    assert.throws(
      () => buildTaskCorrection({ ...f, authority, reanchorProof: {} }),
      /REANCHOR_CERTIFICATE_UNVERIFIED/,
    );
  });
});
for (const [name, mutate, code] of [
  [
    "main moved",
    (c) =>
      (c.responses["repos/" + CORRECTION.repository + "/commits/main"].sha =
        "9".repeat(40)),
    /MAIN_MOVED/,
  ],
  [
    "truncated or corrupt blob",
    (c) => {
      const key = Object.keys(c.responses).find((k) =>
        k.includes("/contents/"),
      );
      c.responses[key].sha = "9".repeat(40);
    },
    /BLOB_HASH/,
  ],
  [
    "missing history",
    (c) => {
      const key = Object.keys(c.responses).find((k) => k.includes("/commits?"));
      c.responses[key] = [];
    },
    /HISTORY_REQUIRED/,
  ],
  [
    "deleted historical grant",
    (c) => {
      const key = Object.keys(c.responses).find((k) =>
        k.endsWith("?ref=" + "1".repeat(40)),
      );
      c.responses[key] = { fixtureError: true };
    },
    /Command failed/,
  ],
  [
    "expired claim",
    (c) => {
      const key = Object.keys(c.responses).find((k) =>
        k.includes("/contents/.github/morro-control/claims"),
      );
      const value = JSON.parse(Buffer.from(c.responses[key].content, "base64"));
      value.claims[CORRECTION.successor].expiresAt = "2026-09-01T00:00:00Z";
      c.responses[key] = blob(value);
    },
    /CLAIM_EXPIRED/,
  ],
])
  test("authenticated collector rejects " + name, async () => {
    const f = await fixture([], true),
      config = providerFixture(f, liveGrantHistory(f));
    mutate(config);
    withProvider(config, () =>
      assert.throws(
        () =>
          collectCorrectionAuthority({
            expectedMain: f.successor.baseSha,
          }),
        code,
      ),
    );
  });

test("authenticated authority cannot mint an expired grant using caller clock rollback", async () => {
  const f = await fixture([], true);
  withProvider(providerFixture(f, grantHistory(f)), () => {
    assert.throws(
      () =>
        collectCorrectionAuthority({
          expectedMain: f.successor.baseSha,
          now: f.now,
        }),
      /CLOCK_OVERRIDE_FORBIDDEN/,
    );
    assert.throws(
      () => collectCorrectionAuthority({ expectedMain: f.successor.baseSha }),
      /GRANT_EXPIRED/,
    );
  });
});
test("genuine branded token ages by real clock even if correction caller rolls time back", async () => {
  const f = await fixture([], true);
  withProvider(providerFixture(f, liveGrantHistory(f)), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
    });
    assert.equal(
      buildTaskCorrection({ ...f, authority }).task.state,
      "STARTED",
    );
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 31010);
    assert.throws(
      () => buildTaskCorrection({ ...f, authority, now: f.now }),
      /AUTHORITY_STALE/,
    );
  });
});

import {
  runCorrectionRuntime,
  withCorrectionLock,
  persistCorrectionTransaction,
  readCorrectionJournal,
} from "../mdctl/task-correction-runtime.mjs";

test("exclusive correction lock rejects concurrent entrance and releases after failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "correction-lock-"));
  try {
    assert.throws(
      () =>
        withCorrectionLock(directory, () => {
          assert.throws(
            () =>
              withCorrectionLock(directory, () => assert.fail("concurrent")),
            /EEXIST/,
          );
          throw new Error("fixture-crash");
        }),
      /fixture-crash/,
    );
    assert.equal(
      withCorrectionLock(directory, () => "released"),
      "released",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("journal rejects corruption and truncated trailing write", () => {
  const directory = mkdtempSync(join(tmpdir(), "correction-journal-")),
    path = join(directory, "journal");
  try {
    const payload = {
      sequence: 0,
      previous: null,
      stage: "START_INTENT",
      value: { fixture: true },
    };
    const record = { ...payload, digest: correctionDigest(payload) };
    writeFileSync(path, JSON.stringify(record) + "\n");
    assert.equal(readCorrectionJournal(path).length, 1);
    writeFileSync(path, JSON.stringify(record));
    assert.throws(() => readCorrectionJournal(path), /TRUNCATED/);
    writeFileSync(
      path,
      JSON.stringify({ ...record, stage: "START_COMMITTED" }) + "\n",
    );
    assert.throws(() => readCorrectionJournal(path), /JOURNAL_HASH/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
for (const alreadyWritten of [0, 1, 2, 3])
  test(
    "persistence recovers after " +
      alreadyWritten +
      " files without repeating other writes",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "correction-transaction-"));
      const names = {
        task: CORRECTION.successor + ".task.json",
        context: CORRECTION.successor + ".context-pack.json",
        leases: "capability-leases.json",
      };
      const transaction = Object.fromEntries(
        Object.keys(names).map((name) => [
          name,
          {
            before: null,
            bytes:
              JSON.stringify({ fixture: name, unrelatedLease: "preserved" }) +
              "\n",
          },
        ]),
      );
      try {
        Object.entries(names)
          .slice(0, alreadyWritten)
          .forEach(([name, path]) =>
            writeFileSync(join(directory, path), transaction[name].bytes),
          );
        persistCorrectionTransaction(directory, transaction);
        for (const [name, path] of Object.entries(names))
          assert.equal(
            readFileSync(join(directory, path), "utf8"),
            transaction[name].bytes,
          );
        persistCorrectionTransaction(directory, transaction);
        writeFileSync(
          join(directory, names.leases),
          '{"anotherTask":"changed"}\n',
        );
        assert.throws(
          () => persistCorrectionTransaction(directory, transaction),
          /TRANSACTION_CONFLICT:leases/,
        );
        assert.equal(
          readFileSync(join(directory, names.leases), "utf8"),
          '{"anotherTask":"changed"}\n',
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

async function runtimeFixture() {
  const directory = mkdtempSync(join(tmpdir(), "correction-runtime-fixture-"));
  const root = join(directory, "work"),
    predecessorState = join(directory, "predecessor");
  mkdirSync(root);
  mkdirSync(predecessorState);
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const write = (path, value) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value) + "\n",
    );
  };
  git("init");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  write("README.md", "Isolated test fixture; no runtime evidence.\n");
  git("add", ".");
  git("commit", "-m", "fixture predecessor base");
  const f = await fixture([], true, git("rev-parse", "HEAD"));
  f.claimRegistry.claims[CORRECTION.successor].expiresAt = new Date(
    Date.now() + 7200000,
  ).toISOString();
  git("checkout", "-b", CORRECTION.branch);
  const history = grantHistory(f, false);
  history[0].grant.issuedAt = new Date(Date.now() - 5000).toISOString();
  history[0].grant.expiresAt = new Date(Date.now() + 3600000).toISOString();
  write(".github/morro-control/claims.json", f.claimRegistry);
  write(".github/morro-control/events.ndjson", "");
  write(".morro/changesets/" + CORRECTION.successor + ".json", f.successor);
  write(CORRECTION.path, history[0].grant);
  // Simulated scheduler executable: production uses the repository scheduler.
  write(
    "tooling/mdctl/mdctl.mjs",
    "import fs from 'node:fs';const m=JSON.parse(fs.readFileSync(process.argv[3]));console.log(JSON.stringify({dispatchAllowed:true,violations:[],grants:[{id:m.id,exactBaseSha:m.baseSha}]}));\n",
  );
  git("add", ".");
  git("commit", "-m", "fixture issued grant");
  let main = git("rev-parse", "HEAD");
  history[0].commitSha = main;
  for (const [path, value] of [
    [CORRECTION.predecessor + ".task.json", f.task],
    [CORRECTION.predecessor + ".handoff.json", f.handoff],
    ["capability-leases.json", f.leaseRegistry],
  ])
    writeFileSync(join(predecessorState, path), JSON.stringify(value));
  const historicalManifest = join(directory, "historical.json");
  writeFileSync(historicalManifest, JSON.stringify(f.changeSet));
  const options = { root, predecessorState, historicalManifest };
  const config = providerFixture(f, history, main);
  config.runtimeFixture = true;
  function consume(receipt, configPath) {
    const grant = {
      ...structuredClone(history[0].grant),
      state: "CONSUMED",
      reservation: {
        key: receipt.key,
        commitSha: receipt.commitSha,
        issuedCommitSha: receipt.issuedCommitSha,
      },
    };
    write(CORRECTION.path, grant);
    git("add", CORRECTION.path);
    git("commit", "-m", "fixture governed consumption");
    main = git("rev-parse", "HEAD");
    history.push({ commitSha: main, grant });
    const configuration = JSON.parse(readFileSync(configPath));
    configuration.responses = providerFixture(f, history, main).responses;
    writeFileSync(configPath, JSON.stringify(configuration));
    const manifest = { ...structuredClone(f.successor), baseSha: main };
    const registry = structuredClone(f.claimRegistry);
    registry.claims[CORRECTION.successor].baseSha = main;
    write(".morro/changesets/" + CORRECTION.successor + ".json", manifest);
    write(".github/morro-control/claims.json", registry);
    write(
      ".github/morro-control/events.ndjson",
      JSON.stringify({
        schemaVersion: 1,
        eventId: "evt-fixture-reanchor",
        eventType: "CLAIM_RENEWED",
        observedAt: new Date().toISOString(),
        actor: "ORCHESTRATOR",
        entity: CORRECTION.successor,
        sourceSha: main,
        payloadVersion: 1,
        payload: {
          currentBaseSha: main,
          currentBranch: CORRECTION.branch,
          authorityScopeChanged: false,
        },
      }) + "\n",
    );
    git("add", ".");
    git("commit", "-m", "fixture canonical reanchor");
  }
  return {
    directory,
    root,
    f,
    history,
    options,
    config,
    consume,
    transactionDir: join(
      root,
      ".git/morro-control/correction-transactions",
      correctionKey(f.handoff.digest),
    ),
  };
}
test("runtime prepares, waits for governed consumption, and starts the real identity pair once", async () => {
  const f = await runtimeFixture();
  try {
    withProvider(f.config, ({ configPath, statePath }) => {
      const original = readFileSync(
        join(f.options.predecessorState, CORRECTION.predecessor + ".task.json"),
        "utf8",
      );
      const receipt = runCorrectionRuntime({ ...f.options, action: "prepare" });
      assert.equal(receipt.workerStarted, false);
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "start" }),
        /CONSUMPTION_REQUIRED/,
      );
      f.consume(receipt, configPath);
      const started = runCorrectionRuntime({ ...f.options, action: "start" });
      assert.equal(started.workerStarted, true);
      assert.equal(
        JSON.parse(readFileSync(started.taskPath)).owner,
        CORRECTION.executor,
      );
      assert.equal(started.supersedes.handoffDigest, f.f.handoff.digest);
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "start" }),
        /START_ALREADY_ATTEMPTED/,
      );
      const recovered = runCorrectionRuntime({
        ...f.options,
        action: "recover",
      });
      assert.equal(recovered.workerStarted, false);
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
      assert.equal(
        readFileSync(
          join(
            f.options.predecessorState,
            CORRECTION.predecessor + ".task.json",
          ),
          "utf8",
        ),
        original,
      );
    });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
for (const timeoutRefNumber of [1, 2])
  test(
    "runtime never resends accepted ref POST after timeout " + timeoutRefNumber,
    async () => {
      const f = await runtimeFixture();
      f.config.timeoutRefNumber = timeoutRefNumber;
      try {
        withProvider(f.config, ({ configPath, statePath }) => {
          let receipt;
          if (timeoutRefNumber === 1) {
            assert.throws(
              () => runCorrectionRuntime({ ...f.options, action: "prepare" }),
              /Command failed/,
            );
            assert.throws(
              () => runCorrectionRuntime({ ...f.options, action: "prepare" }),
              /ALREADY_ATTEMPTED/,
            );
            assert.equal(
              runCorrectionRuntime({ ...f.options, action: "recover" })
                .workerStarted,
              false,
            );
            const journal = readCorrectionJournal(
              join(f.transactionDir, "journal.ndjson"),
            );
            receipt = {
              key: correctionKey(f.f.handoff.digest),
              commitSha: journal[0].value.commitSha,
              issuedCommitSha: f.history[0].commitSha,
            };
          } else
            receipt = runCorrectionRuntime({ ...f.options, action: "prepare" });
          f.consume(receipt, configPath);
          if (timeoutRefNumber === 2) {
            assert.throws(
              () => runCorrectionRuntime({ ...f.options, action: "start" }),
              /Command failed/,
            );
            assert.throws(
              () => runCorrectionRuntime({ ...f.options, action: "start" }),
              /START_ALREADY_ATTEMPTED/,
            );
            assert.equal(
              runCorrectionRuntime({ ...f.options, action: "recover" })
                .workerStarted,
              false,
            );
          } else
            assert.equal(
              runCorrectionRuntime({ ...f.options, action: "start" })
                .workerStarted,
              true,
            );
          assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
        });
      } finally {
        rmSync(f.directory, { recursive: true, force: true });
      }
    },
  );
test("consumption survives loss of both reservation refs and journal without reopening start", async () => {
  const f = await runtimeFixture();
  try {
    withProvider(f.config, ({ configPath, statePath }) => {
      const receipt = runCorrectionRuntime({ ...f.options, action: "prepare" });
      f.consume(receipt, configPath);
      runCorrectionRuntime({ ...f.options, action: "start" });
      rmSync(join(f.transactionDir, "journal.ndjson"));
      const state = JSON.parse(readFileSync(statePath));
      state.refs = {};
      writeFileSync(statePath, JSON.stringify(state));
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "prepare" }),
        /ALREADY_CONSUMED/,
      );
      for (const action of ["start", "recover"])
        assert.throws(
          () => runCorrectionRuntime({ ...f.options, action }),
          /ORIGINAL_JOURNAL_REQUIRED/,
        );
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
    });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
test("recover after identity changes cannot persist or start a replacement", async () => {
  const f = await runtimeFixture();
  f.config.timeoutRefNumber = 2;
  try {
    withProvider(f.config, ({ configPath, statePath }) => {
      const receipt = runCorrectionRuntime({ ...f.options, action: "prepare" });
      f.consume(receipt, configPath);
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "start" }),
        /Command failed/,
      );
      writeFileSync(join(f.root, "README.md"), "changed candidate\n");
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "recover" }),
        /IDENTITY_CHANGED/,
      );
      assert.equal(
        existsSync(join(f.transactionDir, CORRECTION.successor + ".task.json")),
        false,
      );
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
    });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});

import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
test("runtime lock excludes a separate process, including when the owner holds it", () => {
  const directory = mkdtempSync(join(tmpdir(), "correction-process-lock-"));
  const moduleUrl = new URL(
    "../mdctl/task-correction-runtime.mjs",
    import.meta.url,
  ).href;
  try {
    withCorrectionLock(directory, () => {
      const script =
        "import assert from 'node:assert/strict';import {withCorrectionLock} from " +
        JSON.stringify(moduleUrl) +
        ";assert.throws(()=>withCorrectionLock(process.argv[1],()=>assert.fail('concurrent effect')),/EEXIST/);";
      execFileSync(
        process.execPath,
        ["--input-type=module", "-e", script, directory],
        { timeout: 10000 },
      );
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("runtime executable entrypoint prepares once with isolated provider and refuses replay", async () => {
  const f = await runtimeFixture();
  try {
    withProvider(f.config, ({ statePath }) => {
      const entry = new URL(
        "../mdctl/task-correction-runtime.mjs",
        import.meta.url,
      );
      const args = [
        entry.pathname,
        "prepare",
        f.root,
        f.options.predecessorState,
        f.options.historicalManifest,
      ];
      const result = JSON.parse(
        execFileSync(process.execPath, args, {
          encoding: "utf8",
          timeout: 30000,
        }),
      );
      assert.equal(result.state, "AWAITING_GOVERNED_CONSUMPTION");
      assert.equal(result.workerStarted, false);
      assert.throws(
        () =>
          execFileSync(process.execPath, args, {
            encoding: "utf8",
            timeout: 30000,
            stdio: ["ignore", "pipe", "pipe"],
          }),
        /CORRECTION_RESERVATION_ALREADY_ATTEMPTED/,
      );
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 1);
    });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
test("missing start ref cannot be recreated by recovery", async () => {
  const f = await runtimeFixture();
  f.config.timeoutRefNumber = 2;
  try {
    withProvider(f.config, ({ configPath, statePath }) => {
      const receipt = runCorrectionRuntime({ ...f.options, action: "prepare" });
      f.consume(receipt, configPath);
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "start" }),
        /Command failed/,
      );
      const state = JSON.parse(readFileSync(statePath));
      for (const name of Object.keys(state.refs))
        if (name.includes("tdp-task-correction-start")) delete state.refs[name];
      writeFileSync(statePath, JSON.stringify(state));
      assert.throws(
        () => runCorrectionRuntime({ ...f.options, action: "recover" }),
        /Command failed/,
      );
      assert.equal(JSON.parse(readFileSync(statePath)).refPosts, 2);
      assert.equal(
        existsSync(join(f.transactionDir, CORRECTION.successor + ".task.json")),
        false,
      );
    });
  } finally {
    rmSync(f.directory, { recursive: true, force: true });
  }
});
