import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TRANSFER_SUBJECTS,
  TRANSFER_EXECUTOR,
  TRANSFER_REPOSITORY,
  taskTransferDigest,
  taskTransferAfter,
  validateTaskTransfer,
  persistTaskTransfer,
  runTaskTransferCli,
} from "../mdctl/task-transfer.mjs";
import { changeSetDigest } from "../mdctl/changeset-v2.mjs";

const now = "2026-10-24T06:00:00.000Z";
function fixture(id = Object.keys(TRANSFER_SUBJECTS)[0]) {
  const subject = TRANSFER_SUBJECTS[id];
  const manifest = JSON.parse(
    readFileSync(
      new URL("../../.morro/changesets/" + id + ".json", import.meta.url),
    ),
  );
  const leaseId = "lease-transfer-fixture";
  const task = {
    schemaVersion: 1,
    kind: "TDP_TASK_STATE",
    taskId: "task-" + id,
    changeSetId: id,
    changeSetDigest: changeSetDigest(manifest),
    owner: subject.owner,
    branch: subject.branch,
    baseSha: manifest.baseSha,
    state: "STARTED",
    candidateSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    contextPackDigest: "sha256:" + "c".repeat(64),
    leaseIds: [leaseId],
    startedAt: "2026-10-22T12:00:00.000Z",
    testedAt: null,
    submittedAt: null,
    localProof: null,
    handoffDigest: null,
  };
  const claim = {
    owner: "CHATGPT-PRO-CONTROL",
    branch: subject.branch,
    status: "IMPLEMENTING",
    expiresAt: "2026-10-24T12:00:00.000Z",
    paths: manifest.owns.paths,
  };
  const leases = {
    schemaVersion: 1,
    authority: "TASK_LOCAL_PROJECTION",
    leases: {
      [leaseId]: {
        leaseId,
        changeSetId: id,
        owner: task.owner,
        capability: "github:read",
        scope: manifest.scope,
        branch: task.branch,
        issuedAt: "2026-10-22T12:00:00.000Z",
        expiresAt: "2026-10-22T14:00:00.000Z",
        state: "ACTIVE",
      },
    },
  };
  const identity = {
    workspace: "/fixture/css-workspace",
    branch: task.branch,
    headSha: "d".repeat(40),
    treeSha: "e".repeat(40),
    dirty: false,
    baseIsAncestor: true,
  };
  const authority = {
    schemaVersion: 1,
    kind: "TDP_CSS_STARTED_TASK_TRANSFER",
    repository: TRANSFER_REPOSITORY,
    changeSetId: id,
    fromOwner: task.owner,
    toOwner: TRANSFER_EXECUTOR,
    state: "AUTHORIZED",
    taskDigest: taskTransferDigest(task),
    afterDigest: "sha256:" + "0".repeat(64),
    manifestDigest: task.changeSetDigest,
    claimDigest: taskTransferDigest(claim),
    headSha: identity.headSha,
    treeSha: identity.treeSha,
    workspace: identity.workspace,
    issuedAt: "2026-10-24T05:59:00.000Z",
    expiresAt: "2026-10-24T06:10:00.000Z",
    cessation: {
      basis: "REPOSITORY_OWNER_REPORTED_NO_OTHER_WORKERS",
      ownerLogin: "luizanunciostoca",
      reference: "fixture-only-no-operational-grant",
    },
  };
  authority.afterDigest = taskTransferDigest(
    taskTransferAfter(task, authority),
  );
  return { task, manifest, claim, leases, authority, identity };
}
for (const id of Object.keys(TRANSFER_SUBJECTS))
  test(
    "bounded transfer preserves artifacts and requires restart: " + id,
    () => {
      const f = fixture(id),
        before = structuredClone(f),
        result = validateTaskTransfer(f, now);
      assert.deepEqual(f, before);
      assert.equal(result.owner, TRANSFER_EXECUTOR);
      assert.equal(result.state, "STARTED");
      assert.equal(result.branch, f.task.branch);
      assert.equal(result.baseSha, f.task.baseSha);
      assert.equal(result.changeSetDigest, f.task.changeSetDigest);
      assert.equal(result.startedAt, f.task.startedAt);
      assert.equal(result.candidateSha, f.identity.headSha);
      assert.equal(result.treeSha, f.identity.treeSha);
      assert.deepEqual(result.leaseIds, []);
      assert.equal(result.contextPackDigest, null);
      assert.equal(result.localProof, null);
    },
  );
