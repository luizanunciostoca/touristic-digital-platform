import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  realpathSync,
  mkdirSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { changeSetDigest, validateChangeSetV2 } from "./changeset-v2.mjs";
import { validateLeaseRegistry } from "./capability-leases.mjs";
import { buildClaimReanchor } from "./claim-lifecycle.mjs";
import {
  TRANSFER_EXECUTOR,
  TRANSFER_REPOSITORY,
  TRANSFER_SUBJECTS,
  taskTransferAfter,
  taskTransferDigest,
} from "./task-transfer.mjs";

const SHA = /^[a-f0-9]{40}$/u;
const check = (value, code) => assert.ok(value, "TASK_REANCHOR_" + code);
const same = (a, b, code) => assert.deepEqual(a, b, "TASK_REANCHOR_" + code);
const bytes = (value) => JSON.stringify(value, null, 2) + "\n";

/** Pure transition, not an execution grant. Preserve the consumed transfer and
 * original task in a separate immutable history; never rewrite their digests.
 * Only the two transferred CSS STARTED tasks are eligible. The new manifest is
 * the actual claim reanchor result, not a disposable capacity projection.
 */
export function buildCssTaskReanchor(input, now = new Date().toISOString()) {
  const {
    task,
    manifest,
    registry,
    ledgerText,
    transferHistory,
    authority,
    leases,
    identity,
    mainSha,
  } = input;
  validateChangeSetV2(manifest);
  validateLeaseRegistry(leases);
  const subject = TRANSFER_SUBJECTS[manifest.id];
  check(subject && SHA.test(mainSha), "SUBJECT_OR_MAIN");
  check(
    task.state === "STARTED" && task.owner === TRANSFER_EXECUTOR,
    "TASK_STATE_OR_OWNER",
  );
  check(
    task.changeSetId === manifest.id &&
      task.branch === subject.branch &&
      manifest.branch === subject.branch &&
      task.baseSha === manifest.baseSha,
    "TASK_IDENTITY",
  );
  check(
    manifest.state === "IMPLEMENTING" &&
      task.changeSetDigest === changeSetDigest(manifest),
    "HISTORICAL_MANIFEST",
  );
  check(task.baseSha !== mainSha, "BASE_UNCHANGED");
  same(transferHistory.authority, authority, "TRANSFER_AUTHORITY_CHANGED");
  check(
    transferHistory.version === 1 &&
      authority.repository === TRANSFER_REPOSITORY &&
      authority.kind === "TDP_CSS_STARTED_TASK_TRANSFER" &&
      authority.state === "AUTHORIZED" &&
      authority.changeSetId === manifest.id &&
      authority.fromOwner === subject.owner &&
      authority.toOwner === TRANSFER_EXECUTOR,
    "TRANSFER_IDENTITY",
  );
  check(
    taskTransferDigest(transferHistory.before) === authority.taskDigest &&
      taskTransferDigest(transferHistory.after) === authority.afterDigest,
    "TRANSFER_DIGEST",
  );
  same(
    taskTransferAfter(transferHistory.before, authority),
    transferHistory.after,
    "TRANSFER_AFTER",
  );
  same(task, transferHistory.after, "TRANSFER_NOT_CONSUMED_OR_TASK_CHANGED");
  check(
    authority.manifestDigest === changeSetDigest(manifest),
    "TRANSFER_MANIFEST",
  );
  check(
    task.contextPackDigest === null &&
      task.localProof === null &&
      task.leaseIds.length === 0,
    "OLD_EXECUTION_CONTEXT",
  );
  const clock = Date.parse(now),
    claim = registry.claims?.[manifest.id];
  check(
    Number.isFinite(clock) &&
      claim?.owner === "CHATGPT-PRO-CONTROL" &&
      claim.status === "IMPLEMENTING" &&
      Date.parse(claim.expiresAt) > clock,
    "CLAIM_INVALID",
  );
  check(taskTransferDigest(claim) === authority.claimDigest, "CLAIM_CHANGED");
  same([...claim.paths].sort(), [...manifest.owns.paths].sort(), "CLAIM_SCOPE");
  check(
    identity.workspace === authority.workspace &&
      identity.branch === subject.branch &&
      SHA.test(identity.headSha) &&
      SHA.test(identity.treeSha) &&
      identity.dirty === false &&
      identity.mainIsAncestor === true &&
      identity.originalHeadIsAncestor === true &&
      identity.baseIsAncestor === true,
    "WORKSPACE_IDENTITY",
  );
  for (const lease of Object.values(leases.leases)) {
    if (lease.changeSetId !== manifest.id) continue;
    check(
      Number.isFinite(Date.parse(lease.expiresAt)) &&
        !(lease.state === "ACTIVE" && Date.parse(lease.expiresAt) > clock),
      "ACTIVE_LEASE",
    );
  }
  const transition = buildClaimReanchor({
    registry,
    ledgerText,
    manifest,
    newBaseSha: mainSha,
    observedAt: now,
    reason: "TRANSFERRED_CSS_STARTED_TASK_EXACT_MAIN_REANCHOR",
  });
  const nextTask = {
    ...task,
    baseSha: mainSha,
    changeSetDigest: changeSetDigest(transition.manifest),
    candidateSha: identity.headSha,
    treeSha: identity.treeSha,
  };
  return {
    transition,
    nextTask,
    before: structuredClone(task),
    previousManifest: structuredClone(manifest),
    mainSha,
    state: "REANCHORED_RESTART_REQUIRED",
    leasesAcquired: false,
    workerStarted: false,
  };
}

