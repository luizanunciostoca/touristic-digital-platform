import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import {
  CSS_ENTRY_ORDER_CORRECTION as C,
  CORRECTION,
  correctionDigest,
  correctionKey,
  validateCorrectionGrant,
  validateCorrectionHistory,
  collectCorrectionAuthority,
  assertCorrectionAuthority,
} from "../mdctl/task-correction-authority.mjs";
import {
  readCssCorrectionCandidate,
  persistCssCorrection,
  prepareCssEntryOrderCorrection,
  validateCssCorrectionInputs,
} from "../mdctl/css-entry-order-correction-runtime.mjs";

const sha = "a".repeat(40),
  hash = "sha256:" + "b".repeat(64);
function grant() {
  return {
    schemaVersion: 1,
    kind: "TDP_CSS_ENTRY_ORDER_CORRECTION_DELEGATION",
    repository: C.repository,
    owner: C.owner,
    executor: C.executor,
    predecessor: C.predecessor,
    successor: C.successor,
    branch: C.branch,
    taskDigest: C.taskDigest,
    handoffDigest: C.handoffDigest,
    manifestDigest: C.manifestDigest,
    envelopeDigest: hash,
    claimDigest: hash,
    nonce: "fixture-css-grant-0000000001",
    issuedAt: "2026-10-25T03:00:00.000Z",
    expiresAt: "2026-10-25T03:30:00.000Z",
    state: "ISSUED",
    reservation: null,
    workspace:
      C.nativeHome + "/worktrees/" + C.successor + "-fixture-000000000001",
  };
}
function history() {
  const issued = grant();
  return [
    { commitSha: sha, grant: issued },
    {
      commitSha: "c".repeat(40),
      grant: {
        ...issued,
        state: "CONSUMED",
        reservation: {
          key: correctionKey(issued.handoffDigest, C.successor),
          commitSha: "d".repeat(40),
          issuedCommitSha: sha,
        },
      },
    },
  ];
}
test("one bounded profile uses existing history without creating authority", () => {
  assert.equal(validateCorrectionGrant(grant()).state, "ISSUED");
  const checked = validateCorrectionHistory(history(), "2026-10-25T03:01:00Z");
  assert.equal(checked.grant.state, "CONSUMED");
  assert.throws(() => assertCorrectionAuthority(checked, {}), /UNVERIFIED/);
  assert.notEqual(
    correctionKey(C.handoffDigest, C.successor),
    correctionKey(C.handoffDigest, CORRECTION.successor),
  );
});
for (const [name, mutate, code] of [
  ["owner", (g) => (g.owner = "RECOVERY"), /IDENTITY:owner/],
  ["executor", (g) => (g.executor = "RECOVERY"), /IDENTITY:executor/],
  ["pair", (g) => (g.predecessor = "MD-OTHER"), /IDENTITY:predecessor/],
  ["successor", (g) => (g.successor = "MD-OTHER"), /FIELDS|IDENTITY/],
  ["branch", (g) => (g.branch = "fix/other"), /IDENTITY:branch/],
  ["task digest", (g) => (g.taskDigest = hash), /PIN:taskDigest/],
  ["handoff digest", (g) => (g.handoffDigest = hash), /PIN:handoffDigest/],
  [
    "historical manifest",
    (g) => (g.manifestDigest = hash),
    /PIN:manifestDigest/,
  ],
  [
    "recovery workspace",
    (g) => (g.workspace = "/workspace/recovery"),
    /WORKSPACE/,
  ],
  ["traversal", (g) => (g.workspace += "/../other"), /WORKSPACE/],
  ["unknown field", (g) => (g.scope = "*"), /FIELDS/],
  ["validity", (g) => (g.expiresAt = "2026-10-25T03:30:01Z"), /VALIDITY/],
  ["empty validity", (g) => (g.expiresAt = g.issuedAt), /TIME/],
  [
    "consumed without reservation",
    (g) => (g.state = "CONSUMED"),
    /CONSUMPTION_REQUIRED/,
  ],
])
  test("grant rejects " + name, () => {
    const g = grant();
    mutate(g);
    assert.throws(() => validateCorrectionGrant(g), code);
  });
