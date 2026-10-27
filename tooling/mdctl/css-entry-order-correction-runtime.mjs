import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  realpathSync,
  lstatSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, changeSetDigest } from "./changeset-v2.mjs";
import {
  buildTaskCorrection,
  collectTaskGitIdentity,
} from "./task-lifecycle.mjs";
import {
  collectCorrectionAuthority,
  assertCorrectionAuthority,
  assertCssProvisioningAuthority,
  correctionDigest,
  correctionEnvelope,
  CSS_ENTRY_ORDER_CORRECTION as C,
} from "./task-correction-authority.mjs";

import { buildClaimReanchorProof } from "../fabric/claim-guard.mjs";
import { buildClaimReanchor } from "./claim-lifecycle.mjs";
import { validateLeaseRegistry } from "./capability-leases.mjs";

const check = (value, code) => assert.ok(value, "CSS_CORRECTION_" + code);
const same = (a, b, code) => assert.deepEqual(a, b, "CSS_CORRECTION_" + code);
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (root, ...args) =>
  execFileSync("git", ["--no-optional-locks", "-C", root, ...args], {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  }).trim();
const predecessorWorkspace = join(
  C.nativeHome,
  "worktrees",
  C.predecessorDirectory,
);
const nativeCommon = join(C.nativeHome, "repos/touristic-digital-platform.git");
const digestBytes = (b) => createHash("sha256").update(b).digest("hex");
const provisionJournal = (common, key) =>
  join(common, "css-entry-order-provisioning-" + key + ".json");
const receiptPath = (g) =>
  join(
    C.nativeHome,
    "worktrees/.morro-meta",
    g.workspace.split("/").at(-1) + ".json",
  );
