#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  existsSync,
  lstatSync,
} from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hostname } from "node:os";
import {
  CORRECTION,
  correctionDigest,
  correctionKey,
  collectCorrectionAuthority,
  correctionGithub,
  assertCorrectionAuthority,
} from "./task-correction-authority.mjs";
import {
  buildTaskCorrection,
  validateTaskLocalProof,
} from "./task-lifecycle.mjs";
import { buildClaimReanchorProof } from "../fabric/claim-guard.mjs";
import { canonicalJson, changeSetDigest } from "./changeset-v2.mjs";
import {
  createLeaseRegistry,
  validateLeaseRegistry,
} from "./capability-leases.mjs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (root, ...args) =>
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function syncDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function durable(path, bytes, exclusive = false) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = exclusive ? path : path + ".tmp-" + randomUUID();
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  if (!exclusive) renameSync(temporary, path);
  syncDirectory(dirname(path));
}
const bytesOf = (value) => canonicalJson(value) + "\n";
const stateName = (name) =>
  ({
    task: CORRECTION.successor + ".task.json",
    context: CORRECTION.successor + ".context-pack.json",
    leases: "capability-leases.json",
  })[name];
function fileHash(path) {
  if (!existsSync(path)) return null;
  assert.ok(
    lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
    "CORRECTION_STATE_NOT_REGULAR",
  );
  return hash(readFileSync(path));
}
export function readCorrectionJournal(path) {
  if (!existsSync(path)) return [];
  const bytes = readFileSync(path, "utf8");
  assert.ok(bytes.endsWith("\n"), "CORRECTION_JOURNAL_TRUNCATED");
  let previous = null;
  return bytes
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      const record = JSON.parse(line),
        { digest, ...payload } = record;
      assert.equal(record.sequence, index, "CORRECTION_JOURNAL_SEQUENCE");
      assert.equal(record.previous, previous, "CORRECTION_JOURNAL_CHAIN");
      assert.equal(
        digest,
        correctionDigest(payload),
        "CORRECTION_JOURNAL_HASH",
      );
      previous = digest;
      return record;
    });
}
function append(path, stage, value) {
  const records = readCorrectionJournal(path);
  const payload = {
    sequence: records.length,
    previous: records.at(-1)?.digest ?? null,
    stage,
    value,
  };
  const fd = openSync(path, "a", 0o600);
  try {
    writeFileSync(
      fd,
      bytesOf({ ...payload, digest: correctionDigest(payload) }),
    );
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectory(dirname(path));
}

// Shared by every invocation for this predecessor, across worktrees. We never
// steal a lock, including an abandoned lock: operator reconciliation is needed.
export function withCorrectionLock(directory, action) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "execution.lock");
  const owner = bytesOf({
    host: hostname(),
    pid: process.pid,
    nonce: randomUUID(),
  });
  durable(path, owner, true);
  try {
    return action();
  } finally {
    assert.equal(readFileSync(path, "utf8"), owner, "CORRECTION_LOCK_CHANGED");
    unlinkSync(path);
    syncDirectory(directory);
  }
}
export function persistCorrectionTransaction(directory, transaction) {
  assert.deepEqual(Object.keys(transaction).sort(), [
    "context",
    "leases",
    "task",
  ]);
  // The journal containing these exact after-images must already be fsynced.
  for (const [name, entry] of Object.entries(transaction)) {
    const path = join(directory, stateName(name));
    const after = hash(entry.bytes),
      current = fileHash(path);
    if (current === after) continue;
    assert.equal(
      current,
      entry.before,
      "CORRECTION_TRANSACTION_CONFLICT:" + name,
    );
    durable(path, entry.bytes);
    assert.equal(
      fileHash(path),
      after,
      "CORRECTION_TRANSACTION_READBACK:" + name,
    );
  }
}
function loadPredecessor(directory, manifestPath) {
  const task = json(join(directory, CORRECTION.predecessor + ".task.json"));
  const handoff = json(
    join(directory, CORRECTION.predecessor + ".handoff.json"),
  );
  const leases = json(join(directory, "capability-leases.json"));
  const manifest = json(manifestPath);
  assert.equal(task.state, "SUBMITTED", "CORRECTION_PREDECESSOR_NOT_SUBMITTED");
  assert.equal(task.owner, CORRECTION.executor, "CORRECTION_PREDECESSOR_OWNER");
  assert.equal(
    manifest.id,
    CORRECTION.predecessor,
    "CORRECTION_PREDECESSOR_ID",
  );
  assert.equal(
    task.changeSetDigest,
    changeSetDigest(manifest),
    "CORRECTION_HISTORICAL_MANIFEST",
  );
  validateTaskLocalProof({ proof: task.localProof, task, changeSet: manifest });
  const { digest, ...payload } = handoff;
  assert.equal(digest, correctionDigest(payload), "CORRECTION_HANDOFF_HASH");
  assert.equal(digest, task.handoffDigest, "CORRECTION_HANDOFF_TASK");
  validateLeaseRegistry(leases);
  for (const id of task.leaseIds)
    assert.equal(
      leases.leases[id]?.state,
      "RELEASED",
      "CORRECTION_PREDECESSOR_LEASE_ACTIVE",
    );
  return { task, handoff, leases, manifest };
}
function boundInput(token, input) {
  assert.equal(
    correctionDigest(input.task),
    token.grant.taskDigest,
    "CORRECTION_TASK_DIGEST",
  );
  assert.equal(
    input.handoff.digest,
    token.grant.handoffDigest,
    "CORRECTION_HANDOFF_DIGEST",
  );
  assert.equal(
    changeSetDigest(input.manifest),
    token.grant.manifestDigest,
    "CORRECTION_MANIFEST_DIGEST",
  );
}
function reservation(token) {
  return {
    kind: "TDP_GOVERNANCE_CORRECTION_RESERVATION",
    repository: CORRECTION.repository,
    key: token.key,
    issuedCommitSha: token.issuedCommitSha,
    grantDigest: token.coreDigest,
    predecessor: CORRECTION.predecessor,
    handoffDigest: token.grant.handoffDigest,
    successor: CORRECTION.successor,
    branch: CORRECTION.branch,
    envelopeDigest: token.grant.envelopeDigest,
  };
}
const refName = (key) => "refs/tags/tdp-task-correction-reservation/" + key;
function readReservation(
  key,
  expectedCommit,
  expectedPayload,
  prefix = "tdp-task-correction-reservation",
) {
  const root = "repos/" + CORRECTION.repository;
  const ref = correctionGithub(root + "/git/ref/tags/" + prefix + "/" + key);
  assert.equal(
    ref.ref,
    "refs/tags/" + prefix + "/" + key,
    "CORRECTION_RESERVATION_REF",
  );
  assert.equal(ref.object?.type, "commit", "CORRECTION_RESERVATION_TYPE");
  assert.equal(
    ref.object.sha,
    expectedCommit,
    "CORRECTION_RESERVATION_CHANGED",
  );
  const commit = correctionGithub(root + "/git/commits/" + expectedCommit);
  assert.equal(
    commit.sha,
    expectedCommit,
    "CORRECTION_RESERVATION_COMMIT_CHANGED",
  );
  assert.deepEqual(
    commit.parents.map((p) => p.sha),
    [expectedPayload.reservationCommitSha ?? expectedPayload.issuedCommitSha],
    "CORRECTION_RESERVATION_PARENT",
  );
  const tree = correctionGithub(root + "/git/trees/" + commit.tree.sha);
  assert.equal(tree.truncated, false, "CORRECTION_RESERVATION_TREE_TRUNCATED");
  assert.equal(tree.tree.length, 1, "CORRECTION_RESERVATION_TREE");
  const item = tree.tree[0];
  assert.equal(item.path, "reservation.json", "CORRECTION_RESERVATION_PATH");
  assert.equal(item.type, "blob", "CORRECTION_RESERVATION_BLOB");
  const blob = correctionGithub(root + "/git/blobs/" + item.sha);
  assert.equal(blob.encoding, "base64", "CORRECTION_RESERVATION_ENCODING");
  const bytes = Buffer.from(blob.content, "base64");
  assert.equal(
    createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex"),
    item.sha,
    "CORRECTION_RESERVATION_HASH",
  );
  assert.deepEqual(
    JSON.parse(bytes),
    expectedPayload,
    "CORRECTION_RESERVATION_PAYLOAD",
  );
}
function mainSha() {
  return correctionGithub("repos/" + CORRECTION.repository + "/commits/main")
    .sha;
}
function current(token) {
  const next = collectCorrectionAuthority({ expectedMain: token.mainSha });
  assert.equal(
    next.coreDigest,
    token.coreDigest,
    "CORRECTION_AUTHORITY_CHANGED",
  );
  assert.equal(
    next.grant.state,
    token.grant.state,
    "CORRECTION_AUTHORITY_STATE_CHANGED",
  );
  assert.deepEqual(
    next.grant.reservation,
    token.grant.reservation,
    "CORRECTION_AUTHORITY_RESERVATION_CHANGED",
  );
  return next;
}
function identity(root, base) {
  git(root, "merge-base", "--is-ancestor", base, "HEAD");
  return {
    headSha: git(root, "rev-parse", "HEAD"),
    treeSha: git(root, "rev-parse", "HEAD^{tree}"),
    branch: git(root, "branch", "--show-current"),
    baseIsAncestor: true,
    dirty: git(root, "status", "--porcelain", "--untracked-files=all") !== "",
  };
}

