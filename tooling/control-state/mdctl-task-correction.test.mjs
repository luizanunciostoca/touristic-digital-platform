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
    String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.env.CORRECTION_FIXTURE_CONFIG));
const args = process.argv.slice(2);
const path = args.find(value => value.startsWith('repos/'));
const method = args[args.indexOf('--method') + 1];
fs.appendFileSync(process.env.CORRECTION_FIXTURE_REQUESTS, JSON.stringify({ method, path }) + '\n');
if (method !== 'GET' || !Object.hasOwn(config.responses, path) || config.responses[path].fixtureError) {
  process.stderr.write('FIXTURE_REJECTED');
  process.exit(1);
}
process.stdout.write(JSON.stringify(config.responses[path]));
`,
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
    history = grantHistory(f);
  const before = structuredClone({
    task: f.task,
    leases: f.leaseRegistry,
    handoff: f.handoff,
  });
  withProvider(providerFixture(f, history), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
      now: f.now,
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
    h = grantHistory(f, false);
  withProvider(providerFixture(f, h), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
      now: f.now,
    });
    assert.throws(
      () => buildTaskCorrection({ ...f, authority }),
      /NOT_CONSUMED/,
    );
  });
});
test("branded token still rejects stale observation and forged reanchor certificate", async () => {
  const f = await fixture([], true);
  withProvider(providerFixture(f, grantHistory(f)), () => {
    const authority = collectCorrectionAuthority({
      expectedMain: f.successor.baseSha,
      now: f.now,
    });
    assert.throws(
      () =>
        buildTaskCorrection({ ...f, authority, now: "2026-10-01T09:11:00Z" }),
      /AUTHORITY_STALE/,
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
      config = providerFixture(f, grantHistory(f));
    mutate(config);
    withProvider(config, () =>
      assert.throws(
        () =>
          collectCorrectionAuthority({
            expectedMain: f.successor.baseSha,
            now: f.now,
          }),
        code,
      ),
    );
  });