for (const [name, mutate, code] of [
  ["expiration", (h) => {}, /EXPIRED/],
  [
    "revocation",
    (h) =>
      h.push({
        commitSha: "e".repeat(40),
        grant: { ...h[1].grant, state: "REVOKED" },
      }),
    /REVOKED/,
  ],
  [
    "reuse",
    (h) =>
      h.push({ commitSha: "e".repeat(40), grant: structuredClone(h[1].grant) }),
    /TRANSITION/,
  ],
  [
    "workspace change",
    (h) => (h[1].grant.workspace += "-other"),
    /IDENTITY_CHANGED/,
  ],
  [
    "double reservation",
    (h) => (h[1].grant.reservation.key = "f".repeat(64)),
    /RESERVATION_KEY/,
  ],
  [
    "wrong issuance",
    (h) => (h[1].grant.reservation.issuedCommitSha = "f".repeat(40)),
    /CONSUMPTION_ISSUANCE/,
  ],
])
  test("history rejects " + name, () => {
    const h = history();
    mutate(h);
    assert.throws(
      () =>
        validateCorrectionHistory(
          h,
          name === "expiration"
            ? "2026-10-25T03:30:00Z"
            : "2026-10-25T03:01:00Z",
        ),
      code,
    );
  });

test("recovery cannot use the Native adapter", async () => {
  await assert.rejects(
    prepareCssEntryOrderCorrection({
      root: process.cwd(),
      workspace: process.cwd(),
      expectedMain: sha,
    }),
    /NATIVE_REQUIRED/,
  );
});
test("caller cannot forge predecessor bytes even with historical owner and ID", () => {
  assert.throws(
    () => validateCssCorrectionInputs(inputFixture()),
    /TASK_DIGEST/,
  );
});