// Native invokes this entrypoint in the validated worktree. It never launches
// an arbitrary command. STARTED is the persisted task/lease transition itself;
// the receipt is not a claim that another worker process has run.
export function runCorrectionRuntime({
  action,
  root,
  predecessorState,
  historicalManifest,
}) {
  assert.ok(
    ["prepare", "start", "recover"].includes(action),
    "CORRECTION_ACTION_INVALID",
  );
  root = resolve(root);
  const input = loadPredecessor(
    resolve(predecessorState),
    resolve(historicalManifest),
  );
  const key = correctionKey(input.handoff.digest);
  const common = resolve(root, git(root, "rev-parse", "--git-common-dir"));
  const directory = join(
    common,
    "morro-control",
    "correction-transactions",
    key,
  );
  return withCorrectionLock(directory, () => {
    const journal = join(directory, "journal.ndjson");
    const records = readCorrectionJournal(journal);
    const token = collectCorrectionAuthority({ expectedMain: mainSha() });
    boundInput(token, input);
    assert.equal(token.key, key, "CORRECTION_KEY_CHANGED");
    const expected = reservation(token);
    if (records.length) {
      assert.deepEqual(
        records[0].value.reservation,
        expected,
        "CORRECTION_JOURNAL_GRANT_CHANGED",
      );
      assert.equal(records[0].value.root, root, "CORRECTION_WORKSPACE_CHANGED");
    }
    if (action === "prepare") {
      assert.equal(
        token.grant.state,
        "ISSUED",
        "CORRECTION_PREPARE_ALREADY_CONSUMED",
      );
      assert.equal(
        records.length,
        0,
        "CORRECTION_RESERVATION_ALREADY_ATTEMPTED",
      );
      current(token);
      const endpoint = "repos/" + CORRECTION.repository + "/git/";
      // Objects are immutable and do not reserve execution. The journal is
      // durable before the sole ref mutation; no catch block repeats a POST.
      const blob = correctionGithub(endpoint + "blobs", "POST", {
        content: bytesOf(expected),
        encoding: "utf-8",
      });
      const tree = correctionGithub(endpoint + "trees", "POST", {
        tree: [
          {
            path: "reservation.json",
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      });
      const commit = correctionGithub(endpoint + "commits", "POST", {
        message: "Reserve reviewed GOVERNANCE correction",
        tree: tree.sha,
        parents: [token.issuedCommitSha],
      });
      append(journal, "RESERVATION_INTENT", {
        reservation: expected,
        commitSha: commit.sha,
        root,
      });
      current(token);
      correctionGithub(endpoint + "refs", "POST", {
        ref: refName(key),
        sha: commit.sha,
      });
      readReservation(key, commit.sha, expected);
      append(journal, "RESERVED", { commitSha: commit.sha });
      return {
        state: "AWAITING_GOVERNED_CONSUMPTION",
        key,
        commitSha: commit.sha,
        issuedCommitSha: token.issuedCommitSha,
        workerStarted: false,
      };
    }
    assert.ok(records.length, "CORRECTION_ORIGINAL_JOURNAL_REQUIRED");
    const commit = records[0].value.commitSha;
    readReservation(key, commit, expected);
    if (action === "recover" && records.at(-1).stage === "RESERVATION_INTENT") {
      // Readback only; even a confirmed reservation never starts a worker.
      current(token);
      append(journal, "RESERVED", { commitSha: commit });
      return { state: "RESERVATION_RECONCILED", workerStarted: false };
    }
    assert.equal(
      token.grant.state,
      "CONSUMED",
      "CORRECTION_CANONICAL_CONSUMPTION_REQUIRED",
    );
    assert.equal(
      token.grant.reservation.commitSha,
      commit,
      "CORRECTION_CONSUMED_OTHER_RESERVATION",
    );
    const intent = records.find((record) => record.stage === "START_INTENT");
    if (intent) {
      assert.equal(action, "recover", "CORRECTION_START_ALREADY_ATTEMPTED");
      assert.equal(
        token.mainSha,
        intent.value.mainSha,
        "CORRECTION_RECOVERY_MAIN_CHANGED",
      );
      assert.deepEqual(
        identity(root, token.mainSha),
        intent.value.identity,
        "CORRECTION_RECOVERY_IDENTITY_CHANGED",
      );
      current(token);
      readReservation(
        key,
        intent.value.startCommitSha,
        intent.value.startPayload,
        "tdp-task-correction-start",
      );
      assert.deepEqual(
        intent.value.startPayload,
        {
          ...expected,
          kind: "TDP_GOVERNANCE_CORRECTION_START_INTENT",
          reservationCommitSha: commit,
          consumedMainSha: token.mainSha,
          candidateSha: intent.value.identity.headSha,
          treeSha: intent.value.identity.treeSha,
          transactionDigest: correctionDigest(intent.value.transaction),
        },
        "CORRECTION_RECOVERY_PAYLOAD_MISMATCH",
      );
      persistCorrectionTransaction(directory, intent.value.transaction);
      append(journal, "PERSISTENCE_RECONCILED", {
        startIntentDigest: intent.digest,
      });
      return {
        state: "RECONCILED_WITHOUT_RESTART",
        workerStarted: false,
        executionOutcome: "RECONCILE_ORIGINAL_INVOCATION",
      };
    }
    assert.equal(action, "start", "CORRECTION_RECOVER_CANNOT_START");
    assert.equal(records.at(-1).stage, "RESERVED", "CORRECTION_JOURNAL_STATE");
    const successor = json(
      join(root, ".morro/changesets/" + CORRECTION.successor + ".json"),
    );
    assert.equal(
      successor.baseSha,
      token.mainSha,
      "CORRECTION_EXACT_MAIN_REQUIRED",
    );
    const observed = identity(root, token.mainSha);
    assert.equal(observed.dirty, false, "CORRECTION_WORKSPACE_DIRTY");
    assert.equal(
      observed.branch,
      CORRECTION.branch,
      "CORRECTION_WORKSPACE_BRANCH",
    );
    const reanchorProof = buildClaimReanchorProof(root, {
      baseSha: token.mainSha,
      headSha: observed.headSha,
      manifestPath: ".morro/changesets/" + CORRECTION.successor + ".json",
    });
    const registry = json(join(root, ".github/morro-control/claims.json"));
    const leases = existsSync(join(directory, stateName("leases")))
      ? json(join(directory, stateName("leases")))
      : createLeaseRegistry();
    for (const [id, lease] of Object.entries(input.leases.leases)) {
      if (leases.leases[id])
        assert.deepEqual(leases.leases[id], lease, "CORRECTION_LEASE_CONFLICT");
      else leases.leases[id] = lease;
    }
    const schedule = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "tooling/mdctl/mdctl.mjs",
          "schedule",
          ".morro/changesets/" + CORRECTION.successor + ".json",
        ],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 180000,
          maxBuffer: 4 * 1024 * 1024,
        },
      ),
    );
    assert.ok(
      schedule.dispatchAllowed &&
        schedule.violations.length === 0 &&
        schedule.grants.some(
          (grant) =>
            grant.id === CORRECTION.successor &&
            grant.exactBaseSha === token.mainSha,
        ),
      "CORRECTION_SCHEDULER_GRANT_REQUIRED",
    );
    const fresh = current(token),
      now = new Date().toISOString();
    assertCorrectionAuthority(fresh, {
      task: input.task,
      changeSet: input.manifest,
      successor,
      claim: registry.claims[successor.id],
      now,
    });
    const proposed = buildTaskCorrection({
      task: input.task,
      changeSet: input.manifest,
      handoff: input.handoff,
      successor,
      leaseRegistry: leases,
      claimRegistry: registry,
      identity: observed,
      authority: fresh,
      reanchorProof,
      now,
      isAncestor: (a, b) => {
        try {
          git(root, "merge-base", "--is-ancestor", a, b);
          return true;
        } catch {
          return false;
        }
      },
      readCandidateDiff: (expectedIdentity) => ({
        ...expectedIdentity,
        changedFiles: git(
          root,
          "diff",
          "--name-only",
          token.mainSha + "..." + observed.headSha,
        )
          .split("\n")
          .filter(Boolean),
      }),
    });
    assert.equal(
      fileHash(join(directory, stateName("task"))),
      null,
      "CORRECTION_TASK_ALREADY_PRESENT",
    );
    assert.equal(
      fileHash(join(directory, stateName("context"))),
      null,
      "CORRECTION_CONTEXT_ALREADY_PRESENT",
    );
    const transaction = Object.fromEntries(
      Object.entries({
        task: proposed.task,
        context: proposed.contextPack,
        leases: proposed.leaseRegistry,
      }).map(([name, value]) => [
        name,
        {
          before: fileHash(join(directory, stateName(name))),
          bytes: bytesOf(value),
        },
      ]),
    );
    current(fresh);
    assert.deepEqual(
      identity(root, token.mainSha),
      observed,
      "CORRECTION_IDENTITY_MOVED",
    );
    const startPayload = {
      ...expected,
      kind: "TDP_GOVERNANCE_CORRECTION_START_INTENT",
      reservationCommitSha: commit,
      consumedMainSha: token.mainSha,
      candidateSha: observed.headSha,
      treeSha: observed.treeSha,
      transactionDigest: correctionDigest(transaction),
    };
    const endpoint = "repos/" + CORRECTION.repository + "/git/";
    const startBlob = correctionGithub(endpoint + "blobs", "POST", {
      content: bytesOf(startPayload),
      encoding: "utf-8",
    });
    const startTree = correctionGithub(endpoint + "trees", "POST", {
      tree: [
        {
          path: "reservation.json",
          mode: "100644",
          type: "blob",
          sha: startBlob.sha,
        },
      ],
    });
    const startCommit = correctionGithub(endpoint + "commits", "POST", {
      message: "Record reviewed GOVERNANCE correction start intent",
      tree: startTree.sha,
      parents: [commit],
    });
    current(fresh);
    append(journal, "START_INTENT", {
      mainSha: token.mainSha,
      identity: observed,
      transaction,
      startPayload,
      startCommitSha: startCommit.sha,
    });
    // Both durable intents precede task/lease effects. An uncertain ref POST
    // is never resent, even if persistence has not begun.
    correctionGithub(endpoint + "refs", "POST", {
      ref: "refs/tags/tdp-task-correction-start/" + key,
      sha: startCommit.sha,
    });
    readReservation(
      key,
      startCommit.sha,
      startPayload,
      "tdp-task-correction-start",
    );
    current(fresh);
    assert.deepEqual(
      identity(root, token.mainSha),
      observed,
      "CORRECTION_IDENTITY_MOVED",
    );
    persistCorrectionTransaction(directory, transaction);
    current(fresh);
    append(journal, "START_COMMITTED", {
      taskDigest: correctionDigest(proposed.task),
    });
    return {
      state: "STARTED",
      workerStarted: true,
      authority: "LOCAL_PERSISTED_CORRECTION_TASK_NOT_REMOTE_PROCESS_PROOF",
      stateDir: directory,
      taskPath: join(directory, stateName("task")),
      contextPath: join(directory, stateName("context")),
      leasePath: join(directory, stateName("leases")),
      supersedes: proposed.task.supersedes,
    };
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(
      process.argv.length,
      6,
      "CORRECTION_USAGE:action root predecessor-state historical-manifest",
    );
    const [action, root, predecessorState, historicalManifest] =
      process.argv.slice(2);
    console.log(
      JSON.stringify(
        runCorrectionRuntime({
          action,
          root,
          predecessorState,
          historicalManifest,
        }),
      ),
    );
  } catch (error) {
    // Never print provider response bodies or local task contents.
    console.error(
      String(error.message).match(/(?:TASK_)?CORRECTION_[A-Z_:.-]+/)?.[0] ??
        "CORRECTION_RUNTIME_FAILED",
    );
    process.exitCode = 1;
  }
}