const cases = [
  [
    "unapproved subject",
    (f) => {
      f.manifest.id = "MD-OTHER";
    },
    /SUBJECT_NOT_ALLOWED/,
  ],
  [
    "submitted task",
    (f) => {
      f.task.state = "SUBMITTED";
    },
    /TASK_STATE_OR_OWNER/,
  ],
  [
    "proven task",
    (f) => {
      f.task.state = "LOCAL_PROVEN";
    },
    /TASK_STATE_OR_OWNER/,
  ],
  [
    "different historical owner",
    (f) => {
      f.task.owner = "OTHER";
    },
    /TASK_STATE_OR_OWNER/,
  ],
  [
    "different new owner",
    (f) => {
      f.authority.toOwner = "OTHER";
    },
    /AUTHORIZATION_IDENTITY/,
  ],
  [
    "different old owner authorization",
    (f) => {
      f.authority.fromOwner = "OTHER";
    },
    /AUTHORIZATION_IDENTITY/,
  ],
  [
    "different task authorization",
    (f) => {
      f.authority.changeSetId = "MD-OTHER";
    },
    /AUTHORIZATION_IDENTITY/,
  ],
  [
    "unapproved record",
    (f) => {
      f.authority.state = "PROPOSED";
    },
    /NOT_AUTHORIZED/,
  ],
  [
    "revoked record",
    (f) => {
      f.authority.state = "REVOKED";
    },
    /NOT_AUTHORIZED/,
  ],
  [
    "expired record",
    (f) => {
      f.authority.expiresAt = now;
    },
    /AUTHORIZATION_EXPIRED/,
  ],
  [
    "future record",
    (f) => {
      f.authority.issuedAt = "2026-10-24T06:01:00Z";
    },
    /AUTHORIZATION_EXPIRED/,
  ],
  [
    "excessive duration",
    (f) => {
      f.authority.expiresAt = "2026-10-24T08:00:00Z";
    },
    /AUTHORIZATION_EXPIRED/,
  ],
  [
    "invalid time",
    (f) => {
      f.authority.expiresAt = "invalid";
    },
    /AUTHORIZATION_EXPIRED/,
  ],
  [
    "missing cessation",
    (f) => {
      delete f.authority.cessation;
    },
    /AUTHORIZATION_FIELDS/,
  ],
  [
    "different reporter",
    (f) => {
      f.authority.cessation.ownerLogin = "OTHER";
    },
    /CESSATION_REQUIRED/,
  ],
  [
    "missing reference",
    (f) => {
      f.authority.cessation.reference = "";
    },
    /CESSATION_REQUIRED/,
  ],
  [
    "extra field",
    (f) => {
      f.authority.allowAnyTask = true;
    },
    /AUTHORIZATION_FIELDS/,
  ],
  [
    "other repository",
    (f) => {
      f.authority.repository = "other/repo";
    },
    /REPOSITORY/,
  ],
  [
    "wrong version",
    (f) => {
      f.authority.schemaVersion = 2;
    },
    /AUTHORIZATION_KIND/,
  ],
  [
    "changed task bytes",
    (f) => {
      f.task.startedAt = "2026-10-22T12:01:00Z";
    },
    /TASK_CHANGED/,
  ],
  [
    "changed after image",
    (f) => {
      f.authority.afterDigest = "sha256:" + "1".repeat(64);
    },
    /AFTER_CHANGED/,
  ],
  [
    "manifest digest mismatch",
    (f) => {
      f.authority.manifestDigest = "sha256:" + "1".repeat(64);
    },
    /MANIFEST_CHANGED/,
  ],
  [
    "claim digest mismatch",
    (f) => {
      f.authority.claimDigest = "sha256:" + "1".repeat(64);
    },
    /CLAIM_CHANGED/,
  ],
  [
    "claim expired",
    (f) => {
      f.claim.expiresAt = now;
    },
    /CLAIM_INVALID/,
  ],
  [
    "claim owner changed",
    (f) => {
      f.claim.owner = "OTHER";
    },
    /CLAIM_INVALID/,
  ],
  [
    "claim scope changed",
    (f) => {
      f.claim.paths = ["other"];
    },
    /CLAIM_SCOPE/,
  ],
  [
    "task base changed",
    (f) => {
      f.task.baseSha = "f".repeat(40);
    },
    /TASK_IDENTITY/,
  ],
  [
    "task branch changed",
    (f) => {
      f.task.branch = "fix/other";
    },
    /TASK_IDENTITY/,
  ],
  [
    "dirty workspace",
    (f) => {
      f.identity.dirty = true;
    },
    /WORKSPACE_CHANGED/,
  ],
  [
    "different workspace",
    (f) => {
      f.identity.workspace = "/other";
    },
    /WORKSPACE_CHANGED/,
  ],
  [
    "head moved",
    (f) => {
      f.identity.headSha = "f".repeat(40);
    },
    /WORKSPACE_CHANGED/,
  ],
  [
    "tree moved",
    (f) => {
      f.identity.treeSha = "f".repeat(40);
    },
    /WORKSPACE_CHANGED/,
  ],
  [
    "base not ancestor",
    (f) => {
      f.identity.baseIsAncestor = false;
    },
    /WORKSPACE_CHANGED/,
  ],
  [
    "missing lease history",
    (f) => {
      f.leases.leases = {};
    },
    /LEASE_HISTORY_MISSING/,
  ],
  [
    "valid active lease",
    (f) => {
      Object.values(f.leases.leases)[0].expiresAt = "2026-10-24T07:00:00Z";
    },
    /VALID_LEASE_EXISTS/,
  ],
];
for (const [name, mutate, pattern] of cases)
  test("transfer rejects " + name, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => validateTaskTransfer(f, now), pattern);
  });
