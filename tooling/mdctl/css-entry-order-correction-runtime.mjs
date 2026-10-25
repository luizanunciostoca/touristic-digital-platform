import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
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
  correctionDigest,
  correctionEnvelope,
  CSS_ENTRY_ORDER_CORRECTION as C,
} from "./task-correction-authority.mjs";

import { buildClaimReanchorProof } from "../fabric/claim-guard.mjs";

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
  let completed = false;
  const stable = () => {
    for (const entry of inputs)
      same(readFileSync(entry.path), entry.bytes, "INPUT_CHANGED");
    revalidate();
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
  try {
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
    stable();
    check(!existsSync(stateDir), "SUCCESSOR_STATE_RACE");
    renameSync(pending, stateDir);
    syncDir(dirname(stateDir));
    for (const [name, bytes] of Object.entries(encoded))
      same(readFileSync(join(stateDir, name), "utf8"), bytes, "READBACK");
    stable();
    completed = true;
    return {
      state: "CORRECTION_PERSISTED_SCHEDULER_RECHECK_REQUIRED",
      key,
      taskDigest: correctionDigest(proposal.task),
      stateDir,
    };
  } finally {
    if (completed) rmdirSync(lock);
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
  const authority = collectCorrectionAuthority({
    expectedMain,
    successor: C.successor,
  });
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
    same(git(root, "rev-parse", "HEAD"), expectedMain, "TRUSTED_HEAD");
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
    const fresh = collectCorrectionAuthority({
      expectedMain,
      successor: C.successor,
    });
    same(
      canonicalJson(fresh.grant),
      canonicalJson(authority.grant),
      "GRANT_CHANGED",
    );
    assertCorrectionAuthority(fresh, {
      task,
      changeSet,
      successor,
      claim: fresh.claim,
    });
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