/** Real scheduler constructors. Tests may simulate transport/dependencies, never
 * replace candidate construction or the scheduler plan with a prebuilt grant.
 * This result authorizes no worker; after committing metadata, schedule again
 * and invoke the existing task restart to obtain fresh context and leases.
 */
export async function evaluateReanchorScheduler(
  manifest,
  mainSha,
  transport = {},
) {
  const { buildScheduleCandidateItem } = await import("./mdctl.mjs");
  const { buildSchedulerPlan, loadSchedulerPolicy } =
    await import("./scheduler.mjs");
  const { collectLivePullWork, evaluateDependenciesAtMain } =
    await import("./scheduler-live.mjs");
  check(manifest.baseSha === mainSha, "EXECUTION_EXACT_BASE");
  const policy = await (transport.loadPolicy ?? loadSchedulerPolicy)();
  const live = await (transport.collectLive ?? collectLivePullWork)({
    repository: TRANSFER_REPOSITORY,
    policy,
  });
  check(
    live.mainSha === mainSha && live.authority === "TRUSTED_PR_EXACT_HEADS",
    "LIVE_SCHEDULER_IDENTITY",
  );
  const candidate = await buildScheduleCandidateItem({
    manifest,
    mainSha,
    repository: TRANSFER_REPOSITORY,
    dependencyEvaluator:
      transport.evaluateDependencies ?? evaluateDependenciesAtMain,
  });
  const plan = buildSchedulerPlan({
    mainSha,
    policy,
    workItems: [...live.items, candidate],
  });
  check(
    plan.dispatchAllowed &&
      plan.violations.length === 0 &&
      plan.grants.some(
        (g) => g.id === manifest.id && g.exactBaseSha === mainSha,
      ),
    "SCHEDULER_BLOCKED",
  );
  return {
    mainSha,
    manifestDigest: changeSetDigest(manifest),
    schedulerPassed: true,
    executionAuthorized: false,
    diffCertified: false,
  };
}