function transaction(action) {
  const directory = mkdtempSync(join(tmpdir(), "css-transfer-test-"));
  try {
    const f = fixture(),
      after = validateTaskTransfer(f, now);
    const paths = {
      taskPath: join(directory, "task.json"),
      historyPath: join(directory, "history.json"),
    };
    writeFileSync(paths.taskPath, JSON.stringify(f.task));
    return action({
      ...paths,
      before: f.task,
      after,
      authority: f.authority,
      revalidate() {},
      directory,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test("persistence preserves exact original and repeated completion is readback only", () =>
  transaction((t) => {
    assert.equal(persistTaskTransfer(t).replay, false);
    assert.deepEqual(JSON.parse(readFileSync(t.taskPath)), t.after);
    const history = readFileSync(t.historyPath, "utf8");
    assert.deepEqual(JSON.parse(history).before, t.before);
    assert.equal(persistTaskTransfer(t).replay, true);
    assert.equal(readFileSync(t.historyPath, "utf8"), history);
  }));
test("failed current authorization preserves original task", () =>
  transaction((t) => {
    assert.throws(
      () =>
        persistTaskTransfer({
          ...t,
          revalidate() {
            throw Error("REVOKED");
          },
        }),
      /REVOKED/,
    );
    assert.deepEqual(JSON.parse(readFileSync(t.taskPath)), t.before);
    assert.ok(existsSync(t.historyPath));
  }));
test("recovery rejects different history", () =>
  transaction((t) => {
    writeFileSync(t.historyPath, JSON.stringify({ version: 0 }));
    assert.throws(() => persistTaskTransfer(t), /HISTORY_MISMATCH/);
    assert.deepEqual(JSON.parse(readFileSync(t.taskPath)), t.before);
  }));
test("recovery checks full transaction against approved digests", () =>
  transaction((t) => {
    assert.throws(
      () =>
        persistTaskTransfer({ ...t, after: { ...t.after, owner: "OTHER" } }),
      /TRANSACTION_BINDING/,
    );
    assert.equal(existsSync(t.historyPath), false);
  }));
test("task mutation before replacement is refused", () =>
  transaction((t) => {
    assert.throws(
      () =>
        persistTaskTransfer({
          ...t,
          revalidate() {
            writeFileSync(
              t.taskPath,
              JSON.stringify({ ...t.before, owner: "OTHER" }),
            );
          },
        }),
      /TASK_CHANGED_BEFORE_COMMIT/,
    );
  }));
test("pending atomic replacement requires explicit reconciliation", () =>
  transaction((t) => {
    writeFileSync(t.taskPath + ".transfer-pending", "retained");
    assert.throws(() => persistTaskTransfer(t), /PENDING_TRANSACTION/);
    assert.equal(
      readFileSync(t.taskPath + ".transfer-pending", "utf8"),
      "retained",
    );
  }));
test("missing original history cannot be reconstructed from an after-image", () =>
  transaction((t) => {
    writeFileSync(t.taskPath, JSON.stringify(t.after));
    assert.throws(() => persistTaskTransfer(t), /MISSING_ORIGINAL_HISTORY/);
  }));
test("CLI rejects malformed invocation before transport or filesystem mutation", async () => {
  await assert.rejects(runTaskTransferCli([], { root: "." }), /ARGUMENTS/);
});

async function cliFixture(action) {
  const fs = await import("node:fs"),
    cp = await import("node:child_process");
  const directory = fs.mkdtempSync(join(tmpdir(), "css-transfer-cli-"));
  const root = join(directory, "authority"),
    workspace = join(directory, "css");
  const fixturePath = join(directory, "provider.json"),
    bin = join(directory, "bin");
  const git = (...args) =>
    cp
      .execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
      })
      .trim();
  try {
    fs.mkdirSync(root);
    fs.mkdirSync(bin);
    git("init", "-b", "main");
    git("config", "user.name", "Isolated Fixture");
    git("config", "user.email", "fixture@example.invalid");
    fs.writeFileSync(join(root, "fixture.txt"), "isolated");
    git("add", ".");
    git("commit", "-m", "fixture base");
    const base = git("rev-parse", "HEAD"),
      f = fixture();
    f.manifest.baseSha = base;
    f.task.baseSha = base;
    f.task.changeSetDigest = changeSetDigest(f.manifest);
    const manifestPath = ".morro/changesets/" + f.manifest.id + ".json";
    fs.mkdirSync(join(root, ".morro/changesets"), { recursive: true });
    fs.writeFileSync(join(root, manifestPath), JSON.stringify(f.manifest));
    git("add", ".");
    git("commit", "-m", "fixture CSS");
    git("worktree", "add", "-b", f.task.branch, workspace, "HEAD");
    fs.mkdirSync(join(root, "tooling/mdctl"), { recursive: true });
    for (const name of [
      "task-transfer.mjs",
      "changeset-v2.mjs",
      "capability-leases.mjs",
    ])
      fs.copyFileSync(
        new URL("../mdctl/" + name, import.meta.url),
        join(root, "tooling/mdctl", name),
      );
    // Simulated scheduler boundary only. No operational task, grant or API call.
    fs.writeFileSync(
      join(root, "tooling/mdctl/mdctl.mjs"),
      "import fs from 'node:fs';console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.env.CSS_TRANSFER_PROVIDER)).schedule));",
    );
    git("add", ".");
    git("commit", "-m", "fixture authority");
    const main = git("rev-parse", "HEAD");
    const targetGit = (...args) =>
      cp
        .execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" })
        .trim();
    const stateDir = join(
      targetGit("rev-parse", "--absolute-git-dir"),
      "morro-control",
    );
    fs.mkdirSync(stateDir);
    f.identity.workspace = fs.realpathSync(workspace);
    f.identity.headSha = targetGit("rev-parse", "HEAD");
    f.identity.treeSha = targetGit("rev-parse", "HEAD^{tree}");
    const clock = Date.now();
    f.claim.expiresAt = new Date(clock + 3600000).toISOString();
    Object.assign(f.authority, {
      workspace: f.identity.workspace,
      headSha: f.identity.headSha,
      treeSha: f.identity.treeSha,
      taskDigest: taskTransferDigest(f.task),
      manifestDigest: f.task.changeSetDigest,
      claimDigest: taskTransferDigest(f.claim),
      issuedAt: new Date(clock - 1000).toISOString(),
      expiresAt: new Date(clock + 600000).toISOString(),
    });
    f.authority.afterDigest = taskTransferDigest(
      taskTransferAfter(f.task, f.authority),
    );
    const taskPath = join(stateDir, f.manifest.id + ".task.json");
    fs.writeFileSync(taskPath, JSON.stringify(f.task));
    const leasePath = join(stateDir, "capability-leases.json"),
      leaseBytes = JSON.stringify(f.leases);
    fs.writeFileSync(leasePath, leaseBytes);
    const config = {
      main,
      authority: f.authority,
      manifest: f.manifest,
      registry: {
        claims: { [f.manifest.id]: f.claim },
      },
      schedule: {
        exactMainSha: main,
        dispatchAllowed: true,
        violations: [],
        activeWriters: [],
        grants: [{ id: f.manifest.id, exactBaseSha: main }],
      },
    };
    fs.writeFileSync(fixturePath, JSON.stringify(config));
    fs.writeFileSync(
      join(bin, "gh"),
      String.raw`#!/usr/bin/env node
const fs=require('node:fs'),crypto=require('node:crypto');
const c=JSON.parse(fs.readFileSync(process.env.CSS_TRANSFER_PROVIDER));
const p=process.argv.find(x=>x.startsWith('repos/'));
const prefix='repos/luizanunciostoca/touristic-digital-platform/';
if(!p?.startsWith(prefix)){process.exit(2);}
if(p===prefix+'commits/main'){console.log(JSON.stringify({sha:c.main}));process.exit(0);}
let v;if(p.startsWith(prefix+'contents/.morro/task-transfers/'))v=c.authority;
else if(p.startsWith(prefix+'contents/.morro/changesets/'))v=c.manifest;
else if(p.startsWith(prefix+'contents/.github/morro-control/claims.json'))v=c.registry;
else process.exit(3);
const b=Buffer.from(JSON.stringify(v));
console.log(JSON.stringify({type:'file',encoding:'base64',content:b.toString('base64'),
sha:crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex')}));
`,
      { mode: 0o700 },
    );
    const env = {
      ...process.env,
      PATH: bin + ":" + process.env.PATH,
      CSS_TRANSFER_PROVIDER: fixturePath,
    };
    const args = [
      "--input-type=module",
      "-e",
      "import {runTaskTransferCli} from './tooling/mdctl/task-transfer.mjs';try{console.log(JSON.stringify(await runTaskTransferCli(process.argv.slice(1),{root:process.cwd()})));}catch(e){console.error(e.message??e.code);process.exitCode=1;}",
      "--",
      "--workspace",
      workspace,
      "--expected-main",
      main,
    ];
    const run = () =>
      cp.spawnSync(process.execPath, args, {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30000,
      });
    const runAsync = () =>
      new Promise((resolve, reject) => {
        const p = cp.spawn(process.execPath, args, { cwd: root, env });
        let stdout = "",
          stderr = "";
        p.stdout.on("data", (b) => (stdout += b));
        p.stderr.on("data", (b) => (stderr += b));
        p.on("error", reject);
        p.on("close", (status) => resolve({ status, stdout, stderr }));
      });
    await action({
      run,
      runAsync,
      config,
      save: () => fs.writeFileSync(fixturePath, JSON.stringify(config)),
      taskPath,
      leasePath,
      leaseBytes,
      root,
      workspace,
      f,
      lock: join(root, ".git/css-started-transfer.lock"),
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test("complete CLI binds authenticated fixture and scheduler, preserving leases and code", async () => {
  await cliFixture(async (t) => {
    const first = t.run();
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).workerStarted, false);
    assert.equal(JSON.parse(readFileSync(t.taskPath)).owner, TRANSFER_EXECUTOR);
    assert.equal(readFileSync(t.leasePath, "utf8"), t.leaseBytes);
    const second = t.run();
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).replay, true);
  });
});
test("concurrent CLI calls serialize with one preserved transaction", async () => {
  await cliFixture(async (t) => {
    const results = await Promise.all([t.runAsync(), t.runAsync()]);
    assert.ok(
      results.some((r) => r.status === 0),
      JSON.stringify(results),
    );
    for (const r of results.filter((r) => r.status !== 0))
      assert.match(r.stderr, /EEXIST/);
    assert.equal(JSON.parse(readFileSync(t.taskPath)).owner, TRANSFER_EXECUTOR);
    assert.equal(readFileSync(t.leasePath, "utf8"), t.leaseBytes);
  });
});
for (const [name, mutate, code] of [
  [
    "scheduler conflict",
    (c) => c.schedule.activeWriters.push({ id: "OTHER" }),
    /CURRENT_SCHEDULER_REQUIRED/,
  ],
  [
    "missing scheduler grant",
    (c) => (c.schedule.grants = []),
    /CURRENT_SCHEDULER_REQUIRED/,
  ],
  [
    "stale scheduler base",
    (c) => (c.schedule.exactMainSha = "f".repeat(40)),
    /CURRENT_SCHEDULER_REQUIRED/,
  ],
  [
    "expired live authorization",
    (c) => (c.authority.expiresAt = "2026-01-01T00:00:00Z"),
    /AUTHORIZATION_EXPIRED/,
  ],
  [
    "revoked live authorization",
    (c) => (c.authority.state = "REVOKED"),
    /NOT_AUTHORIZED/,
  ],
  ["main movement", (c) => (c.main = "f".repeat(40)), /MAIN_MOVED/],
])
  test("complete CLI refuses " + name + " without changing task", async () => {
    await cliFixture(async (t) => {
      const before = readFileSync(t.taskPath, "utf8");
      mutate(t.config);
      t.save();
      const r = t.run();
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, code);
      assert.equal(readFileSync(t.taskPath, "utf8"), before);
      assert.equal(readFileSync(t.leasePath, "utf8"), t.leaseBytes);
      assert.ok(existsSync(t.lock), "failure retains reconciliation lock");
    });
  });
