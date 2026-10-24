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
} from "../mdctl/task-transfer.mjs";
import { changeSetDigest } from "../mdctl/changeset-v2.mjs";
import { buildTaskRestart } from "../mdctl/task-lifecycle.mjs";
import {
  buildCssTaskReanchor,
  evaluateReanchorScheduler,
  persistCssTaskReanchor,
} from "../mdctl/task-reanchor.mjs";
import { buildScheduleCandidateItem } from "../mdctl/mdctl.mjs";
import {
  buildSchedulerPlan,
  loadSchedulerPolicy,
} from "../mdctl/scheduler.mjs";
const now = "2026-10-24T09:00:00.000Z";
function historicalFixture(id = Object.keys(TRANSFER_SUBJECTS)[0]) {
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

function fixture(id) {
  const f = historicalFixture(id);
  f.claim.baseSha = f.manifest.baseSha;
  f.authority.claimDigest = taskTransferDigest(f.claim);
  const before = structuredClone(f.task);
  f.task = taskTransferAfter(before, f.authority);
  f.authority.afterDigest = taskTransferDigest(f.task);
  f.transferHistory = {
    version: 1,
    authority: structuredClone(f.authority),
    before,
    after: structuredClone(f.task),
  };
  f.registry = {
    schemaVersion: 1,
    registryAuthority: "ORCHESTRATOR",
    claims: { [f.manifest.id]: f.claim },
  };
  f.ledgerText = "";
  f.mainSha = "f".repeat(40);
  f.identity.mainIsAncestor = true;
  f.identity.originalHeadIsAncestor = true;
  return f;
}
const transport = (mainSha, extra = {}) => ({
  loadPolicy: loadSchedulerPolicy,
  collectLive: async () => ({
    mainSha,
    authority: "TRUSTED_PR_EXACT_HEADS",
    items: [],
  }),
  evaluateDependencies: async () => ({
    satisfied: true,
    dependencies: [],
    unresolved: [],
  }),
  ...extra,
});
for (const id of Object.keys(TRANSFER_SUBJECTS))
  test(
    "real scheduler, reanchor and restart preserve lineage: " + id,
    async () => {
      const f = fixture(id),
        original = structuredClone(f);
      const candidate = await buildScheduleCandidateItem({
        manifest: f.manifest,
        mainSha: f.mainSha,
        repository: TRANSFER_REPOSITORY,
        dependencyEvaluator: transport(f.mainSha).evaluateDependencies,
      });
      assert.equal(candidate.invalid, "CANDIDATE_EXACT_BASE_MISMATCH");
      assert.match(JSON.stringify(candidate), /CANDIDATE_EXACT_BASE_MISMATCH/);
      const policy = await loadSchedulerPolicy();
      assert.equal(
        buildSchedulerPlan({
          mainSha: f.mainSha,
          policy,
          workItems: [candidate],
        }).grants.length,
        0,
      );
      const result = buildCssTaskReanchor(f, now);
      assert.throws(
        () =>
          buildTaskRestart({
            task: f.task,
            changeSet: result.transition.manifest,
            leaseRegistry: f.leases,
            identity: f.identity,
            now,
          }),
        /TASK_CHANGESET_DIGEST_MISMATCH/,
      );
      const scheduled = await evaluateReanchorScheduler(
        result.transition.manifest,
        f.mainSha,
        transport(f.mainSha),
      );
      assert.equal(scheduled.schedulerPassed, true);
      assert.equal(scheduled.executionAuthorized, false);
      assert.equal(scheduled.diffCertified, false);
      const restarted = buildTaskRestart({
        task: result.nextTask,
        changeSet: result.transition.manifest,
        leaseRegistry: f.leases,
        identity: f.identity,
        now,
      });
      assert.equal(restarted.task.taskId, f.task.taskId);
      assert.equal(restarted.task.owner, TRANSFER_EXECUTOR);
      assert.equal(restarted.task.baseSha, f.mainSha);
      assert.ok(restarted.task.leaseIds.length > 0);
      assert.equal(restarted.task.localProof, null);
      assert.equal(
        restarted.task.changeSetDigest,
        changeSetDigest(result.transition.manifest),
      );
      assert.deepEqual(f, original);
      assert.deepEqual(result.transition.manifest, {
        ...f.manifest,
        baseSha: f.mainSha,
      });
      assert.equal(result.transition.events[0].eventType, "CLAIM_RENEWED");
      assert.equal(result.workerStarted, false);
      assert.equal(result.leasesAcquired, false);
    },
  );
const cases = [
  ["submitted", (f) => (f.task.state = "SUBMITTED"), /TASK_STATE_OR_OWNER/],
  ["other owner", (f) => (f.task.owner = "OTHER"), /TASK_STATE_OR_OWNER/],
  [
    "changed manifest",
    (f) => (f.manifest.baseSha = "0".repeat(40)),
    /TASK_IDENTITY/,
  ],
  [
    "changed task",
    (f) => (f.task.startedAt = "2026-10-24T08:00:00Z"),
    /TRANSFER_NOT_CONSUMED_OR_TASK_CHANGED/,
  ],
  [
    "changed record",
    (f) => (f.authority.afterDigest = "sha256:" + "0".repeat(64)),
    /TRANSFER_AUTHORITY_CHANGED/,
  ],
  [
    "expired claim",
    (f) => (f.registry.claims[f.manifest.id].expiresAt = now),
    /CLAIM_INVALID/,
  ],
  [
    "changed claim",
    (f) => (f.registry.claims[f.manifest.id].paths = ["other"]),
    /CLAIM_CHANGED/,
  ],
  ["dirty", (f) => (f.identity.dirty = true), /WORKSPACE_IDENTITY/],
  [
    "main not ancestor",
    (f) => (f.identity.mainIsAncestor = false),
    /WORKSPACE_IDENTITY/,
  ],
  [
    "candidate not preserved",
    (f) => (f.identity.originalHeadIsAncestor = false),
    /WORKSPACE_IDENTITY/,
  ],
  [
    "different workspace",
    (f) => (f.identity.workspace = "/other"),
    /WORKSPACE_IDENTITY/,
  ],
  ["unchanged base", (f) => (f.mainSha = f.task.baseSha), /BASE_UNCHANGED/],
  [
    "active lease",
    (f) =>
      (Object.values(f.leases.leases)[0].expiresAt = "2026-10-24T10:00:00Z"),
    /ACTIVE_LEASE/,
  ],
];
for (const [name, mutate, code] of cases)
  test("reanchor rejects " + name, () => {
    const f = fixture();
    mutate(f);
    assert.throws(() => buildCssTaskReanchor(f, now), code);
  });
test("execution scheduler retains exact-base requirement", async () => {
  const f = fixture();
  await assert.rejects(
    evaluateReanchorScheduler(f.manifest, f.mainSha, transport(f.mainSha)),
    /EXECUTION_EXACT_BASE/,
  );
});
test("current main must match scheduler", async () => {
  const f = fixture(),
    m = buildCssTaskReanchor(f, now).transition.manifest;
  await assert.rejects(
    evaluateReanchorScheduler(m, f.mainSha, transport("1".repeat(40))),
    /LIVE_SCHEDULER_IDENTITY/,
  );
});
test("unmet dependencies block real scheduler", async () => {
  const f = fixture(),
    m = buildCssTaskReanchor(f, now).transition.manifest;
  await assert.rejects(
    evaluateReanchorScheduler(
      m,
      f.mainSha,
      transport(f.mainSha, {
        evaluateDependencies: async () => ({
          satisfied: false,
          dependencies: [{ id: "pending", satisfied: false }],
          unresolved: ["pending"],
        }),
      }),
    ),
    /SCHEDULER_BLOCKED/,
  );
});
function transaction() {
  const root = mkdtempSync(join(tmpdir(), "css-reanchor-"));
  const entries = ["registry", "ledger", "manifest", "task"].map((name) => {
    const path = join(root, name);
    writeFileSync(path, "before-" + name);
    return { path, before: readFileSync(path), after: "after-" + name };
  });
  return {
    root,
    entries,
    historyPath: join(root, "history"),
    history: { before: "preserved", after: "new" },
    revalidate: () => {},
  };
}
test("persistence retains original history and rejects duplicate preparation", () => {
  const f = transaction();
  try {
    persistCssTaskReanchor(f);
    for (const e of f.entries)
      assert.equal(readFileSync(e.path, "utf8"), e.after);
    assert.deepEqual(JSON.parse(readFileSync(f.historyPath)), f.history);
    assert.throws(() => persistCssTaskReanchor(f), /HISTORY_EXISTS_RECONCILE/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test("changed input blocks before intent or task writes", () => {
  const f = transaction();
  try {
    writeFileSync(f.entries[0].path, "changed");
    assert.throws(() => persistCssTaskReanchor(f), /INPUT_CHANGED/);
    assert.equal(existsSync(f.historyPath), false);
    assert.deepEqual(readFileSync(f.entries[3].path), f.entries[3].before);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
test("partial write failure preserves intent and never starts worker", () => {
  const f = transaction();
  let writes = 0;
  try {
    assert.throws(
      () =>
        persistCssTaskReanchor({
          ...f,
          write: (p, b) => {
            if (++writes === 3) throw Error("FIXTURE_WRITE_FAILURE");
            writeFileSync(p, b);
          },
        }),
      /FIXTURE_WRITE_FAILURE/,
    );
    assert.equal(existsSync(f.historyPath), true);
    assert.deepEqual(readFileSync(f.entries[3].path), f.entries[3].before);
    assert.throws(() => persistCssTaskReanchor(f), /HISTORY_EXISTS_RECONCILE/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

async function cliFixture(id, action, pending = false) {
  const { mkdirSync, copyFileSync } = await import("node:fs");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "css-reanchor-cli-")),
    root = join(dir, "authority"),
    workspace = join(dir, "css"),
    bin = join(dir, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const git = (w, ...args) =>
    execFileSync("git", ["-C", w, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const put = (p, b) => {
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, b);
  };
  try {
    git(root, "init", "-b", "main");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    put(join(root, "fixture.txt"), "base");
    git(root, "add", ".");
    git(root, "commit", "-m", "base");
    const base = git(root, "rev-parse", "HEAD");
    const f = fixture(id),
      mp = ".morro/changesets/" + id + ".json",
      rp = ".github/morro-control/claims.json",
      ep = ".github/morro-control/events.ndjson",
      ap = ".morro/task-transfers/" + id + ".json";
    f.manifest.baseSha = base;
    f.claim.baseSha = base;
    f.claim.expiresAt = new Date(Date.now() + 3600000).toISOString();
    for (const [p, v] of [
      [mp, f.manifest],
      [rp, f.registry],
    ])
      put(join(root, p), JSON.stringify(v, null, 2) + "\n");
    put(join(root, ep), "");
    git(root, "add", ".");
    git(root, "commit", "-m", "claim");
    git(root, "worktree", "add", "-b", f.manifest.branch, workspace, "HEAD");
    put(join(workspace, "fixture.txt"), "preserved CSS candidate");
    git(workspace, "add", ".");
    git(workspace, "commit", "-m", "CSS candidate");
    const head = git(workspace, "rev-parse", "HEAD"),
      tree = git(workspace, "rev-parse", "HEAD^{tree}");
    const before = {
      ...f.transferHistory.before,
      baseSha: base,
      changeSetDigest: changeSetDigest(f.manifest),
      candidateSha: head,
      treeSha: tree,
    };
    const authority = {
      ...f.authority,
      workspace,
      headSha: head,
      treeSha: tree,
      taskDigest: taskTransferDigest(before),
      manifestDigest: changeSetDigest(f.manifest),
      claimDigest: taskTransferDigest(f.claim),
    };
    const task = taskTransferAfter(before, authority);
    authority.afterDigest = taskTransferDigest(task);
    const history = { version: 1, authority, before, after: task };
    put(join(root, ap), JSON.stringify(authority, null, 2) + "\n");
    for (const name of [
      "task-reanchor.mjs",
      "task-transfer.mjs",
      "changeset-v2.mjs",
      "capability-leases.mjs",
    ]) {
      const p = join(root, "tooling/mdctl", name);
      mkdirSync(join(p, ".."), { recursive: true });
      copyFileSync(new URL("../mdctl/" + name, import.meta.url), p);
    }
    for (const name of ["claim-lifecycle.mjs", "mdctl.mjs", "scheduler.mjs"])
      put(
        join(root, "tooling/mdctl", name),
        "export * from " +
          JSON.stringify(new URL("../mdctl/" + name, import.meta.url).href) +
          ";\n",
      );
    put(
      join(root, "tooling/mdctl/scheduler-live.mjs"),
      "import fs from 'node:fs';const p=()=>JSON.parse(fs.readFileSync(process.env.CSS_REANCHOR_PROVIDER));export async function collectLivePullWork(){return p().live}export async function evaluateDependenciesAtMain(){return p().deps}\n",
    );
    put(
      join(root, ".morro/scheduler-policy.json"),
      readFileSync(
        new URL("../../.morro/scheduler-policy.json", import.meta.url),
      ),
    );
    git(root, "add", ".");
    git(root, "commit", "-m", "trusted main");
    const main = git(root, "rev-parse", "HEAD");
    git(workspace, "merge", "--no-edit", main);
    const sd =
        git(workspace, "rev-parse", "--absolute-git-dir") + "/morro-control",
      tp = join(sd, id + ".task.json"),
      lp = join(sd, "capability-leases.json"),
      hp = join(sd, id + ".transfer-history.json");
    put(tp, JSON.stringify(task));
    put(lp, JSON.stringify(f.leases));
    put(hp, JSON.stringify(history));
    const provider = join(dir, "provider.json");
    writeFileSync(
      provider,
      JSON.stringify({
        main,
        files: Object.fromEntries(
          [mp, rp, ep, ap].map((p) => [p, readFileSync(join(root, p), "utf8")]),
        ),
        live: { mainSha: main, authority: "TRUSTED_PR_EXACT_HEADS", items: [] },
        deps: { satisfied: !pending, unresolved: pending ? ["pending"] : [] },
      }),
    );
    const gh = join(bin, "gh");
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const fs=require('node:fs'),crypto=require('node:crypto'),p=JSON.parse(fs.readFileSync(process.env.CSS_REANCHOR_PROVIDER)),a=process.argv.at(-1);
if(a.endsWith('/commits/main')){console.log(JSON.stringify({sha:p.main}));process.exit(0)}
const key=a.split('/contents/')[1]?.split('?')[0];if(!Object.hasOwn(p.files,key))process.exit(2);const b=Buffer.from(p.files[key]);console.log(JSON.stringify({type:'file',encoding:'base64',content:b.toString('base64'),sha:crypto.createHash('sha1').update('blob '+b.length+'\\0').update(b).digest('hex')}));
`,
      { mode: 0o700 },
    );
    const code =
      "import {runTaskReanchorCli} from " +
      JSON.stringify(
        pathToFileURL(join(root, "tooling/mdctl/task-reanchor.mjs")).href,
      ) +
      ";try{console.log(JSON.stringify(await runTaskReanchorCli(process.argv.slice(1),{root:process.cwd()})))}catch(e){console.error(e.message);process.exitCode=1}";
    const run = () =>
      spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          code,
          "--",
          "--workspace",
          workspace,
          "--expected-main",
          main,
        ],
        {
          cwd: root,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: bin + ":" + process.env.PATH,
            CSS_REANCHOR_PROVIDER: provider,
          },
          timeout: 60000,
        },
      );
    await action({ run, root, workspace, tp, lp, hp, main, mp, git, task });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
for (const id of Object.keys(TRANSFER_SUBJECTS))
  test(
    "CLI persistence then existing restart obtains real context: " + id,
    async () => {
      await cliFixture(id, async (f) => {
        const oldLeases = readFileSync(f.lp),
          oldHistory = readFileSync(f.hp),
          run = f.run();
        assert.equal(run.status, 0, run.stderr);
        assert.equal(JSON.parse(run.stdout).workerStarted, false);
        assert.deepEqual(readFileSync(f.lp), oldLeases);
        assert.deepEqual(readFileSync(f.hp), oldHistory);
        assert.equal(
          readFileSync(join(f.workspace, "fixture.txt"), "utf8"),
          "preserved CSS candidate",
        );
        const prepared = JSON.parse(readFileSync(f.tp)),
          m = JSON.parse(readFileSync(join(f.workspace, f.mp)));
        assert.equal(prepared.baseSha, f.main);
        assert.equal(prepared.changeSetDigest, changeSetDigest(m));
        f.git(f.workspace, "add", ".");
        f.git(f.workspace, "commit", "-m", "canonical reanchor metadata");
        const { runTaskCli } = await import("../mdctl/task-lifecycle.mjs");
        await runTaskCli(["restart", f.mp], { root: f.workspace });
        const restarted = JSON.parse(readFileSync(f.tp));
        assert.equal(restarted.taskId, f.task.taskId);
        assert.equal(restarted.owner, TRANSFER_EXECUTOR);
        assert.equal(restarted.state, "STARTED");
        assert.ok(restarted.leaseIds.length > 0);
        assert.notEqual(restarted.contextPackDigest, null);
      });
    },
  );
test("CLI pending dependency prevents all local task and lease writes", async () => {
  await cliFixture(
    Object.keys(TRANSFER_SUBJECTS)[0],
    async (f) => {
      const before = readFileSync(f.tp),
        leases = readFileSync(f.lp),
        run = f.run();
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /SCHEDULER_BLOCKED/);
      assert.deepEqual(readFileSync(f.tp), before);
      assert.deepEqual(readFileSync(f.lp), leases);
    },
    true,
  );
});

test("real scheduler rejects conflicting live writer", async () => {
  const f = fixture(),
    m = buildCssTaskReanchor(f, now).transition.manifest;
  const existing = await buildScheduleCandidateItem({
    manifest: { ...m, id: "MD-OTHER-WRITER", branch: "fix/other-writer" },
    mainSha: f.mainSha,
    repository: TRANSFER_REPOSITORY,
    dependencyEvaluator: transport(f.mainSha).evaluateDependencies,
  });
  existing.writerActive = true;
  await assert.rejects(
    evaluateReanchorScheduler(
      m,
      f.mainSha,
      transport(f.mainSha, {
        collectLive: async () => ({
          mainSha: f.mainSha,
          authority: "TRUSTED_PR_EXACT_HEADS",
          items: [existing],
        }),
      }),
    ),
    /SCHEDULER_BLOCKED/,
  );
});
test("task CLI routes bounded reanchor without starting worker", async () => {
  const { runTaskCli } = await import("../mdctl/task-lifecycle.mjs");
  await assert.rejects(runTaskCli(["reanchor"]), /TASK_REANCHOR_ARGUMENTS/);
});
