import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  realpathSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
  rmdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  changeSetDigest,
  validateChangeSetV2,
} from "./changeset-v2.mjs";
import { validateLeaseRegistry } from "./capability-leases.mjs";

/**
 * Bounded STARTED task handoff. This module never acquires leases or starts a
 * worker. Invoke through a clean checkout of current main:
 * mdctl task transfer --workspace <existing-css-worktree> --expected-main <sha>
 *
 * An independently governed, current-main record at the fixed path below must
 * authorize the exact before/after task bytes, workspace, claim and manifest.
 * Creating that record is a separate operation; this CLI cannot emit it.
 * The repository owner cessation assertion is recorded in that reviewed record.
 * A new scheduler evaluation and task restart are mandatory after completion.
 *
 * Persistence: one shared-repository lock and immutable intent, then one atomic
 * task replacement. The intent includes the complete previous task. If a crash
 * leaves the lock, STOP and reconcile it; never auto-delete a stale lock.
 * Repeating a committed transfer only reads back its identical after-image.
 * Recovery never issues leases, dispatches, deletes history or changes code.
 * Rollback after commit is a separately governed reverse transition, not reset.
 */
export const TRANSFER_REPOSITORY =
  "luizanunciostoca/touristic-digital-platform";
export const TRANSFER_EXECUTOR = "CODEX-STAGING-NODE-9482F85B-20261023";
export const TRANSFER_SUBJECTS = Object.freeze({
  "MD-CSS-ACCESSIBILITY-ENTRY-CONTRACT-20261022": Object.freeze({
    owner: "CT1072-CSS-ACCESSIBILITY-IMPLEMENTATION-3c87662f73e4",
    branch: "test/css-accessibility-entry-contract-20261022",
  }),
  "MD-HOME-CSS-CASCADE-COMPOSITION-20261022": Object.freeze({
    owner: "CT1072-CSS-COMPOSITION-IMPLEMENTATION-3c87662f73e4",
    branch: "fix/home-css-cascade-composition-20261022",
  }),
});
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
export const taskTransferDigest = (value) =>
  "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex");
