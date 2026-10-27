import assert from "node:assert/strict";
import test from "node:test";
import {
  realpathSync,
  cpSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  existsSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import {
  CSS_ENTRY_ORDER_CORRECTION as C,
  CORRECTION,
  correctionEnvelope,
  correctionClaim,
  correctionDigest,
  correctionKey,
  validateCorrectionGrant,
  validateCorrectionHistory,
  assertCorrectionAuthority,
} from "../mdctl/task-correction-authority.mjs";
import {
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

test("non-Native workspace rejection is independent of cwd", async () => {
  const temporary = realpathSync(tmpdir());
  const parent = temporary.startsWith(C.nativeHome + "/worktrees/")
    ? realpathSync(dirname(C.nativeHome))
    : temporary;
  const root = mkdtempSync(join(parent, "non-native-correction-"));
  try {
    assert.equal(root.startsWith(C.nativeHome + "/worktrees/"), false);
    await assert.rejects(
      prepareCssEntryOrderCorrection({
        root,
        workspace: root,
        expectedMain: sha,
      }),
      /NATIVE_REQUIRED/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
for (const stage of [1, 2])
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
      assert.equal(existsSync(f.args.stateDir), false);
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

storageTest(
  "provider-time input mutation cannot publish a conventional successor",
  (f) => {
    let calls = 0;
    assert.throws(
      () =>
        persistCssCorrection({
          ...f.args,
          revalidate: () => {
            if (++calls === 2) writeFileSync(f.predecessor, '{"changed":true}');
          },
        }),
      /INPUT_CHANGED/,
    );
    assert.equal(existsSync(f.args.stateDir), false);
  },
);
storageTest(
  "prepared-byte corruption cannot publish a conventional successor",
  (f) => {
    let calls = 0;
    assert.throws(
      () =>
        persistCssCorrection({
          ...f.args,
          revalidate: () => {
            if (++calls === 2)
              writeFileSync(
                join(
                  f.args.stateDir + ".correction-pending",
                  C.successor + ".task.json",
                ),
                "{}",
              );
          },
        }),
      /PREPARED_READBACK/,
    );
    assert.equal(existsSync(f.args.stateDir), false);
    assert.deepEqual(readFileSync(f.predecessor), f.bytes);
  },
);
storageTest("last local freshness failure remains before publication", (f) => {
  assert.throws(
    () =>
      persistCssCorrection({
        ...f.args,
        revalidate: () => () => {
          throw Error("EXPIRED_BEFORE_PUBLICATION");
        },
      }),
    /EXPIRED_BEFORE_PUBLICATION/,
  );
  assert.equal(existsSync(f.args.stateDir), false);
  assert.deepEqual(readFileSync(f.predecessor), f.bytes);
});

// Hermetic composition: real Git worktrees, real lifecycle/reanchor/authority
// validators and real atomic storage. Only immutable subject fixture anchors
// (paths/hashes) in a disposable copy of the profile are substituted. No gate,
// function or token factory is mocked; the gh executable is GET-only and local.
async function composedFixture(mode, action) {
  const { buildTaskStart, buildTaskTest, buildTaskSubmit } =
    await import("../mdctl/task-lifecycle.mjs");
  const { buildClaimReanchor } = await import("../mdctl/claim-lifecycle.mjs");
  const dir = mkdtempSync(join(tmpdir(), "css-composed-")),
    home = join(dir, "home");
  const root = join(home, "worktrees/controller"),
    common = join(home, "repos/touristic-digital-platform.git"),
    seedRoot = join(dir, "seed");
  const git = (w, ...args) =>
    execFileSync("git", ["-C", w, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = (w) => {
    git(w, "add", ".");
    git(
      w,
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    return git(w, "rev-parse", "HEAD");
  };
  const put = (p, v) => {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, typeof v === "string" ? v : JSON.stringify(v));
  };
  try {
    mkdirSync(seedRoot, { recursive: true });
    cpSync(
      fileURLToPath(new URL("..", import.meta.url)),
      join(seedRoot, "tooling"),
      { recursive: true },
    );
    assert.deepEqual(
      readFileSync(
        join(seedRoot, "tooling/mdctl/css-entry-order-correction-runtime.mjs"),
      ),
      readFileSync(
        new URL(
          "../mdctl/css-entry-order-correction-runtime.mjs",
          import.meta.url,
        ),
      ),
    );
    git(seedRoot, "init", "-q", "-b", "main");
    const seed = commit(seedRoot);
    mkdirSync(dirname(common), { recursive: true });
    execFileSync("git", ["clone", "--bare", "--quiet", seedRoot, common]);
    mkdirSync(dirname(root), { recursive: true });
    git(common, "worktree", "add", "--quiet", root, "main");
    const source = join(home, "worktrees", C.predecessorDirectory),
      workspace = join(
        home,
        "worktrees",
        C.successor + "-fixture-000000000001",
      );
    git(
      common,
      "worktree",
      "add",
      "--quiet",
      "-b",
      "fixture-predecessor",
      source,
      seed,
    );
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../../.morro/changesets/MD-CSS-ENTRY-ORDER-SUCCESSION-AUTHORITY-20261025.json",
          import.meta.url,
        ),
      ),
    );
    Object.assign(manifest, {
      id: C.predecessor,
      branch: "fixture-predecessor",
      baseSha: seed,
      scope: "DESTINATION:MORRO",
    });
    manifest.owns.paths = [
      ".morro/changesets/" + C.predecessor + ".json",
      C.productPath,
    ];
    put(join(source, manifest.owns.paths[0]), manifest);
    put(join(source, C.productPath), "fixture product bytes\n");
    const handoffSha = commit(source);
    const identity = {
      headSha: handoffSha,
      treeSha: git(source, "rev-parse", "HEAD^{tree}"),
      branch: manifest.branch,
      baseIsAncestor: true,
      dirty: false,
    };
    const now = Date.now(),
      stamp = (n) => new Date(now + n).toISOString();
    let serial = 0;
    const started = buildTaskStart({
      changeSet: manifest,
      owner: C.executor,
      identity,
      now: stamp(-3000),
      idFactory: () => "fixture-" + ++serial,
    });
    const tested = await buildTaskTest({
      task: started.task,
      changeSet: manifest,
      leaseRegistry: started.leaseRegistry,
      identity,
      now: stamp(-2000),
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
      now: stamp(-1000),
    });
    const sourceState = git(source, "rev-parse", "--git-path", "morro-control");
    const values = {
      [C.predecessor + ".task.json"]: submitted.task,
      [C.predecessor + ".handoff.json"]: submitted.handoff,
      [C.predecessor + ".context-pack.json"]: tested.contextPack,
      "capability-leases.json": submitted.leaseRegistry,
    };
    for (const [name, v] of Object.entries(values))
      put(join(sourceState, name), v);
    put(join(source, manifest.owns.paths[0]), {
      ...manifest,
      state: "LOCAL_PROVEN",
    });
    const preservedSha = commit(source);
    const pins = {
      nativeHome: home,
      taskDigest: correctionDigest(submitted.task),
      handoffDigest: submitted.handoff.digest,
      manifestDigest: submitted.task.changeSetDigest,
      handoffSha,
      preservedSha,
      productBlob: git(source, "rev-parse", "HEAD:" + C.productPath),
    };
    const ap = join(root, "tooling/mdctl/task-correction-authority.mjs");
    let code = readFileSync(ap, "utf8");
    for (const [k, v] of Object.entries(pins)) {
      assert.ok(code.includes(JSON.stringify(C[k])));
      code = code.replace(JSON.stringify(C[k]), JSON.stringify(v));
    }
    writeFileSync(ap, code);
    const successor = {
      ...structuredClone(manifest),
      id: C.successor,
      branch: C.branch,
    };
    successor.owns.paths = [
      ".morro/changesets/" + C.successor + ".json",
      C.productPath,
    ];
    const claim = {
      owner: C.owner,
      reviewer: "AUTOMATED-INDEPENDENT-PROOF",
      baseSha: seed,
      branch: C.branch,
      paths: successor.owns.paths,
      domains: ["control-plane"],
      risk: "P0",
      status: "IMPLEMENTING",
      expiresAt: stamp(600000),
    };
    const registry = {
      registryAuthority: "ORCHESTRATOR",
      claims: { [C.successor]: claim },
    };
    const rp = ".github/morro-control/claims.json",
      ep = ".github/morro-control/events.ndjson",
      mp = successor.owns.paths[0];
    put(join(root, mp), successor);
    put(join(root, rp), registry);
    put(join(root, ep), "");
    const main = commit(root);
    git(common, "worktree", "add", "--quiet", "-b", C.branch, workspace, main);
    const reanchor = buildClaimReanchor({
      registry,
      ledgerText: "",
      manifest: successor,
      newBaseSha: main,
      observedAt: stamp(0),
    });
    put(join(workspace, mp), reanchor.manifest);
    put(join(workspace, rp), reanchor.registry);
    put(join(workspace, ep), reanchor.ledgerText);
    commit(workspace);
    const stateDir = git(workspace, "rev-parse", "--git-path", "morro-control");
    const g = {
      ...grant(),
      ...Object.fromEntries(
        ["taskDigest", "handoffDigest", "manifestDigest"].map((k) => [
          k,
          pins[k],
        ]),
      ),
      workspace,
      issuedAt: stamp(-500),
      expiresAt: stamp(600000),
      envelopeDigest: correctionDigest(correctionEnvelope(successor)),
      claimDigest: correctionDigest(correctionClaim(claim)),
    };
    const key = correctionKey(g.handoffDigest, C.successor),
      issued = "e".repeat(40),
      consumed = "c".repeat(40);
    const cg = {
      ...g,
      state: "CONSUMED",
      reservation: { key, commitSha: "d".repeat(40), issuedCommitSha: issued },
    };
    const blob = (v) => {
      const data = Buffer.from(JSON.stringify(v));
      return {
        type: "file",
        encoding: "base64",
        content: data.toString("base64"),
        sha: execFileSync("git", ["hash-object", "--stdin"], {
          input: data,
          encoding: "utf8",
        }).trim(),
      };
    };
    const prefix = "repos/" + C.repository;
    const responses = {
      [prefix + "/commits/main"]: { sha: main },
      [prefix +
      "/commits?sha=" +
      main +
      "&path=" +
      encodeURIComponent(C.path) +
      "&per_page=100&page=1"]: [{ sha: consumed }, { sha: issued }],
      [prefix + "/contents/" + C.path + "?ref=" + main]: blob(cg),
      [prefix + "/contents/" + C.path + "?ref=" + consumed]: blob(cg),
      [prefix + "/contents/" + C.path + "?ref=" + issued]: blob(g),
      [prefix + "/contents/" + rp + "?ref=" + main]: blob(registry),
      [prefix + "/contents/" + mp + "?ref=" + main]: blob(successor),
    };
    const cfg = join(dir, "provider.json"),
      calls = join(dir, "calls"),
      bin = join(dir, "bin");
    mkdirSync(bin);
    put(cfg, {
      responses,
      mode,
      calls,
      source,
      sourceState,
      stateDir,
      handoffSha,
      workspace,
    });
    put(
      join(bin, "gh"),
      `#!/usr/bin/env node
const fs=require('node:fs'),cp=require('node:child_process'),p=require('node:path');const c=JSON.parse(fs.readFileSync(${JSON.stringify(cfg)}));const a=process.argv.slice(2),target=a.find(x=>x.startsWith('repos/'));if(a[a.indexOf('--method')+1]!=='GET'||!Object.hasOwn(c.responses,target))process.exit(2);
if(target.endsWith('/commits/main')){const n=(fs.existsSync(c.calls)?Number(fs.readFileSync(c.calls)):0)+1;fs.writeFileSync(c.calls,String(n));
 if(n===6){if(c.mode==='provider-failure')process.exit(3);if(c.mode==='branch-drift')cp.execFileSync('git',['-C',c.workspace,'switch','-c','fixture-other']);if(c.mode==='identity-drift')cp.execFileSync('git',['-C',c.source,'update-ref','refs/heads/fixture-predecessor',c.handoffSha]);if(c.mode==='input-drift')fs.appendFileSync(p.join(c.sourceState,'${C.predecessor}.task.json'),' ');if(c.mode==='prepared-drift')fs.writeFileSync(p.join(c.stateDir+'.correction-pending','${C.successor}.task.json'),'{}');}}
process.stdout.write(JSON.stringify(c.responses[target]));`,
    );
    execFileSync("chmod", ["700", join(bin, "gh")]);
    const before = Object.keys(values).map((name) => ({
      path: join(sourceState, name),
      bytes: readFileSync(join(sourceState, name)),
    }));
    const run = () =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {prepareCssEntryOrderCorrection} from ${JSON.stringify(pathToFileURL(join(root, "tooling/mdctl/css-entry-order-correction-runtime.mjs")).href)};try{console.log(JSON.stringify(await prepareCssEntryOrderCorrection(${JSON.stringify({ root, workspace, expectedMain: main })})));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=2;}`,
        ],
        {
          encoding: "utf8",
          timeout: 30000,
          env: { ...process.env, PATH: bin + ":" + process.env.PATH },
        },
      );
    await action({
      run,
      before,
      stateDir,
      source,
      sourceState,
      workspace,
      main,
      submitted,
      inputs: values,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("composed Native fixture crosses real gates, publishes once and preserves predecessor", async () =>
  composedFixture("success", (f) => {
    const r = f.run();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(
      JSON.parse(r.stdout).state,
      "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
    );
    const task = JSON.parse(
      readFileSync(join(f.stateDir, C.successor + ".task.json")),
    );
    assert.equal(task.state, "STARTED");
    assert.equal(task.owner, C.executor);
    assert.equal(task.supersedes.handoffDigest, f.submitted.handoff.digest);
    for (const e of f.before) assert.deepEqual(readFileSync(e.path), e.bytes);
    const bytes = readFileSync(join(f.stateDir, C.successor + ".task.json"));
    const replay = f.run();
    assert.equal(replay.status, 2);
    assert.match(replay.stdout, /SUCCESSOR_STATE_EXISTS/);
    assert.deepEqual(
      readFileSync(join(f.stateDir, C.successor + ".task.json")),
      bytes,
    );
  }));
for (const [mode, code] of [
  ["provider-failure", /Command failed/],
  ["branch-drift", /TARGET_BRANCH_CHANGED/],
  ["identity-drift", /SOURCE_CHANGED/],
  ["input-drift", /INPUT_CHANGED/],
  ["prepared-drift", /PREPARED_READBACK/],
])
  test("composed final " + mode + " cannot publish", async () =>
    composedFixture(mode, (f) => {
      const r = f.run();
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stdout, code);
      assert.equal(existsSync(f.stateDir), false);
      for (const e of f.before) {
        const expected =
          mode === "input-drift" && e.path.endsWith(".task.json")
            ? Buffer.concat([e.bytes, Buffer.from(" ")])
            : e.bytes;
        assert.deepEqual(readFileSync(e.path), expected);
      }
    }),
  );