function pathPresent(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
// Inventory only the fixed canonical directories; never discover another root.
// Expired metadata does not prove the earlier successor was never provisioned.
function assertRetiredNativeIdentityAbsent() {
  const home = join(C.nativeHome, "worktrees");
  same(realpathSync(home), home, "RETIRED_INVENTORY_PATH");
  check(
    !readdirSync(home).some(
      (name) =>
        name === C.retiredSuccessor ||
        name.startsWith(C.retiredSuccessor + "-"),
    ),
    "RETIRED_WORKSPACE_PRESENT",
  );
  const meta = join(home, ".morro-meta");
  if (pathPresent(meta)) {
    same(realpathSync(meta), meta, "RETIRED_META_PATH");
    check(
      !readdirSync(meta).some((name) =>
        name.startsWith(C.retiredSuccessor + "-"),
      ),
      "RETIRED_RECEIPT_PRESENT",
    );
  }
  const inventory = git(nativeCommon, "worktree", "list", "--porcelain");
  check(
    !inventory
      .split("\n")
      .some(
        (line) =>
          line.startsWith("worktree ") &&
          (line.slice(9).split("/").at(-1) ?? "").startsWith(
            C.retiredSuccessor + "-",
          ),
      ),
    "RETIRED_REGISTERED_WORKSPACE",
  );
  const sourceState = resolve(
    predecessorWorkspace,
    git(predecessorWorkspace, "rev-parse", "--git-path", "morro-control"),
  );
  for (const suffix of ["task", "handoff", "context-pack"])
    check(
      !pathPresent(
        join(sourceState, C.retiredSuccessor + "." + suffix + ".json"),
      ),
      "RETIRED_TASK_PRESENT",
    );
  const captured = snapshot(join(sourceState, "capability-leases.json"));
  const leases = validateLeaseRegistry(JSON.parse(captured.bytes));
  same(
    snapshot(captured.path).bytes,
    captured.bytes,
    "RETIRED_LEASE_INPUT_CHANGED",
  );
  check(
    !Object.values(leases.leases).some(
      (lease) => lease.changeSetId === C.retiredSuccessor,
    ),
    "RETIRED_LEASE_PRESENT",
  );
}
function snapshot(path) {
  check(
    lstatSync(path).isFile() &&
      !lstatSync(path).isSymbolicLink() &&
      lstatSync(path).size <= 262144,
    "SOURCE_REGULAR",
  );
  same(realpathSync(path), path, "SNAPSHOT_PATH");
  return { path, bytes: readFileSync(path) };
}
function syncDirectory(path) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function exclusiveJson(path, value) {
  const fd = openSync(path, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function trustedPreparationRoot(root, expectedMain) {
  same(realpathSync(root), root, "TRUSTED_PATH");
  check(root.startsWith(C.nativeHome + "/worktrees/"), "NATIVE_REQUIRED");
  same(git(root, "rev-parse", "HEAD"), expectedMain, "TRUSTED_HEAD");
  same(
    git(root, "status", "--porcelain", "--untracked-files=all"),
    "",
    "TRUSTED_DIRTY",
  );
  const path = "tooling/mdctl/css-entry-order-correction-runtime.mjs";
  same(fileURLToPath(import.meta.url), join(root, path), "TRUSTED_ENTRYPOINT");
  same(
    git(root, "hash-object", join(root, path)),
    git(root, "rev-parse", expectedMain + ":" + path),
    "EXECUTABLE_CHANGED",
  );
}

function provisionedEvidence(authority, common, binding) {
  check(authority.grant.state === "CONSUMED", "PROVISION_CONSUMPTION_REQUIRED");
  const g = authority.grant,
    l = g.provisioningLease,
    bound = g.reservation.provisioningReceipt;
  const receipt = snapshot(receiptPath(g)),
    provisioning = snapshot(provisionJournal(common, authority.key));
  same(
    digestBytes(receipt.bytes),
    bound.receiptSha256,
    "PROVISION_RECEIPT_HASH",
  );
  same(
    JSON.parse(receipt.bytes),
    {
      task: C.successor,
      lease: l.leaseId,
      sha: l.sourceMainSha,
      ref: l.sourceMainSha,
      path: g.workspace,
      createdAt: bound.createdAt,
    },
    "PROVISION_RECEIPT",
  );
  same(
    JSON.parse(provisioning.bytes),
    {
      schemaVersion: 1,
      state: "PROVISIONED",
      key: authority.key,
      issuedCommitSha: authority.issuedCommitSha,
      leaseDigest: correctionDigest(l),
      workspace: g.workspace,
      sourceMainSha: l.sourceMainSha,
      receiptSha256: bound.receiptSha256,
      ...(binding ? { binding } : {}),
    },
    "PROVISION_JOURNAL",
  );
  return [receipt, provisioning];
}

// A reviewed metadata candidate must already be present as an immutable Git
// object. Reuse the canonical transition builder before checkout and its exact
// Git certificate after checkout. No arbitrary ref, branch or product diff.
export function bindCssCorrectionWorkspace({
  root,
  expectedMain,
  candidateSha,
}) {
  check(/^[a-f0-9]{40}$/u.test(candidateSha), "BIND_CANDIDATE");
  trustedPreparationRoot(root, expectedMain);
  assertRetiredNativeIdentityAbsent();
  const authority = assertCssProvisioningAuthority(
    collectCorrectionAuthority({ expectedMain, successor: C.successor }),
    "CONSUMED",
  );
  const g = authority.grant,
    workspace = g.workspace,
    common = nativeCommon;
  same(realpathSync(workspace), workspace, "BIND_WORKSPACE");
  same(realpathSync(common), common, "COMMON_DIR");
  same(
    resolve(workspace, git(workspace, "rev-parse", "--git-common-dir")),
    common,
    "COMMON_DIR",
  );
  const inputs = provisionedEvidence(authority, common);
  const registryPath = ".github/morro-control/claims.json",
    ledgerPath = ".github/morro-control/events.ndjson",
    manifestPath = ".morro/changesets/" + C.successor + ".json";
  same(
    git(root, "merge-base", expectedMain, candidateSha),
    expectedMain,
    "BIND_BASE",
  );
  same(
    git(root, "diff", "--name-only", expectedMain + "..." + candidateSha)
      .split("\n")
      .sort(),
    [registryPath, ledgerPath, manifestPath].sort(),
    "BIND_PATHS",
  );
  const read = (sha, path) =>
    execFileSync(
      "git",
      ["--no-optional-locks", "-C", root, "show", sha + ":" + path],
      { encoding: "utf8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
    );
  for (const sha of [expectedMain, candidateSha])
    for (const path of [registryPath, ledgerPath, manifestPath])
      check(
        git(root, "ls-tree", sha, "--", path).startsWith("100644 blob "),
        "BIND_REGULAR",
      );
  const ledger = read(candidateSha, ledgerPath),
    event = JSON.parse(ledger.trim().split("\n").at(-1));
  const transition = buildClaimReanchor({
    registry: JSON.parse(read(expectedMain, registryPath)),
    ledgerText: read(expectedMain, ledgerPath),
    manifest: JSON.parse(read(expectedMain, manifestPath)),
    newBaseSha: expectedMain,
    observedAt: event.observedAt,
  });
  same(
    JSON.parse(read(candidateSha, registryPath)),
    transition.registry,
    "BIND_REGISTRY",
  );
  same(
    JSON.parse(read(candidateSha, manifestPath)),
    transition.manifest,
    "BIND_MANIFEST",
  );
  same(ledger, transition.ledgerText, "BIND_LEDGER");
  const lock = join(common, "css-started-transfer.lock");
  mkdirSync(lock, { mode: 0o700 });
  let checkoutAttempted = false;
  const stable = () => {
    assertRetiredNativeIdentityAbsent();
    const fresh = assertCssProvisioningAuthority(
      collectCorrectionAuthority({ expectedMain, successor: C.successor }),
      "CONSUMED",
    );
    same(fresh.grant, g, "GRANT_CHANGED");
    trustedPreparationRoot(root, expectedMain);
    for (const e of inputs)
      same(snapshot(e.path).bytes, e.bytes, "INPUT_CHANGED");
    same(realpathSync(workspace), workspace, "BIND_WORKSPACE");
    same(
      resolve(workspace, git(workspace, "rev-parse", "--git-common-dir")),
      common,
      "COMMON_DIR",
    );
    same(
      git(workspace, "status", "--porcelain", "--untracked-files=all"),
      "",
      "BIND_DIRTY",
    );
    same(
      git(workspace, "rev-parse", "HEAD"),
      checkoutAttempted ? candidateSha : g.provisioningLease.sourceMainSha,
      "BIND_HEAD",
    );
    same(
      git(workspace, "branch", "--show-current"),
      checkoutAttempted ? C.branch : "",
      "BIND_BRANCH",
    );
    check(
      !pathPresent(
        resolve(
          workspace,
          git(workspace, "rev-parse", "--git-path", "morro-control"),
        ),
      ),
      "SUCCESSOR_STATE_EXISTS",
    );
    check(
      !pathPresent(
        join(common, "css-entry-order-correction-" + authority.key + ".json"),
      ),
      "RESERVATION_REPLAY",
    );
    assertRetiredNativeIdentityAbsent();
    assertCssProvisioningAuthority(fresh, "CONSUMED");
  };
  try {
    stable();
    checkoutAttempted = true;
    git(workspace, "checkout", "-b", C.branch, candidateSha);
    stable();
    buildClaimReanchorProof(workspace, {
      baseSha: expectedMain,
      headSha: candidateSha,
      manifestPath,
    });
    const journal = inputs[1].path,
      bound = {
        ...JSON.parse(inputs[1].bytes),
        binding: { mainSha: expectedMain, candidateSha },
      };
    exclusiveJson(journal + ".binding", bound);
    stable();
    same(json(journal + ".binding"), bound, "BIND_PREPARED");
    renameSync(journal + ".binding", journal);
    syncDirectory(common);
    rmdirSync(lock);
    return {
      state: "WORKSPACE_BOUND_TASK_PREPARATION_REQUIRED",
      workspace,
      candidateSha,
    };
  } catch {
    return {
      state: "BINDING_RECONCILIATION_REQUIRED",
      checkoutAttempted,
      workspace,
      lock,
    };
  }
}

// No grant writer, task starter, branch mutator or dispatcher. The caller must
// separately obtain a reviewed canonical ISSUED grant; absence fails closed.
export function prepareCssCorrectionWorkspace({ root, expectedMain }) {
  trustedPreparationRoot(root, expectedMain);
  assertRetiredNativeIdentityAbsent();
  const authority = assertCssProvisioningAuthority(
    collectCorrectionAuthority({ expectedMain, successor: C.successor }),
  );
  const g = authority.grant,
    l = g.provisioningLease;
  const common = nativeCommon,
    worktrees = join(C.nativeHome, "worktrees");
  for (const p of [common, worktrees, predecessorWorkspace])
    same(realpathSync(p), p, "PROVISION_REALPATH");
  same(
    git(common, "rev-parse", "--is-bare-repository"),
    "true",
    "PROVISION_BARE",
  );
  same(
    git(common, "remote", "get-url", "origin"),
    C.gitRemote,
    "PROVISION_ORIGIN",
  );
  same(
    resolve(
      predecessorWorkspace,
      git(predecessorWorkspace, "rev-parse", "--git-common-dir"),
    ),
    common,
    "SOURCE_COMMON",
  );
  same(
    git(predecessorWorkspace, "rev-parse", "HEAD"),
    C.preservedSha,
    "SOURCE_CHANGED",
  );
  const sourceState = resolve(
    predecessorWorkspace,
    git(predecessorWorkspace, "rev-parse", "--git-path", "morro-control"),
  );
  const inputs = ["task", "handoff", "context-pack"].map((k) =>
    snapshot(join(sourceState, C.predecessor + "." + k + ".json")),
  );
  inputs.push(snapshot(join(sourceState, "capability-leases.json")));
  const [task, handoff, context, leases] = inputs.map((e) =>
    JSON.parse(e.bytes),
  );
  same(correctionDigest(task), C.taskDigest, "TASK_DIGEST");
  same(handoff.digest, C.handoffDigest, "HANDOFF_DIGEST");
  same(context.digest, task.contextPackDigest, "CONTEXT_DIGEST");
  same(task.state, "SUBMITTED", "STATE");
  const related = Object.values(leases.leases).filter(
    (e) => e.changeSetId === C.predecessor,
  );
  check(
    related.length > 0 && related.every((e) => e.state === "RELEASED"),
    "LEASE_NOT_RELEASED",
  );
  const controller = join(
    C.nativeHome,
    "morro-termux-control/scripts/tdp-worktreectl.sh",
  );
  inputs.push(snapshot(controller));
  same(
    git(root, "hash-object", controller),
    C.controllerBlobSha,
    "PROVISION_CONTROLLER",
  );
  const meta = join(worktrees, ".morro-meta");
  if (pathPresent(meta)) same(realpathSync(meta), meta, "PROVISION_META");
  check(
    !pathPresent(g.workspace) && !pathPresent(receiptPath(g)),
    "PROVISION_REUSE",
  );
  const lock = join(common, "css-started-transfer.lock"),
    journal = provisionJournal(common, authority.key);
  mkdirSync(lock, { mode: 0o700 });
  let controllerAttempted = false;
  let stage = "AUTHORITY_RECHECK";
  const stable = () => {
    assertRetiredNativeIdentityAbsent();
    const fresh = assertCssProvisioningAuthority(
      collectCorrectionAuthority({ expectedMain, successor: C.successor }),
    );
    same(fresh.grant, g, "GRANT_CHANGED");
    trustedPreparationRoot(root, expectedMain);
    for (const p of [common, worktrees, predecessorWorkspace])
      same(realpathSync(p), p, "PROVISION_REALPATH");
    if (pathPresent(meta)) same(realpathSync(meta), meta, "PROVISION_META");
    same(
      git(common, "remote", "get-url", "origin"),
      C.gitRemote,
      "PROVISION_ORIGIN",
    );
    if (!controllerAttempted)
      check(
        !pathPresent(g.workspace) && !pathPresent(receiptPath(g)),
        "PROVISION_REUSE",
      );
    same(
      git(predecessorWorkspace, "rev-parse", "HEAD"),
      C.preservedSha,
      "SOURCE_CHANGED",
    );
    same(
      git(
        predecessorWorkspace,
        "status",
        "--porcelain",
        "--untracked-files=all",
      ),
      "",
      "SOURCE_DIRTY",
    );
    for (const entry of inputs)
      same(snapshot(entry.path).bytes, entry.bytes, "INPUT_CHANGED");
    if (controllerAttempted) {
      same(realpathSync(g.workspace), g.workspace, "PROVISION_WORKSPACE");
      same(
        resolve(g.workspace, git(g.workspace, "rev-parse", "--git-common-dir")),
        common,
        "PROVISION_COMMON",
      );
      same(
        git(g.workspace, "rev-parse", "HEAD"),
        l.sourceMainSha,
        "PROVISION_HEAD",
      );
      same(
        git(g.workspace, "branch", "--show-current"),
        "",
        "PROVISION_DETACHED",
      );
      same(
        git(g.workspace, "status", "--porcelain", "--untracked-files=all"),
        "",
        "PROVISION_DIRTY",
      );
    }
    assertRetiredNativeIdentityAbsent();
    assertCssProvisioningAuthority(fresh);
  };
  try {
    stable();
    check(
      !existsSync(
        join(common, "css-entry-order-correction-" + authority.key + ".json"),
      ),
      "RESERVATION_REPLAY",
    );
    stage = "RESERVE_JOURNAL";
    const record = {
      schemaVersion: 1,
      state: "RESERVED",
      key: authority.key,
      issuedCommitSha: authority.issuedCommitSha,
      leaseDigest: correctionDigest(l),
      workspace: g.workspace,
      sourceMainSha: l.sourceMainSha,
    };
    exclusiveJson(journal, record);
    syncDirectory(common);
    inputs.push(snapshot(journal));
    stable();
    stage = "CONTROLLER_CREATE";
    controllerAttempted = true;
    // Only fixed destinations and a fixed executable search path are passed.
    // Inherited TDP_*, Git configuration overrides and shell startup variables
    // cannot redirect the controller. Authentication uses its existing store.
    execFileSync(
      join(C.nativeBin, "bash"),
      [
        controller,
        "create",
        C.successor,
        l.leaseId,
        l.sourceMainSha,
        l.sourceMainSha,
      ],
      {
        cwd: root,
        timeout: 60000,
        maxBuffer: 65536,
        env: {
          HOME: C.nativeHome,
          PATH: C.nativeBin + ":/system/bin:/usr/bin:/bin",
          LANG: "C",
          TDP_REPO_URL: C.gitRemote,
          TDP_BARE_STORE: common,
          TDP_WORKTREE_ROOT: worktrees,
          TDP_WORKTREE_META_ROOT: meta,
          TDP_DEFAULT_BRANCH: "main",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    stage = "RECEIPT_READBACK";
    same(realpathSync(g.workspace), g.workspace, "PROVISION_WORKSPACE");
    same(
      resolve(g.workspace, git(g.workspace, "rev-parse", "--git-common-dir")),
      common,
      "PROVISION_COMMON",
    );
    same(
      git(g.workspace, "rev-parse", "HEAD"),
      l.sourceMainSha,
      "PROVISION_HEAD",
    );
    same(
      git(g.workspace, "branch", "--show-current"),
      "",
      "PROVISION_DETACHED",
    );
    same(
      git(g.workspace, "status", "--porcelain", "--untracked-files=all"),
      "",
      "PROVISION_DIRTY",
    );
    const receipt = snapshot(receiptPath(g)),
      r = JSON.parse(receipt.bytes);
    same(
      Object.keys(r).sort(),
      ["task", "lease", "sha", "ref", "path", "createdAt"].sort(),
      "PROVISION_RECEIPT_FIELDS",
    );
    same(
      { ...r, createdAt: null },
      {
        task: C.successor,
        lease: l.leaseId,
        sha: l.sourceMainSha,
        ref: l.sourceMainSha,
        path: g.workspace,
        createdAt: null,
      },
      "PROVISION_RECEIPT",
    );
    check(
      Date.parse(r.createdAt) >= Date.parse(g.issuedAt) &&
        Date.parse(r.createdAt) < Date.parse(g.expiresAt),
      "PROVISION_RECEIPT_TIME",
    );
    inputs.push(receipt);
    stage = "FINAL_AUTHORITY_RECHECK";
    stable();
    const result = {
      ...record,
      state: "PROVISIONED",
      receiptSha256: digestBytes(receipt.bytes),
    };
    exclusiveJson(journal + ".pending", result);
    stable();
    same(json(journal + ".pending"), result, "PROVISION_PREPARED");
    stage = "JOURNAL_PUBLICATION";
    renameSync(journal + ".pending", journal);
    syncDirectory(common);
    rmdirSync(lock);
    return {
      state: "WORKSPACE_PROVISIONED_CONSUMPTION_REVIEW_REQUIRED",
      workspace: g.workspace,
      journal,
      receiptSha256: result.receiptSha256,
    };
  } catch (error) {
    // A timeout can occur after creation. Never imply absence of side effects.
    return {
      state: "PROVISION_RECONCILIATION_REQUIRED",
      stage,
      controllerAttempted,
      workspaceExists: existsSync(g.workspace),
      receiptExists: existsSync(receiptPath(g)),
      lock,
      journal,
      reason:
        typeof error.code === "string" && /^[A-Z0-9_]+$/u.test(error.code)
          ? error.code
          : "VALIDATION_OR_CONTROLLER_FAILURE",
    };
  }
}

// Pure boundary checks, not a token factory or an alternative execution API.
export function validateCssCorrectionInputs({
  task,
  changeSet,
  handoff,
  successor,
  leaseRegistry,
  sourceIdentity,
  workspace,
  grant,
}) {
  same(task?.changeSetId, C.predecessor, "PREDECESSOR");
  same(task.owner, C.executor, "EXECUTOR");
  same(task.state, "SUBMITTED", "STATE");
  same(handoff?.digest, C.handoffDigest, "HANDOFF_DIGEST");
  same(handoff.candidateSha, C.handoffSha, "HANDOFF_SHA");
  same(task.candidateSha, C.handoffSha, "TASK_CANDIDATE");
  same(sourceIdentity.headSha, C.preservedSha, "PRESERVED_SHA");
  same(sourceIdentity.workspace, predecessorWorkspace, "PREDECESSOR_WORKSPACE");
  same(sourceIdentity.productBlob, C.productBlob, "PRODUCT_BLOB");
  same(workspace, grant.workspace, "WORKSPACE_BINDING");
  same(successor.id, C.successor, "SUCCESSOR");
  same(successor.branch, C.branch, "BRANCH");
  same(
    [...successor.owns.paths].sort(),
    [".morro/changesets/" + C.successor + ".json", C.productPath].sort(),
    "PATHS",
  );
  const related = Object.values(leaseRegistry.leases).filter(
    (l) => l.changeSetId === C.predecessor,
  );
  check(
    related.length > 0 && related.every((l) => l.state === "RELEASED"),
    "LEASE_NOT_RELEASED",
  );
  same(correctionDigest(task), C.taskDigest, "TASK_DIGEST");
  same(changeSetDigest(changeSet), C.manifestDigest, "HISTORICAL_MANIFEST");
}

// Lower-level storage primitive, like persistTaskTransfer. It never mints
// authority and is called only after authenticated preparation below.
// One immutable journal and a shared Native lock serialize this one succession.
// The three conventional task files become visible together by directory rename.
// Any interruption leaves lock/journal/pending data for explicit reconciliation;
// neither expiration nor replay silently removes them. No predecessor writes.
export function persistCssCorrection({
  common,
  stateDir,
  key,
  proposal,
  inputs,
  revalidate,
}) {
  check(/^[a-f0-9]{64}$/u.test(key), "RESERVATION_KEY");
  same(proposal.task.changeSetId, C.successor, "PERSIST_SUCCESSOR");
  const lock = join(common, "css-started-transfer.lock");
  mkdirSync(lock, { mode: 0o700 });
  const stable = () => {
    // Provider reads may block or race local writers. Always check snapshots
    // AFTER those reads; the returned verifier performs no further transport.
    const verifyFresh = revalidate();
    for (const entry of inputs)
      same(snapshot(entry.path).bytes, entry.bytes, "INPUT_CHANGED");
    return verifyFresh;
  };
  const flush = (path, data) => {
    const fd = openSync(path, "wx", 0o600);
    try {
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  const syncDir = (path) => {
    const fd = openSync(path, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  {
    stable();
    check(!existsSync(stateDir), "SUCCESSOR_STATE_EXISTS");
    const journal = join(common, "css-entry-order-correction-" + key + ".json");
    check(!existsSync(journal), "RESERVATION_REPLAY");
    const pending = stateDir + ".correction-pending";
    check(!existsSync(pending), "PENDING_RECONCILIATION");
    const files = {
      [C.successor + ".task.json"]: proposal.task,
      [C.successor + ".context-pack.json"]: proposal.contextPack,
      "capability-leases.json": proposal.leaseRegistry,
    };
    const encoded = Object.fromEntries(
      Object.entries(files).map(([name, value]) => [
        name,
        JSON.stringify(value, null, 2) + "\n",
      ]),
    );
    flush(
      journal,
      JSON.stringify({
        schemaVersion: 1,
        key,
        stateDir,
        // Immutable intent is evidence, not an independently trusted grant.
        proposalDigest: correctionDigest(proposal),
        inputDigests: inputs.map((e) => ({
          path: e.path,
          digest: correctionDigest(JSON.parse(e.bytes)),
        })),
      }) + "\n",
    );
    syncDir(common);
    mkdirSync(pending, { mode: 0o700 });
    for (const [name, bytes] of Object.entries(encoded))
      flush(join(pending, name), bytes);
    syncDir(pending);
    const verifyFresh = stable();
    for (const [name, bytes] of Object.entries(encoded))
      same(
        readFileSync(join(pending, name), "utf8"),
        bytes,
        "PREPARED_READBACK",
      );
    if (verifyFresh) verifyFresh();
    check(!existsSync(stateDir), "SUCCESSOR_STATE_RACE");
    const result = {
      state: "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
      key,
      taskDigest: correctionDigest(
        JSON.parse(encoded[C.successor + ".task.json"]),
      ),
      stateDir,
    };
    // Linearization point: all authority, identity, input and prepared-byte
    // validation has succeeded. Never perform fallible validation after this.
    renameSync(pending, stateDir);
    try {
      syncDir(dirname(stateDir));
      rmdirSync(lock);
    } catch {
      // Publication happened. Report that fact instead of a false validation
      // failure; retain evidence/lock where present. No retry or dispatch.
      return {
        ...result,
        state: "CORRECTION_PUBLISHED_RECONCILIATION_REQUIRED",
      };
    }
    return result;
  }
}

// Read a committed, canonically proven reanchor; never synthesize or write one.
// Canonical grants bind the envelope, while the existing reanchor certificate
// binds the current base and the exact candidate registry/ledger transition.
export function readCssCorrectionCandidate({
  workspace,
  expectedMain,
  authority,
  identity,
}) {
  const manifestPath = ".morro/changesets/" + C.successor + ".json";
  const successor = json(join(workspace, manifestPath));
  same(
    correctionEnvelope(successor),
    correctionEnvelope(authority.successor),
    "CANONICAL_ENVELOPE",
  );
  same(successor.baseSha, expectedMain, "CANDIDATE_BASE");
  same(successor.id, C.successor, "SUCCESSOR");
  same(successor.branch, C.branch, "BRANCH");
  const registry = JSON.parse(
    git(
      workspace,
      "show",
      identity.headSha + ":.github/morro-control/claims.json",
    ),
  );
  const canonical = JSON.parse(
    git(workspace, "show", expectedMain + ":.github/morro-control/claims.json"),
  );
  same(canonical.claims[C.successor], authority.claim, "CLAIM_READBACK");
  let reanchorProof;
  if (authority.successor.baseSha !== expectedMain) {
    reanchorProof = buildClaimReanchorProof(workspace, {
      baseSha: expectedMain,
      headSha: identity.headSha,
      manifestPath,
    });
  } else same(registry, canonical, "CANONICAL_REGISTRY");
  return { successor, registry, reanchorProof };
}

// Explicit library entrypoint only. No CLI registration, issuance, consumption,
// workflow, dispatch or task execution. A canonical CONSUMED grant is a separate
// reviewed transition; absent/ISSUED/revoked grants cannot reach persistence.
export async function prepareCssEntryOrderCorrection({
  root,
  workspace,
  expectedMain,
}) {
  check(/^[a-f0-9]{40}$/u.test(expectedMain), "MAIN");
  root = realpathSync(root);
  workspace = realpathSync(workspace);
  check(root.startsWith(C.nativeHome + "/worktrees/"), "NATIVE_REQUIRED");
  same(git(root, "rev-parse", "HEAD"), expectedMain, "TRUSTED_HEAD");
  same(
    git(root, "status", "--porcelain", "--untracked-files=all"),
    "",
    "TRUSTED_DIRTY",
  );
  const executable = "tooling/mdctl/css-entry-order-correction-runtime.mjs";
  same(
    fileURLToPath(import.meta.url),
    join(root, executable),
    "TRUSTED_ENTRYPOINT",
  );
  same(
    git(root, "hash-object", join(root, executable)),
    git(root, "rev-parse", expectedMain + ":" + executable),
    "EXECUTABLE_CHANGED",
  );
  const common = realpathSync(
    resolve(workspace, git(workspace, "rev-parse", "--git-common-dir")),
  );
  same(common, nativeCommon, "COMMON_DIR");
  same(realpathSync(predecessorWorkspace), predecessorWorkspace, "SOURCE_PATH");
  same(
    realpathSync(
      resolve(
        predecessorWorkspace,
        git(predecessorWorkspace, "rev-parse", "--git-common-dir"),
      ),
    ),
    common,
    "SOURCE_COMMON",
  );
  const sourceState = join(
    common,
    "worktrees",
    C.predecessorDirectory,
    "morro-control",
  );
  same(
    realpathSync(
      resolve(
        predecessorWorkspace,
        git(predecessorWorkspace, "rev-parse", "--git-path", "morro-control"),
      ),
    ),
    sourceState,
    "SOURCE_STATE",
  );
  same(
    git(workspace, "rev-parse", "--show-toplevel"),
    workspace,
    "TARGET_TOPLEVEL",
  );
  const stateDir = resolve(
    workspace,
    git(workspace, "rev-parse", "--git-path", "morro-control"),
  );
  check(
    stateDir.startsWith(common + "/worktrees/") &&
      dirname(stateDir) === realpathSync(dirname(stateDir)),
    "TARGET_STATE",
  );
  check(!existsSync(stateDir), "SUCCESSOR_STATE_EXISTS");
  const inputs = ["task", "handoff", "context-pack"].map((kind) =>
    join(sourceState, C.predecessor + "." + kind + ".json"),
  );
  inputs.push(join(sourceState, "capability-leases.json"));
  const captured = inputs.map((path) => {
    check(
      lstatSync(path).isFile() &&
        !lstatSync(path).isSymbolicLink() &&
        lstatSync(path).size <= 262144,
      "SOURCE_REGULAR",
    );
    return { path, bytes: readFileSync(path) };
  });
  const [task, handoff, contextPack, leaseRegistry] = captured.map((e) =>
    JSON.parse(e.bytes),
  );
  same(contextPack.digest, task.contextPackDigest, "CONTEXT_DIGEST");
  const manifestPath = ".morro/changesets/" + C.predecessor + ".json";
  const changeSet = JSON.parse(
    git(predecessorWorkspace, "show", C.handoffSha + ":" + manifestPath),
  );
  const preserved = JSON.parse(
    git(predecessorWorkspace, "show", C.preservedSha + ":" + manifestPath),
  );
  same(
    preserved,
    { ...changeSet, state: "LOCAL_PROVEN" },
    "PRESERVATION_MANIFEST_DELTA",
  );
  same(
    git(
      predecessorWorkspace,
      "diff",
      "--name-only",
      C.handoffSha,
      C.preservedSha,
    ),
    manifestPath,
    "PRESERVATION_DIFF",
  );
  const sourceIdentity = {
    workspace: predecessorWorkspace,
    headSha: git(predecessorWorkspace, "rev-parse", "HEAD"),
    productBlob: git(
      predecessorWorkspace,
      "rev-parse",
      C.preservedSha + ":" + C.productPath,
    ),
  };
  same(
    git(predecessorWorkspace, "status", "--porcelain", "--untracked-files=all"),
    "",
    "SOURCE_DIRTY",
  );
  assertRetiredNativeIdentityAbsent();
  const authority = collectCorrectionAuthority({
    expectedMain,
    successor: C.successor,
  });
  captured.push(
    ...provisionedEvidence(authority, common, {
      mainSha: expectedMain,
      candidateSha: git(workspace, "rev-parse", "HEAD"),
    }),
  );
  const identity = await collectTaskGitIdentity(workspace, expectedMain);
  same(identity.branch, C.branch, "TARGET_BRANCH");
  same(identity.dirty, false, "TARGET_DIRTY");
  const {
    successor,
    registry: canonicalRegistry,
    reanchorProof,
  } = readCssCorrectionCandidate({
    workspace,
    expectedMain,
    authority,
    identity,
  });
  validateCssCorrectionInputs({
    task,
    changeSet,
    handoff,
    successor,
    leaseRegistry,
    sourceIdentity,
    workspace,
    grant: authority.grant,
  });
  const isAncestor = (a, b) => git(workspace, "merge-base", a, b) === a;
  const proposal = buildTaskCorrection({
    authority,
    reanchorProof,
    task,
    changeSet,
    handoff,
    successor,
    leaseRegistry,
    claimRegistry: canonicalRegistry,
    identity,
    isAncestor,
    readCandidateDiff: (bound) => ({
      ...bound,
      changedFiles: git(
        workspace,
        "diff",
        "--name-only",
        bound.baseSha + "..." + bound.headSha,
      )
        .split("\n")
        .filter(Boolean),
    }),
  });
  const revalidate = () => {
    const fresh = collectCorrectionAuthority({
      expectedMain,
      successor: C.successor,
    });
    same(git(root, "rev-parse", "HEAD"), expectedMain, "TRUSTED_HEAD");
    same(
      git(root, "status", "--porcelain", "--untracked-files=all"),
      "",
      "TRUSTED_DIRTY",
    );
    same(
      git(workspace, "branch", "--show-current"),
      identity.branch,
      "TARGET_BRANCH_CHANGED",
    );
    same(
      resolve(
        workspace,
        git(workspace, "rev-parse", "--git-path", "morro-control"),
      ),
      stateDir,
      "TARGET_STATE_CHANGED",
    );
    same(
      resolve(
        predecessorWorkspace,
        git(predecessorWorkspace, "rev-parse", "--git-path", "morro-control"),
      ),
      sourceState,
      "SOURCE_STATE_CHANGED",
    );
    same(git(workspace, "rev-parse", "HEAD"), identity.headSha, "HEAD_CHANGED");
    same(
      git(workspace, "status", "--porcelain", "--untracked-files=all"),
      "",
      "TARGET_DIRTY",
    );
    same(
      git(predecessorWorkspace, "rev-parse", "HEAD"),
      sourceIdentity.headSha,
      "SOURCE_CHANGED",
    );
    same(
      git(
        predecessorWorkspace,
        "status",
        "--porcelain",
        "--untracked-files=all",
      ),
      "",
      "SOURCE_DIRTY",
    );

    same(
      canonicalJson(fresh.grant),
      canonicalJson(authority.grant),
      "GRANT_CHANGED",
    );
    assertRetiredNativeIdentityAbsent();
    return () => {
      assertRetiredNativeIdentityAbsent();
      return assertCorrectionAuthority(fresh, {
        task,
        changeSet,
        successor,
        claim: fresh.claim,
      });
    };
  };
  return persistCssCorrection({
    common,
    stateDir,
    key: authority.key,
    proposal,
    inputs: captured,
    revalidate,
  });
}