function storeFixture() {
  const root = mkdtempSync(join(tmpdir(), "css-correction-storage-"));
  const common = join(root, "common"),
    parent = join(root, "worktree");
  mkdirSync(common);
  mkdirSync(parent);
  const predecessor = join(root, "predecessor.json"),
    bytes = Buffer.from('{"state":"SUBMITTED"}\n');
  writeFileSync(predecessor, bytes);
  const proposal = {
    task: { changeSetId: C.successor, state: "STARTED" },
    contextPack: { fixture: true },
    leaseRegistry: { leases: {} },
  };
  return {
    root,
    predecessor,
    bytes,
    args: {
      common,
      stateDir: join(parent, "morro-control"),
      key: "a".repeat(64),
      proposal,
      inputs: [{ path: predecessor, bytes }],
      revalidate: () => {},
    },
  };
}
function storageTest(name, body) {
  test(name, async () => {
    const f = storeFixture();
    try {
      await body(f);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
}
storageTest(
  "atomic canonical files and predecessor immutable; no handoff or dispatch",
  (f) => {
    const before = readFileSync(f.predecessor);
    const result = persistCssCorrection(f.args);
    assert.equal(
      result.state,
      "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
    );
    assert.deepEqual(
      readdirSync(f.args.stateDir).sort(),
      [
        C.successor + ".context-pack.json",
        C.successor + ".task.json",
        "capability-leases.json",
      ].sort(),
    );
    assert.equal(
      JSON.parse(
        readFileSync(join(f.args.stateDir, C.successor + ".task.json")),
      ).changeSetId,
      C.successor,
    );
    assert.deepEqual(readFileSync(f.predecessor), before);
    assert.equal(
      existsSync(join(f.args.common, "css-started-transfer.lock")),
      false,
    );
  },
);
storageTest("replay cannot rewrite successor or reuse reservation", (f) => {
  persistCssCorrection(f.args);
  const before = readFileSync(
    join(f.args.stateDir, C.successor + ".task.json"),
  );
  assert.throws(() => persistCssCorrection(f.args), /SUCCESSOR_STATE_EXISTS/);
  assert.deepEqual(
    readFileSync(join(f.args.stateDir, C.successor + ".task.json")),
    before,
  );
});
storageTest("same reservation rejects a second destination", (f) => {
  persistCssCorrection(f.args);
  assert.throws(
    () =>
      persistCssCorrection({
        ...f.args,
        stateDir: f.args.stateDir + "-second",
      }),
    /RESERVATION_REPLAY/,
  );
  assert.equal(existsSync(f.args.stateDir + "-second"), false);
});
storageTest("concurrent holder cannot enter shared Native lock", (f) => {
  mkdirSync(join(f.args.common, "css-started-transfer.lock"));
  assert.throws(() => persistCssCorrection(f.args), /EEXIST/);
  assert.equal(existsSync(f.args.stateDir), false);
});
storageTest(
  "input drift before write retains lock without destination",
  (f) => {
    writeFileSync(f.predecessor, '{"changed":true}');
    assert.throws(() => persistCssCorrection(f.args), /INPUT_CHANGED/);
    assert.equal(existsSync(f.args.stateDir), false);
    assert.equal(
      existsSync(join(f.args.common, "css-started-transfer.lock")),
      true,
    );
  },
);
for (const stage of [1, 2, 3])
  storageTest(
    "revalidation failure stage " +
      stage +
      " never returns success or removes lock",
    (f) => {
      let count = 0;
      assert.throws(
        () =>
          persistCssCorrection({
            ...f.args,
            revalidate: () => {
              if (++count === stage) throw Error("FIXTURE_REVALIDATION_FAILED");
            },
          }),
        /FIXTURE_REVALIDATION_FAILED/,
      );
      assert.deepEqual(readFileSync(f.predecessor), f.bytes);
      assert.equal(
        existsSync(join(f.args.common, "css-started-transfer.lock")),
        true,
      );
      if (stage < 3) assert.equal(existsSync(f.args.stateDir), false);
      else assert.equal(readdirSync(f.args.stateDir).length, 3);
    },
  );
storageTest("pending transaction is not cleaned up or overwritten", (f) => {
  mkdirSync(f.args.stateDir + ".correction-pending");
  assert.throws(() => persistCssCorrection(f.args), /PENDING_RECONCILIATION/);
});
storageTest(
  "cross-process race permits at most one successful publication",
  (f) => {
    const module = new URL(
      "../mdctl/css-entry-order-correction-runtime.mjs",
      import.meta.url,
    ).href;
    // Separate processes race on the real filesystem lock; no provider calls.
    const script = `import {persistCssCorrection} from ${JSON.stringify(module)};\nimport fs from 'node:fs';\nconst a=JSON.parse(fs.readFileSync(process.argv[1]));a.inputs=a.inputs.map(e=>({...e,bytes:Buffer.from(e.bytes)}));a.revalidate=()=>{};try{persistCssCorrection(a);process.exitCode=0;}catch{process.exitCode=2;}`;
    const cfg = join(f.root, "args.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        ...f.args,
        inputs: f.args.inputs.map((e) => ({ ...e, bytes: [...e.bytes] })),
      }),
    );
    const runner = `import {spawn} from 'node:child_process'; const jobs=[0,1].map(()=>new Promise(r=>{const p=spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(script)},${JSON.stringify(cfg)}],{stdio:'ignore'});p.on('exit',r);}));console.log(JSON.stringify(await Promise.all(jobs)));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", runner],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout).sort(), [0, 2]);
    assert.deepEqual(readFileSync(f.predecessor), f.bytes);
  },
);

function inputFixture() {
  const g = grant();
  return {
    task: {
      changeSetId: C.predecessor,
      owner: C.executor,
      state: "SUBMITTED",
      candidateSha: C.handoffSha,
    },
    changeSet: {},
    handoff: { digest: C.handoffDigest, candidateSha: C.handoffSha },
    successor: {
      id: C.successor,
      branch: C.branch,
      owns: {
        paths: [".morro/changesets/" + C.successor + ".json", C.productPath],
      },
    },
    leaseRegistry: {
      leases: { old: { changeSetId: C.predecessor, state: "RELEASED" } },
    },
    sourceIdentity: {
      workspace: C.nativeHome + "/worktrees/" + C.predecessorDirectory,
      headSha: C.preservedSha,
      productBlob: C.productBlob,
    },
    workspace: g.workspace,
    grant: g,
  };
}
for (const [name, mutate, code] of [
  [
    "unreleased expired lease",
    (f) => (f.leaseRegistry.leases.old.state = "ACTIVE"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "EXPIRED is not RELEASED",
    (f) => (f.leaseRegistry.leases.old.state = "EXPIRED"),
    /LEASE_NOT_RELEASED/,
  ],
  [
    "missing leases",
    (f) => (f.leaseRegistry.leases = {}),
    /LEASE_NOT_RELEASED/,
  ],
  ["expanded path", (f) => f.successor.owns.paths.push("apps/**"), /PATHS/],
  [
    "wrong workspace",
    (f) => (f.workspace = "/workspace/recovery"),
    /WORKSPACE_BINDING/,
  ],
  [
    "wrong source workspace",
    (f) => (f.sourceIdentity.workspace = "/workspace/old"),
    /PREDECESSOR_WORKSPACE/,
  ],
  [
    "preserved candidate as handoff",
    (f) => (f.handoff.candidateSha = C.preservedSha),
    /HANDOFF_SHA/,
  ],
  ["wrong candidate", (f) => (f.sourceIdentity.headSha = sha), /PRESERVED_SHA/],
  [
    "changed product",
    (f) => (f.sourceIdentity.productBlob = sha),
    /PRODUCT_BLOB/,
  ],
])
  test("P2 boundary rejects " + name, () => {
    const f = inputFixture();
    mutate(f);
    assert.throws(() => validateCssCorrectionInputs(f), code);
  });

function providerFixture(action, mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "css-grant-provider-"));
  const now = Date.now(),
    g = {
      ...grant(),
      issuedAt: new Date(now - 1000).toISOString(),
      expiresAt: new Date(now + 600000).toISOString(),
    };
  const successor = {
    id: C.successor,
    baseSha: sha,
    branch: C.branch,
    scope: "DESTINATION:MORRO",
    owns: {
      paths: [".morro/changesets/" + C.successor + ".json", C.productPath],
    },
  };
  const claim = {
    owner: C.owner,
    branch: C.branch,
    paths: successor.owns.paths,
    expiresAt: g.expiresAt,
  };
  const { id, baseSha, branch, ...envelope } = successor;
  g.envelopeDigest = correctionDigest(envelope);
  g.claimDigest = correctionDigest(claim);
  const consumed = {
    ...g,
    state: "CONSUMED",
    reservation: {
      key: correctionKey(C.handoffDigest, C.successor),
      commitSha: "d".repeat(40),
      issuedCommitSha: sha,
    },
  };
  const config = { main: sha, grant: g, consumed, claim, successor };
  mutate(config);
  const cfg = join(root, "fixture.json");
  writeFileSync(cfg, JSON.stringify(config));
  writeFileSync(
    join(root, "gh"),
    `#!/usr/bin/env node
const fs=require('node:fs'),crypto=require('node:crypto');
const c=JSON.parse(fs.readFileSync(${JSON.stringify(cfg)}));
const args=process.argv.slice(2),path=args.find(v=>v.startsWith('repos/'));
if(args[args.indexOf('--method')+1]!=='GET')process.exit(2);
const blob=v=>{const b=Buffer.from(JSON.stringify(v));return {type:'file',encoding:'base64',content:b.toString('base64'),sha:crypto.createHash('sha1').update('blob '+b.length+'\\0').update(b).digest('hex')};};
let value;
const issued='${"e".repeat(40)}', consumed='${"c".repeat(40)}';
if(path.endsWith('/commits/main'))value={sha:c.main};
else if(path.includes('/commits?'))value=c.absent?[]:c.issuedOnly?[{sha:issued}]:[{sha:consumed},{sha:issued}];
else if(path.includes('/contents/${C.path}'))value=blob(c.issuedOnly||path.endsWith('ref='+issued)?c.grant:{...c.consumed,reservation:{...c.consumed.reservation,issuedCommitSha:issued}});
else if(path.includes('/contents/.github/morro-control/claims.json'))value=blob({registryAuthority:'ORCHESTRATOR',claims:{'${C.successor}':c.claim}});
else if(path.includes('/contents/.morro/changesets/'))value=blob(c.successor);
else process.exit(3);
process.stdout.write(JSON.stringify(value));
`,
    { mode: 0o700 },
  );
  const old = process.env.PATH;
  process.env.PATH = root + ":" + old;
  try {
    return action(config);
  } finally {
    process.env.PATH = old;
    rmSync(root, { recursive: true, force: true });
  }
}
test("authenticated provider fixture brands the bounded CSS profile without issuing anything", () => {
  providerFixture(() => {
    const token = collectCorrectionAuthority({
      expectedMain: sha,
      successor: C.successor,
    });
    assert.equal(token.grant.successor, C.successor);
    assert.equal(token.grant.state, "CONSUMED");
  });
});
for (const [name, mutate, code] of [
  ["changed main", (c) => (c.main = "f".repeat(40)), /MAIN_MOVED/],
  [
    "expanded canonical paths",
    (c) => (c.claim.paths = ["apps/**"]),
    /CLAIM_CHANGED|CLAIM_PATHS/,
  ],
  [
    "claim expired",
    (c) => (c.claim.expiresAt = "2020-01-01T00:00:00Z"),
    /CLAIM_EXPIRED/,
  ],
  ["owner mismatch", (c) => (c.claim.owner = "RECOVERY"), /CANONICAL_OWNER/],
  [
    "grant revoked",
    (c) => (c.consumed.state = "REVOKED"),
    /REVOKED|REVOCATION/,
  ],
])
  test("authenticated read rejects " + name, () =>
    providerFixture(
      () =>
        assert.throws(
          () =>
            collectCorrectionAuthority({
              expectedMain: sha,
              successor: C.successor,
            }),
          code,
        ),
      mutate,
    ),
  );

test("absent grant cannot create an authority token", () =>
  providerFixture(
    () =>
      assert.throws(
        () =>
          collectCorrectionAuthority({
            expectedMain: sha,
            successor: C.successor,
          }),
        /HISTORY_REQUIRED/,
      ),
    (c) => (c.absent = true),
  ));
test("genuine ISSUED token cannot authorize persistence preparation", () =>
  providerFixture(
    () => {
      const token = collectCorrectionAuthority({
        expectedMain: sha,
        successor: C.successor,
      });
      assert.throws(() => assertCorrectionAuthority(token, {}), /NOT_CONSUMED/);
    },
    (c) => (c.issuedOnly = true),
  ));

test("adapter admits only the existing committed reanchor proof", async () => {
  const { buildClaimReanchor } = await import("../mdctl/claim-lifecycle.mjs");
  const root = mkdtempSync(join(tmpdir(), "css-reanchor-fixture-"));
  const git = (...args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = () => {
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  try {
    git("init", "-q", "-b", C.branch);
    writeFileSync(join(root, "seed"), "fixture");
    const seed = commit();
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../.morro/changesets/MD-CSS-ENTRY-ORDER-SUCCESSION-AUTHORITY-20261025.json",
          import.meta.url,
        ),
      ),
    );
    manifest.id = C.successor;
    manifest.branch = C.branch;
    manifest.baseSha = seed;
    manifest.owns.paths = [
      ".morro/changesets/" + C.successor + ".json",
      C.productPath,
    ];
    const registry = {
      registryAuthority: "ORCHESTRATOR",
      claims: {
        [C.successor]: {
          owner: C.owner,
          reviewer: "AUTOMATED-INDEPENDENT-PROOF",
          branch: C.branch,
          baseSha: seed,
          paths: manifest.owns.paths,
          domains: ["ci-release"],
          risk: "P0",
          status: "IMPLEMENTING",
          expiresAt: "2026-10-25T04:59:59Z",
        },
      },
    };
    const mp = join(root, ".morro/changesets/" + C.successor + ".json"),
      rp = join(root, ".github/morro-control/claims.json"),
      ep = join(root, ".github/morro-control/events.ndjson");
    mkdirSync(join(root, ".morro/changesets"), { recursive: true });
    mkdirSync(join(root, ".github/morro-control"), { recursive: true });
    writeFileSync(mp, JSON.stringify(manifest));
    writeFileSync(rp, JSON.stringify(registry));
    writeFileSync(ep, "");
    const base = commit();
    const authority = {
      successor: manifest,
      claim: registry.claims[C.successor],
    };
    assert.throws(
      () =>
        readCssCorrectionCandidate({
          workspace: root,
          expectedMain: base,
          authority,
          identity: { headSha: base },
        }),
      /CANDIDATE_BASE/,
    );
    const transition = buildClaimReanchor({
      registry,
      ledgerText: "",
      manifest,
      newBaseSha: base,
      observedAt: "2026-10-25T03:00:00Z",
    });
    writeFileSync(mp, JSON.stringify(transition.manifest));
    writeFileSync(rp, JSON.stringify(transition.registry));
    writeFileSync(ep, transition.ledgerText);
    const head = commit();
    const result = readCssCorrectionCandidate({
      workspace: root,
      expectedMain: base,
      authority,
      identity: { headSha: head },
    });
    assert.equal(result.successor.baseSha, base);
    assert.equal(result.reanchorProof.headSha, head);
    assert.deepEqual(result.registry, transition.registry);
    const expanded = structuredClone(transition.registry);
    expanded.claims[C.successor].paths.push("apps/**");
    writeFileSync(rp, JSON.stringify(expanded));
    const bad = commit();
    assert.throws(
      () =>
        readCssCorrectionCandidate({
          workspace: root,
          expectedMain: base,
          authority,
          identity: { headSha: bad },
        }),
      /ONLY_TARGET_BASE_MAY_CHANGE/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