const fail = (condition, code) => assert.ok(condition, "TASK_TRANSFER_" + code);
function exact(value, keys, code) {
  fail(value && typeof value === "object" && !Array.isArray(value), code);
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    "TASK_TRANSFER_" + code,
  );
}
export function taskTransferAfter(before, authority) {
  return {
    ...structuredClone(before),
    owner: TRANSFER_EXECUTOR,
    candidateSha: authority.headSha,
    treeSha: authority.treeSha,
    leaseIds: [],
    contextPackDigest: null,
    localProof: null,
    testedAt: null,
    submittedAt: null,
    handoffDigest: null,
  };
}
export function validateTaskTransfer(input, now = new Date().toISOString()) {
  const { task, manifest, claim, leases, authority, identity } = input;
  const subject = TRANSFER_SUBJECTS[manifest?.id];
  fail(subject, "SUBJECT_NOT_ALLOWED");
  validateChangeSetV2(manifest);
  validateLeaseRegistry(leases);
  exact(
    authority,
    [
      "schemaVersion",
      "kind",
      "repository",
      "changeSetId",
      "fromOwner",
      "toOwner",
      "state",
      "taskDigest",
      "afterDigest",
      "manifestDigest",
      "claimDigest",
      "headSha",
      "treeSha",
      "workspace",
      "issuedAt",
      "expiresAt",
      "cessation",
    ],
    "AUTHORIZATION_FIELDS",
  );
  fail(
    authority.schemaVersion === 1 &&
      authority.kind === "TDP_CSS_STARTED_TASK_TRANSFER",
    "AUTHORIZATION_KIND",
  );
  fail(authority.repository === TRANSFER_REPOSITORY, "REPOSITORY");
  fail(authority.state === "AUTHORIZED", "NOT_AUTHORIZED");
  fail(
    authority.changeSetId === manifest.id &&
      authority.fromOwner === subject.owner &&
      authority.toOwner === TRANSFER_EXECUTOR,
    "AUTHORIZATION_IDENTITY",
  );
  exact(
    authority.cessation,
    ["basis", "ownerLogin", "reference"],
    "CESSATION_FIELDS",
  );
  fail(
    authority.cessation.basis ===
      "REPOSITORY_OWNER_REPORTED_NO_OTHER_WORKERS" &&
      authority.cessation.ownerLogin === "luizanunciostoca" &&
      typeof authority.cessation.reference === "string" &&
      authority.cessation.reference.length > 0,
    "CESSATION_REQUIRED",
  );
  for (const field of [
    "taskDigest",
    "afterDigest",
    "manifestDigest",
    "claimDigest",
  ])
    fail(HASH.test(authority[field]), "DIGEST_FORMAT");
  fail(
    SHA.test(authority.headSha) && SHA.test(authority.treeSha),
    "GIT_IDENTITY",
  );
  const clock = Date.parse(now),
    issued = Date.parse(authority.issuedAt),
    expires = Date.parse(authority.expiresAt);
  fail(
    Number.isFinite(clock) &&
      Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      issued <= clock &&
      clock < expires &&
      expires - issued <= 1800000,
    "AUTHORIZATION_EXPIRED",
  );
  fail(
    task.state === "STARTED" && task.owner === subject.owner,
    "TASK_STATE_OR_OWNER",
  );
  fail(
    task.changeSetId === manifest.id &&
      task.branch === subject.branch &&
      manifest.branch === subject.branch &&
      task.baseSha === manifest.baseSha,
    "TASK_IDENTITY",
  );
  fail(
    task.changeSetDigest === changeSetDigest(manifest) &&
      authority.manifestDigest === task.changeSetDigest,
    "MANIFEST_CHANGED",
  );
  fail(authority.taskDigest === taskTransferDigest(task), "TASK_CHANGED");
  fail(
    authority.afterDigest ===
      taskTransferDigest(taskTransferAfter(task, authority)),
    "AFTER_CHANGED",
  );
  fail(
    claim.owner === "CHATGPT-PRO-CONTROL" &&
      claim.branch === subject.branch &&
      Date.parse(claim.expiresAt) > clock &&
      claim.status === "IMPLEMENTING",
    "CLAIM_INVALID",
  );
  assert.deepEqual(
    [...claim.paths].sort(),
    [...manifest.owns.paths].sort(),
    "TASK_TRANSFER_CLAIM_SCOPE",
  );
  fail(authority.claimDigest === taskTransferDigest(claim), "CLAIM_CHANGED");
  fail(
    identity.dirty === false &&
      identity.baseIsAncestor === true &&
      identity.branch === subject.branch &&
      identity.headSha === authority.headSha &&
      identity.treeSha === authority.treeSha &&
      identity.workspace === authority.workspace,
    "WORKSPACE_CHANGED",
  );
  fail(
    Array.isArray(task.leaseIds) &&
      task.leaseIds.every((id) => leases.leases[id]),
    "LEASE_HISTORY_MISSING",
  );
  for (const lease of Object.values(leases.leases)) {
    if (lease.changeSetId !== manifest.id) continue;
    fail(Number.isFinite(Date.parse(lease.expiresAt)), "LEASE_TIME");
    fail(
      !(lease.state === "ACTIVE" && Date.parse(lease.expiresAt) > clock),
      "VALID_LEASE_EXISTS",
    );
  }
  return taskTransferAfter(task, authority);
}
const git = (root, ...args) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    timeout: 30000,
  }).trim();
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
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
      {
        encoding: "utf8",
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024,
      },
    ),
  );
}
function blob(path, ref) {
  const item = github("contents/" + path + "?ref=" + ref);
  fail(item.type === "file" && item.encoding === "base64", "REMOTE_FILE");
  const bytes = Buffer.from(item.content, "base64");
  fail(
    createHash("sha1")
      .update("blob " + bytes.length + "\0")
      .update(bytes)
      .digest("hex") === item.sha,
    "REMOTE_BLOB",
  );
  return JSON.parse(bytes.toString("utf8"));
}
function flushFile(path, bytes, exclusive = true) {
  const fd = openSync(path, exclusive ? "wx" : "w", 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function flushDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
/** Single task-file transaction. Caller must hold the shared lock and revalidate authority. */
export function persistTaskTransfer({
  taskPath,
  historyPath,
  before,
  after,
  authority,
  revalidate,
}) {
  const expected = { version: 1, authority, before, after };
  const current = json(taskPath);
  const beforeDigest = taskTransferDigest(before),
    afterDigest = taskTransferDigest(after);
  fail(
    beforeDigest === authority.taskDigest &&
      afterDigest === authority.afterDigest,
    "TRANSACTION_BINDING",
  );
  if (existsSync(historyPath)) {
    assert.deepEqual(
      json(historyPath),
      expected,
      "TASK_TRANSFER_HISTORY_MISMATCH",
    );
  } else {
    fail(
      taskTransferDigest(current) === beforeDigest,
      "MISSING_ORIGINAL_HISTORY",
    );
    flushFile(historyPath, JSON.stringify(expected, null, 2) + "\n");
    flushDirectory(dirname(historyPath));
  }
  revalidate();
  const observed = taskTransferDigest(json(taskPath));
  if (observed === afterDigest)
    return { state: "TRANSFERRED_RESTART_REQUIRED", replay: true };
  fail(observed === beforeDigest, "TASK_CHANGED_BEFORE_COMMIT");
  const temporary = taskPath + ".transfer-pending";
  fail(!existsSync(temporary), "PENDING_TRANSACTION_REQUIRES_RECONCILIATION");
  flushFile(temporary, JSON.stringify(after, null, 2) + "\n");
  revalidate();
  fail(
    taskTransferDigest(json(taskPath)) === beforeDigest,
    "TASK_CHANGED_BEFORE_RENAME",
  );
  renameSync(temporary, taskPath);
  flushDirectory(dirname(taskPath));
  fail(taskTransferDigest(json(taskPath)) === afterDigest, "READBACK");
  return { state: "TRANSFERRED_RESTART_REQUIRED", replay: false };
}
export async function runTaskTransferCli(args, { root }) {
  fail(
    args.length === 4 &&
      args[0] === "--workspace" &&
      args[2] === "--expected-main",
    "ARGUMENTS",
  );
  const workspace = realpathSync(args[1]),
    expectedMain = args[3];
  fail(SHA.test(expectedMain), "EXPECTED_MAIN");
  const authorityRoot = realpathSync(root);
  fail(
    git(authorityRoot, "rev-parse", "HEAD") === expectedMain &&
      git(authorityRoot, "status", "--porcelain", "--untracked-files=all") ===
        "",
    "TRUSTED_CHECKOUT",
  );
  const ownPath = fileURLToPath(import.meta.url);
  fail(
    ownPath === join(authorityRoot, "tooling/mdctl/task-transfer.mjs"),
    "TRUSTED_ENTRYPOINT",
  );
  fail(
    git(authorityRoot, "hash-object", ownPath) ===
      git(
        authorityRoot,
        "rev-parse",
        expectedMain + ":tooling/mdctl/task-transfer.mjs",
      ),
    "EXECUTABLE_CHANGED",
  );
  const branch = git(workspace, "branch", "--show-current");
  const id = Object.keys(TRANSFER_SUBJECTS).find(
    (key) => TRANSFER_SUBJECTS[key].branch === branch,
  );
  fail(id, "SUBJECT_NOT_ALLOWED");
  const manifestPath = ".morro/changesets/" + id + ".json";
  const authorityPath = ".morro/task-transfers/" + id + ".json";
  const common = realpathSync(
    resolve(workspace, git(workspace, "rev-parse", "--git-common-dir")),
  );
  const stateDir = resolve(
    workspace,
    git(workspace, "rev-parse", "--git-path", "morro-control"),
  );
  const taskPath = join(stateDir, id + ".task.json");
  const historyPath = join(stateDir, id + ".transfer-history.json");
  const lock = join(common, "css-started-transfer.lock");
  mkdirSync(lock);
  let complete = false;
  try {
    const initial = json(taskPath);
    const historical = existsSync(historyPath)
      ? json(historyPath).before
      : initial;
    let boundAuthorization;
    const capture = () => {
      fail(github("commits/main").sha === expectedMain, "MAIN_MOVED");
      const authority = blob(authorityPath, expectedMain);
      if (boundAuthorization)
        assert.deepEqual(
          authority,
          boundAuthorization,
          "TASK_TRANSFER_AUTHORIZATION_CHANGED",
        );
      const manifest = json(join(workspace, manifestPath));
      const registry = blob(".github/morro-control/claims.json", expectedMain);
      const claim = registry.claims?.[id];
      fail(claim, "CLAIM_MISSING");
      // Scope cannot drift between the historical task and canonical main.
      const canonicalManifest = blob(manifestPath, expectedMain);
      const envelope = ({ baseSha, state, ...rest }) => rest;
      assert.deepEqual(
        envelope(manifest),
        envelope(canonicalManifest),
        "TASK_TRANSFER_CANONICAL_SCOPE_CHANGED",
      );
      const leases = json(join(stateDir, "capability-leases.json"));
      const identity = {
        workspace,
        branch: git(workspace, "branch", "--show-current"),
        headSha: git(workspace, "rev-parse", "HEAD"),
        treeSha: git(workspace, "rev-parse", "HEAD^{tree}"),
        dirty:
          git(workspace, "status", "--porcelain", "--untracked-files=all") !==
          "",
        baseIsAncestor:
          execFileSync(
            "git",
            [
              "-C",
              workspace,
              "merge-base",
              "--is-ancestor",
              manifest.baseSha,
              "HEAD",
            ],
            { encoding: "utf8", timeout: 30000 },
          ) === "",
      };
      // Use the canonical scheduler's LIVE view; a caller-supplied plan is not accepted.
      const schedule = JSON.parse(
        execFileSync(
          process.execPath,
          ["tooling/mdctl/mdctl.mjs", "schedule", manifestPath],
          {
            cwd: authorityRoot,
            encoding: "utf8",
            timeout: 120000,
            maxBuffer: 4 * 1024 * 1024,
          },
        ),
      );
      fail(
        schedule.exactMainSha === expectedMain &&
          schedule.dispatchAllowed === true &&
          schedule.violations?.length === 0 &&
          schedule.activeWriters?.length === 0 &&
          schedule.grants?.some(
            (grant) => grant.id === id && grant.exactBaseSha === expectedMain,
          ),
        "CURRENT_SCHEDULER_REQUIRED",
      );
      const after = validateTaskTransfer({
        task: historical,
        manifest,
        claim,
        leases,
        authority,
        identity,
      });
      fail(github("commits/main").sha === expectedMain, "MAIN_MOVED");
      boundAuthorization = authority;
      return after;
    };
    const after = capture();
    const result = persistTaskTransfer({
      taskPath,
      historyPath,
      before: historical,
      after,
      authority: boundAuthorization,
      revalidate: capture,
    });
    complete = true;
    return {
      ...result,
      changeSetId: id,
      owner: TRANSFER_EXECUTOR,
      candidateSha: after.candidateSha,
      treeSha: after.treeSha,
      leasesAcquired: false,
      workerStarted: false,
    };
  } finally {
    // Failure leaves the lock as a reconciliation signal. No automatic takeover.
    if (complete) {
      rmdirSync(lock);
      flushDirectory(common);
    }
  }
}