const git = (root, ...args) =>
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
function github(path) {
  return JSON.parse(
    execFileSync(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "repos/" + TRANSFER_REPOSITORY + "/" + path,
      ],
      { encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    ),
  );
}
function remoteBytes(path, ref) {
  const item = github("contents/" + path + "?ref=" + ref);
  check(item.type === "file" && item.encoding === "base64", "REMOTE_FILE");
  const data = Buffer.from(item.content, "base64");
  check(
    createHash("sha1")
      .update("blob " + data.length + "\0")
      .update(data)
      .digest("hex") === item.sha,
    "REMOTE_BLOB",
  );
  return data;
}
function durable(path, data, exclusive = false) {
  const target = exclusive ? path : path + ".reanchor-" + randomUUID();
  const fd = openSync(target, "wx", 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!exclusive) renameSync(target, path);
  const directory = openSync(dirname(path), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

/** One-way preparation transaction; no worker, lease or automatic retry.
 * Any partial failure leaves the shared lock and intent for explicit recovery.
 * Never delete that lock or reset a task to make a later command pass.
 */
export function persistCssTaskReanchor({
  entries,
  historyPath,
  history,
  revalidate,
  write = durable,
}) {
  check(!existsSync(historyPath), "HISTORY_EXISTS_RECONCILE");
  for (const entry of entries)
    same(readFileSync(entry.path), entry.before, "INPUT_CHANGED");
  revalidate();
  write(historyPath, bytes(history), true);
  for (const entry of entries) {
    revalidate();
    same(readFileSync(entry.path), entry.before, "INPUT_CHANGED");
    write(entry.path, entry.after);
    same(readFileSync(entry.path), Buffer.from(entry.after), "WRITE_READBACK");
  }
}

/** Run from a clean checkout of authenticated current main:
 * mdctl task reanchor --workspace <existing CSS worktree> --expected-main <sha>
 * The coordinator first merges current main into the preserved CSS branch;
 * no reset, replacement task, or rewritten transfer is accepted here.
 * Success leaves only canonical reanchor metadata dirty and task proof cleared.
 * PREPARE/commit, recapture scheduler, then task restart and normal proofs.
 * Expiry of the already-consumed transfer does not undo it; its immutable history
 * and canonical record remain mandatory. Claim expiry is checked at execution.
 */
export async function runTaskReanchorCli(args, { root }) {
  check(
    args.length === 4 &&
      args[0] === "--workspace" &&
      args[2] === "--expected-main",
    "ARGUMENTS",
  );
  const workspace = realpathSync(args[1]),
    mainSha = args[3],
    authorityRoot = realpathSync(root);
  check(
    SHA.test(mainSha) &&
      git(authorityRoot, "rev-parse", "HEAD") === mainSha &&
      git(authorityRoot, "status", "--porcelain", "--untracked-files=all") ===
        "",
    "TRUSTED_CHECKOUT",
  );
  check(
    fileURLToPath(import.meta.url) ===
      join(authorityRoot, "tooling/mdctl/task-reanchor.mjs"),
    "TRUSTED_ENTRYPOINT",
  );
  check(
    git(authorityRoot, "hash-object", fileURLToPath(import.meta.url)) ===
      git(
        authorityRoot,
        "rev-parse",
        mainSha + ":tooling/mdctl/task-reanchor.mjs",
      ),
    "EXECUTABLE_CHANGED",
  );
  check(github("commits/main").sha === mainSha, "MAIN_MOVED");
  const branch = git(workspace, "branch", "--show-current");
  const id = Object.keys(TRANSFER_SUBJECTS).find(
    (k) => TRANSFER_SUBJECTS[k].branch === branch,
  );
  check(id, "SUBJECT");
  const mp = ".morro/changesets/" + id + ".json",
    rp = ".github/morro-control/claims.json",
    ep = ".github/morro-control/events.ndjson",
    ap = ".morro/task-transfers/" + id + ".json";
  const sd = resolve(
    workspace,
    git(workspace, "rev-parse", "--git-path", "morro-control"),
  );
  const tp = join(sd, id + ".task.json"),
    lp = join(sd, "capability-leases.json"),
    hp = join(sd, id + ".transfer-history.json"),
    historyPath = join(sd, id + ".reanchor-history.json");
  const common = realpathSync(
    resolve(workspace, git(workspace, "rev-parse", "--git-common-dir")),
  );
  const lock = join(common, "css-started-transfer.lock");
  mkdirSync(lock);
  let completed = false;
  try {
    const captured = new Map(
      [
        tp,
        lp,
        hp,
        join(workspace, mp),
        join(workspace, rp),
        join(workspace, ep),
      ].map((p) => [p, readFileSync(p)]),
    );
    const task = JSON.parse(captured.get(tp)),
      manifest = JSON.parse(captured.get(join(workspace, mp))),
      registry = JSON.parse(captured.get(join(workspace, rp))),
      ledgerText = captured.get(join(workspace, ep)).toString(),
      leases = JSON.parse(captured.get(lp)),
      transferHistory = JSON.parse(captured.get(hp));
    const canonical = new Map(
      [mp, rp, ep, ap].map((p) => [p, remoteBytes(p, mainSha)]),
    );
    same(
      captured.get(join(workspace, mp)),
      canonical.get(mp),
      "CANONICAL_MANIFEST_CHANGED",
    );
    same(
      captured.get(join(workspace, rp)),
      canonical.get(rp),
      "CANONICAL_REGISTRY_CHANGED",
    );
    same(
      captured.get(join(workspace, ep)),
      canonical.get(ep),
      "CANONICAL_LEDGER_CHANGED",
    );
    const authority = JSON.parse(canonical.get(ap));
    const ancestor = (sha) => git(workspace, "merge-base", sha, "HEAD") === sha;
    const identity = {
      workspace,
      branch,
      headSha: git(workspace, "rev-parse", "HEAD"),
      treeSha: git(workspace, "rev-parse", "HEAD^{tree}"),
      dirty:
        git(workspace, "status", "--porcelain", "--untracked-files=all") !== "",
      mainIsAncestor: ancestor(mainSha),
      baseIsAncestor: ancestor(manifest.baseSha),
      originalHeadIsAncestor: ancestor(authority.headSha),
    };
    const input = {
      task,
      manifest,
      registry,
      ledgerText,
      leases,
      transferHistory,
      authority,
      identity,
      mainSha,
    };
    const result = buildCssTaskReanchor(input);
    const scheduler = await evaluateReanchorScheduler(
      result.transition.manifest,
      mainSha,
    );
    for (const [path, data] of captured)
      same(readFileSync(path), data, "CAPTURE_CHANGED");
    check(
      git(workspace, "rev-parse", "HEAD") === identity.headSha &&
        git(workspace, "status", "--porcelain", "--untracked-files=all") === "",
      "WORKSPACE_CHANGED",
    );
    const revalidate = () => {
      check(github("commits/main").sha === mainSha, "MAIN_MOVED");
      check(
        Date.parse(registry.claims[id].expiresAt) > Date.now(),
        "CLAIM_EXPIRED",
      );
      same(readFileSync(lp), captured.get(lp), "LEASES_CHANGED");
      same(readFileSync(hp), captured.get(hp), "TRANSFER_HISTORY_CHANGED");
      check(
        git(workspace, "rev-parse", "HEAD") === identity.headSha,
        "HEAD_CHANGED",
      );
    };
    const transition = result.transition;
    const entries = [
      [join(workspace, rp), bytes(transition.registry)],
      [join(workspace, ep), transition.ledgerText],
      [join(workspace, mp), bytes(transition.manifest)],
      [tp, bytes(result.nextTask)],
    ].map(([path, after]) => ({ path, before: captured.get(path), after }));
    persistCssTaskReanchor({
      entries,
      historyPath,
      revalidate,
      history: {
        version: 1,
        kind: "TDP_CSS_TASK_REANCHOR",
        mainSha,
        identity,
        transferDigest: taskTransferDigest(transferHistory),
        before: task,
        after: result.nextTask,
        previousManifest: manifest,
        manifest: transition.manifest,
        scheduler,
      },
    });
    completed = true;
    return {
      state: result.state,
      changeSetId: id,
      owner: task.owner,
      mainSha,
      previousTaskDigest: taskTransferDigest(task),
      taskDigest: taskTransferDigest(result.nextTask),
      manifestDigest: changeSetDigest(transition.manifest),
      historyPreserved: true,
      leasesAcquired: false,
      workerStarted: false,
      schedulerExecutionAuthorized: false,
    };
  } finally {
    if (completed) rmdirSync(lock);
  }
}
