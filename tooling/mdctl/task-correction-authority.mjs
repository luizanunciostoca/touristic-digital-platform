import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { canonicalJson, changeSetDigest } from "./changeset-v2.mjs";

// Only explicitly reviewed corrections are eligible; this is not
// a general delegation facility. GOVERNANCE remains the default.
export const CORRECTION = Object.freeze({
  repository: "luizanunciostoca/touristic-digital-platform",
  owner: "CHATGPT-PRO-CONTROL",
  executor: "CODEX-STAGING-NODE-9482F85B-20261023",
  predecessor: "MD-STAGING-NODE-GOVERNANCE-20261023",
  successor: "MD-STAGING-NODE-GOVERNANCE-CORRECTION-20261023",
  branch: "fix/staging-node-governance-correction-20261023",
  path: ".morro/task-corrections/MD-STAGING-NODE-GOVERNANCE-CORRECTION-20261023.json",
});
export const RUNTIME_LOGGING_CORRECTION = Object.freeze({
  repository: CORRECTION.repository,
  owner: CORRECTION.owner,
  executor: CORRECTION.executor,
  predecessor: "MD-TASK-CORRECTION-RUNTIME-20261023",
  successor: "MD-TASK-CORRECTION-RUNTIME-LOGGING-20261024",
  branch: "fix/task-correction-runtime-logging-20261024",
  path: ".morro/task-corrections/MD-TASK-CORRECTION-RUNTIME-LOGGING-20261024.json",
});
// This profile alone grants nothing: an independently reviewed canonical grant,
// consumed reservation and current claim remain mandatory. No issuance API here.
export const CSS_ENTRY_ORDER_CORRECTION = Object.freeze({
  repository: CORRECTION.repository,
  owner: CORRECTION.owner,
  executor: CORRECTION.executor,
  predecessor: "MD-CSS-ENTRY-ORDER-REGRESSION-20261024",
  successor: "MD-CSS-ENTRY-ORDER-CORRECTION-R2-20261027",
  retiredSuccessor: "MD-CSS-ENTRY-ORDER-CORRECTION-20261025",
  retirementSha: "52aa70c688dc4207af688f5bccfbe633c328ef5e",
  retiredManifestBlob: "53fa7b91cdbbd3bd91c7beb01975ae6036e818f0",
  retirementLedgerBlob: "955b53aa2083cdefaaa1bc64eaa4f773cd32db7f",
  branch: "fix/css-entry-order-correction-r2-20261027",
  path: ".morro/task-corrections/MD-CSS-ENTRY-ORDER-CORRECTION-R2-20261027.json",
  taskDigest:
    "sha256:f7272bdc71184c2126ac18ad43bc9fefb49787da75091abb5a3f758882f1771c",
  handoffDigest:
    "sha256:0777a2e98cfb63f4af6d3d75d6d429c9186ae1afe7461c2e2da36f4b8c3bc940",
  manifestDigest:
    "sha256:364a314466ceeaf61600a4ccf64e20a7d65d70dddcdac6a44132794a35e3f715",
  handoffSha: "91cf3647afbcc66fa0a8938305a2adabaee10d2a",
  preservedSha: "1d1120a59b2a9fd7f5edcf25924fca1b369f6f2f",
  productPath:
    "apps/morro-digital-platform/src/accessibility/ux-p0-foundations.test.ts",
  productBlob: "9e190c930ce3794bf71521130124f7fa2f16be7e",
  nativeHome: "/data/data/com.termux/files/home",
  nativeBin: "/data/data/com.termux/files/usr/bin",
  gitRemote:
    "https://github.com/luizanunciostoca/touristic-digital-platform.git",
  predecessorDirectory:
    "MD-CSS-ENTRY-ORDER-REGRESSION-20261024-ct1072-css-entry-order-regression-20261024-068dc23e5eb4",
  controllerRepository: "luizanunciostoca/morro-termux-control",
  controllerCommitSha: "07cd523020f3a50f347966c883ad90cd369a3208",
  controllerBlobSha: "e03766e827074fa58b698e148373ad1f3fa3e765",
});
export const CSS_PREPARATION_ACTIONS = Object.freeze([
  "create-detached",
  "verify-receipt",
  "bind-successor-branch",
  "checkout-proven-reanchor",
]);
function correctionProfile(successor = CORRECTION.successor) {
  const profile = [
    CORRECTION,
    RUNTIME_LOGGING_CORRECTION,
    CSS_ENTRY_ORDER_CORRECTION,
  ].find((candidate) => candidate.successor === successor);
  assert.ok(profile, "CORRECTION_GRANT_IDENTITY:successor");
  return profile;
}
function correctionKind(profile) {
  if (profile === CSS_ENTRY_ORDER_CORRECTION)
    return "TDP_CSS_ENTRY_ORDER_CORRECTION_DELEGATION";
  return profile === CORRECTION
    ? "TDP_GOVERNANCE_CORRECTION_DELEGATION"
    : "TDP_RUNTIME_LOGGING_CORRECTION_DELEGATION";
}
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const verified = new WeakSet();
const keys = [
  "schemaVersion",
  "kind",
  "repository",
  "owner",
  "executor",
  "predecessor",
  "successor",
  "branch",
  "taskDigest",
  "handoffDigest",
  "manifestDigest",
  "envelopeDigest",
  "claimDigest",
  "nonce",
  "issuedAt",
  "expiresAt",
  "state",
  "reservation",
];
export const correctionDigest = (value) =>
  "sha256:" + createHash("sha256").update(canonicalJson(value)).digest("hex");
export function correctionEnvelope(manifest) {
  const { id, baseSha, branch, state, ...envelope } = manifest;
  return envelope;
}
export function correctionClaim(claim) {
  const { baseSha, ...identity } = claim;
  return identity;
}
export function correctionKey(handoffDigest, successor = CORRECTION.successor) {
  const profile = correctionProfile(successor);
  assert.match(handoffDigest ?? "", HASH, "CORRECTION_HANDOFF_INVALID");
  return createHash("sha256")
    .update(
      CORRECTION.repository + "\n" + profile.predecessor + "\n" + handoffDigest,
    )
    .digest("hex");
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function closed(value, expected, code) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), code);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), code);
}
export function validateCorrectionGrant(grant) {
  const css = grant?.successor === CSS_ENTRY_ORDER_CORRECTION.successor;
  closed(
    grant,
    css ? [...keys, "workspace", "provisioningLease"] : keys,
    "CORRECTION_GRANT_FIELDS",
  );
  assert.equal(grant.schemaVersion, css ? 2 : 1, "CORRECTION_GRANT_VERSION");
  const profile = correctionProfile(grant.successor);
  assert.equal(grant.kind, correctionKind(profile), "CORRECTION_GRANT_KIND");
  for (const field of [
    "repository",
    "owner",
    "executor",
    "predecessor",
    "successor",
    "branch",
  ])
    assert.equal(
      grant[field],
      profile[field],
      "CORRECTION_GRANT_IDENTITY:" + field,
    );
  for (const field of [
    "taskDigest",
    "handoffDigest",
    "manifestDigest",
    "envelopeDigest",
    "claimDigest",
  ])
    assert.match(grant[field], HASH, "CORRECTION_GRANT_DIGEST:" + field);
  if (css) {
    for (const field of ["taskDigest", "handoffDigest", "manifestDigest"])
      assert.equal(
        grant[field],
        CSS_ENTRY_ORDER_CORRECTION[field],
        "CSS_CORRECTION_PIN:" + field,
      );
    const prefix =
      CSS_ENTRY_ORDER_CORRECTION.nativeHome +
      "/worktrees/" +
      CSS_ENTRY_ORDER_CORRECTION.successor +
      "-";
    assert.ok(
      typeof grant.workspace === "string" &&
        grant.workspace.startsWith(prefix) &&
        /^[a-z0-9-]{12,120}$/u.test(grant.workspace.slice(prefix.length)),
      "CSS_CORRECTION_WORKSPACE",
    );
    assert.ok(
      Date.parse(grant.expiresAt) - Date.parse(grant.issuedAt) <= 1800000,
      "CSS_CORRECTION_VALIDITY",
    );
  }
  assert.match(
    grant.nonce,
    /^[a-zA-Z0-9-]{20,80}$/u,
    "CORRECTION_NONCE_INVALID",
  );
  const issued = Date.parse(grant.issuedAt),
    expires = Date.parse(grant.expiresAt);
  assert.ok(
    Number.isFinite(issued) &&
      Number.isFinite(expires) &&
      expires > issued &&
      expires - issued <= 7200000,
    "CORRECTION_GRANT_TIME",
  );
  assert.ok(
    ["ISSUED", "CONSUMED", "REVOKED"].includes(grant.state),
    "CORRECTION_GRANT_STATE",
  );
  if (grant.reservation !== null) {
    closed(
      grant.reservation,
      css
        ? ["key", "commitSha", "issuedCommitSha", "provisioningReceipt"]
        : ["key", "commitSha", "issuedCommitSha"],
      "CORRECTION_RESERVATION_FIELDS",
    );
    assert.equal(
      grant.reservation.key,
      correctionKey(grant.handoffDigest, grant.successor),
      "CORRECTION_RESERVATION_KEY",
    );
    assert.match(
      grant.reservation.commitSha,
      SHA,
      "CORRECTION_RESERVATION_COMMIT",
    );
    assert.match(
      grant.reservation.issuedCommitSha,
      SHA,
      "CORRECTION_ISSUED_COMMIT",
    );
  }
  if (grant.state === "ISSUED")
    assert.equal(grant.reservation, null, "CORRECTION_ISSUED_RESERVED");
  if (grant.state === "CONSUMED")
    assert.ok(grant.reservation, "CORRECTION_CONSUMPTION_REQUIRED");
  if (css) validateCssProvisioning(grant);
  return grant;
}
const core = ({ state, reservation, ...rest }) => rest;

function validateCssProvisioning(g) {
  assert.ok(
    Date.parse(g.issuedAt) % 1000 === 0 && Date.parse(g.expiresAt) % 1000 === 0,
    "CSS_PROVISION_SECOND_PRECISION",
  );
  const p = CSS_ENTRY_ORDER_CORRECTION,
    l = g.provisioningLease;
  closed(
    l,
    [
      "schemaVersion",
      "leaseId",
      "taskId",
      "executor",
      "workspace",
      "branch",
      "actions",
      "issuedAt",
      "expiresAt",
      "sourceMainSha",
    ],
    "CSS_PROVISION_LEASE_FIELDS",
  );
  assert.equal(l.schemaVersion, 1, "CSS_PROVISION_VERSION");
  assert.match(l.leaseId, /^[a-z0-9-]{12,60}$/u, "CSS_PROVISION_LEASE_ID");
  assert.match(l.sourceMainSha, SHA, "CSS_PROVISION_SOURCE");
  assert.equal(l.taskId, p.successor, "CSS_PROVISION_TASK");
  for (const k of ["executor", "workspace", "branch", "issuedAt", "expiresAt"])
    assert.equal(l[k], g[k], "CSS_PROVISION_BINDING:" + k);
  assert.deepEqual(l.actions, CSS_PREPARATION_ACTIONS, "CSS_PROVISION_ACTIONS");
  assert.equal(
    g.workspace,
    p.nativeHome +
      "/worktrees/" +
      p.successor +
      "-" +
      l.leaseId +
      "-" +
      l.sourceMainSha.slice(0, 12),
    "CSS_PROVISION_WORKSPACE",
  );
  if (!g.reservation) return;
  const r = g.reservation.provisioningReceipt;
  closed(
    r,
    [
      "schemaVersion",
      "taskId",
      "executor",
      "leaseId",
      "workspace",
      "commonDir",
      "sourceMainSha",
      "detachedHeadSha",
      "controllerRepository",
      "controllerCommitSha",
      "controllerBlobSha",
      "nativeIssueNumber",
      "requestSha256",
      "attestationCommentId",
      "resultCommentId",
      "receiptSha256",
      "createdAt",
      "verifiedAt",
    ],
    "CSS_PROVISION_RECEIPT_FIELDS",
  );
  assert.equal(r.schemaVersion, 1, "CSS_PROVISION_RECEIPT_VERSION");
  for (const k of [
    "taskId",
    "executor",
    "leaseId",
    "workspace",
    "sourceMainSha",
  ])
    assert.equal(r[k], l[k], "CSS_PROVISION_RECEIPT_BINDING:" + k);
  for (const k of [
    "controllerRepository",
    "controllerCommitSha",
    "controllerBlobSha",
  ])
    assert.equal(r[k], p[k], "CSS_PROVISION_CONTROLLER:" + k);
  assert.equal(
    r.commonDir,
    p.nativeHome + "/repos/touristic-digital-platform.git",
    "CSS_PROVISION_COMMON",
  );
  assert.equal(r.detachedHeadSha, l.sourceMainSha, "CSS_PROVISION_DETACHED");
  for (const k of [
    "nativeIssueNumber",
    "attestationCommentId",
    "resultCommentId",
  ])
    assert.ok(Number.isSafeInteger(r[k]) && r[k] > 0, "CSS_PROVISION_ID:" + k);
  for (const k of ["requestSha256", "receiptSha256"])
    assert.match(r[k], /^[a-f0-9]{64}$/u, "CSS_PROVISION_HASH:" + k);
  assert.ok(
    Number.isFinite(Date.parse(r.createdAt)) &&
      Date.parse(r.createdAt) >= Date.parse(g.issuedAt) &&
      Date.parse(r.verifiedAt) >= Date.parse(r.createdAt) &&
      Date.parse(r.verifiedAt) < Date.parse(g.expiresAt),
    "CSS_PROVISION_RECEIPT_TIME",
  );
  assert.equal(
    g.reservation.commitSha,
    g.reservation.issuedCommitSha,
    "CSS_PROVISION_RESERVATION_COMMIT",
  );
}

// This checks authenticated GitHub ancestry, not caller-supplied booleans.
function assertCanonicalAncestor(base, head) {
  const prefix = "repos/" + CORRECTION.repository;
  assert.equal(
    correctionGithub(prefix + "/commits/" + base).sha,
    base,
    "CSS_PROVISION_COMMIT",
  );
  const comparison = correctionGithub(
    prefix + "/compare/" + base + "..." + head,
  );
  assert.equal(comparison.base_commit?.sha, base, "CSS_PROVISION_COMPARE_BASE");
  assert.equal(
    comparison.merge_base_commit?.sha,
    base,
    "CSS_PROVISION_ANCESTRY",
  );
  assert.ok(
    comparison.status === (base === head ? "identical" : "ahead"),
    "CSS_PROVISION_COMPARE_STATUS",
  );
}

export function assertCssProvisioningAuthority(
  token,
  requiredState = "ISSUED",
) {
  assert.ok(
    ["ISSUED", "CONSUMED"].includes(requiredState),
    "CSS_PROVISION_REQUIRED_STATE",
  );
  assert.ok(verified.has(token), "CSS_PROVISION_AUTHORITY_UNVERIFIED");
  assert.equal(
    token.grant.successor,
    CSS_ENTRY_ORDER_CORRECTION.successor,
    "CSS_PROVISION_PROFILE",
  );
  assert.equal(
    token.grant.state,
    requiredState,
    "CSS_PROVISION_REQUIRED_STATE",
  );
  const now = Date.now();
  assert.ok(
    now >= Date.parse(token.observedAt) &&
      now - Date.parse(token.observedAt) <= 30000 &&
      now < Date.parse(token.grant.expiresAt) &&
      now < Date.parse(token.claim.expiresAt),
    "CSS_PROVISION_AUTHORITY_STALE",
  );
  return token;
}

// A pure validation result is deliberately NOT an authority token.
export function validateCorrectionHistory(
  history,
  now = new Date().toISOString(),
) {
  assert.ok(
    Array.isArray(history) && history.length > 0 && history.length <= 32,
    "CORRECTION_HISTORY_REQUIRED",
  );
  const seen = new Set();
  for (const entry of history) {
    assert.match(entry.commitSha, SHA, "CORRECTION_HISTORY_COMMIT");
    assert.ok(!seen.has(entry.commitSha), "CORRECTION_HISTORY_DUPLICATE");
    seen.add(entry.commitSha);
    validateCorrectionGrant(entry.grant);
  }
  const first = history[0];
  assert.equal(first.grant.state, "ISSUED", "CORRECTION_HISTORY_NOT_ISSUED");
  for (let i = 1; i < history.length; i++) {
    const previous = history[i - 1].grant,
      next = history[i].grant;
    assert.deepEqual(
      core(next),
      core(first.grant),
      "CORRECTION_HISTORY_IDENTITY_CHANGED",
    );
    assert.ok(
      previous.state !== "REVOKED",
      "CORRECTION_HISTORY_REVOKED_TERMINAL",
    );
    assert.ok(
      (previous.state === "ISSUED" &&
        ["CONSUMED", "REVOKED"].includes(next.state)) ||
        (previous.state === "CONSUMED" && next.state === "REVOKED"),
      "CORRECTION_HISTORY_TRANSITION",
    );
    if (next.state === "CONSUMED")
      assert.equal(
        next.reservation.issuedCommitSha,
        first.commitSha,
        "CORRECTION_CONSUMPTION_ISSUANCE",
      );
    if (next.state === "REVOKED")
      assert.deepEqual(
        next.reservation,
        previous.reservation,
        "CORRECTION_REVOCATION_CHANGED",
      );
  }
  const current = history.at(-1).grant,
    clock = Date.parse(now);
  assert.ok(
    Number.isFinite(clock) &&
      clock >= Date.parse(current.issuedAt) &&
      clock < Date.parse(current.expiresAt),
    "CORRECTION_GRANT_EXPIRED",
  );
  assert.notEqual(current.state, "REVOKED", "CORRECTION_GRANT_REVOKED");
  return {
    grant: current,
    issuedCommitSha: first.commitSha,
    coreDigest: correctionDigest(core(current)),
    key: correctionKey(current.handoffDigest, current.successor),
  };
}

// No injectable reader may mint an authority token. Transport is the existing
// authenticated GitHub CLI, on the exact repository, with explicit pagination.
export function correctionGithub(path, method = "GET", payload) {
  assert.ok(
    path.startsWith("repos/" + CORRECTION.repository + "/"),
    "CORRECTION_GITHUB_TARGET",
  );
  const args = ["api", "--hostname", "github.com", "--method", method, path];
  if (payload !== undefined) args.push("--input", "-");
  return JSON.parse(
    execFileSync("gh", args, {
      encoding: "utf8",
      input: payload === undefined ? undefined : JSON.stringify(payload),
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    }),
  );
}
function pages(path) {
  const all = [];
  for (let page = 1; page <= 100; page++) {
    const result = correctionGithub(path + "&per_page=100&page=" + page);
    assert.ok(
      Array.isArray(result) && result.length <= 100,
      "CORRECTION_PAGINATION_INVALID",
    );
    all.push(...result);
    if (result.length < 100) return all;
  }
  throw new Error("CORRECTION_PAGINATION_INCOMPLETE");
}
function readBlob(path, ref) {
  const value = correctionGithub(
    "repos/" + CORRECTION.repository + "/contents/" + path + "?ref=" + ref,
  );
  assert.equal(value.type, "file", "CORRECTION_BLOB_TYPE");
  assert.equal(value.encoding, "base64", "CORRECTION_BLOB_ENCODING");
  const bytes = Buffer.from(value.content, "base64");
  const sha = createHash("sha1")
    .update("blob " + bytes.length + "\0")
    .update(bytes)
    .digest("hex");
  assert.equal(sha, value.sha, "CORRECTION_BLOB_HASH");
  return { bytes, sha };
}
function jsonBlob(path, ref) {
  return JSON.parse(readBlob(path, ref).bytes.toString("utf8"));
}
function assertRetiredCssIdentity(expectedMain, registry, sourceMainSha) {
  const p = CSS_ENTRY_ORDER_CORRECTION;
  assert.equal(
    Object.hasOwn(registry.claims ?? {}, p.retiredSuccessor),
    false,
    "CSS_RETIRED_CLAIM_PRESENT",
  );
  assertCanonicalAncestor(p.retirementSha, sourceMainSha);
  assertCanonicalAncestor(p.retirementSha, expectedMain);
  const manifestPath = ".morro/changesets/" + p.retiredSuccessor + ".json";
  assert.equal(
    readBlob(manifestPath, p.retirementSha).sha,
    p.retiredManifestBlob,
    "CSS_RETIREMENT_MANIFEST",
  );
  assert.equal(
    readBlob(".github/morro-control/events.ndjson", p.retirementSha).sha,
    p.retirementLedgerBlob,
    "CSS_RETIREMENT_LEDGER",
  );
  assert.equal(
    readBlob(manifestPath, expectedMain).sha,
    p.retiredManifestBlob,
    "CSS_RETIRED_MANIFEST_CHANGED",
  );
  const history = pages(
    "repos/" +
      p.repository +
      "/commits?sha=" +
      expectedMain +
      "&path=" +
      encodeURIComponent(
        ".morro/task-corrections/" + p.retiredSuccessor + ".json",
      ),
  );
  assert.equal(history.length, 0, "CSS_RETIRED_GRANT_HISTORY");
}
export function collectCorrectionAuthority(options) {
  assert.ok(
    !Object.hasOwn(options, "now"),
    "CORRECTION_CLOCK_OVERRIDE_FORBIDDEN",
  );
  const { expectedMain } = options;
  const profile = correctionProfile(options.successor);
  const now = new Date().toISOString();
  assert.match(expectedMain ?? "", SHA, "CORRECTION_MAIN_REQUIRED");
  const root = "repos/" + CORRECTION.repository;
  assert.equal(
    correctionGithub(root + "/commits/main").sha,
    expectedMain,
    "CORRECTION_MAIN_MOVED",
  );
  const commits = pages(
    root +
      "/commits?sha=" +
      expectedMain +
      "&path=" +
      encodeURIComponent(profile.path),
  );
  assert.ok(
    commits.length > 0 && commits.length <= 32,
    "CORRECTION_HISTORY_REQUIRED",
  );
  // Every path-changing commit is read: deletion/recreation is not collapsed.
  const history = commits.toReversed().map((item) => ({
    commitSha: item.sha,
    grant: jsonBlob(profile.path, item.sha),
  }));
  const checked = validateCorrectionHistory(history, now);
  assert.equal(
    checked.grant.successor,
    profile.successor,
    "CORRECTION_PROFILE_MISMATCH",
  );
  assert.deepEqual(
    jsonBlob(profile.path, expectedMain),
    checked.grant,
    "CORRECTION_CURRENT_HISTORY_MISMATCH",
  );
  const registry = jsonBlob(".github/morro-control/claims.json", expectedMain);
  const claim = registry.claims?.[profile.successor];
  assert.equal(
    registry.registryAuthority,
    "ORCHESTRATOR",
    "CORRECTION_REGISTRY_AUTHORITY",
  );
  assert.equal(claim?.owner, profile.owner, "CORRECTION_CANONICAL_OWNER");
  assert.equal(claim.branch, profile.branch, "CORRECTION_CLAIM_BRANCH");
  assert.ok(
    Date.parse(claim.expiresAt) > Date.parse(now),
    "CORRECTION_CLAIM_EXPIRED",
  );
  assert.equal(
    correctionDigest(correctionClaim(claim)),
    checked.grant.claimDigest,
    "CORRECTION_CLAIM_CHANGED",
  );
  const successor = jsonBlob(
    ".morro/changesets/" + profile.successor + ".json",
    expectedMain,
  );
  if (profile === CSS_ENTRY_ORDER_CORRECTION) {
    assertRetiredCssIdentity(
      expectedMain,
      registry,
      checked.grant.provisioningLease.sourceMainSha,
    );
    assertCanonicalAncestor(
      checked.grant.provisioningLease.sourceMainSha,
      checked.issuedCommitSha,
    );
    assertCanonicalAncestor(checked.issuedCommitSha, expectedMain);
  }
  assert.equal(
    correctionDigest(correctionEnvelope(successor)),
    checked.grant.envelopeDigest,
    "CORRECTION_ENVELOPE_CHANGED",
  );
  assert.equal(
    correctionGithub(root + "/commits/main").sha,
    expectedMain,
    "CORRECTION_MAIN_MOVED",
  );
  const observedAt = new Date().toISOString();
  validateCorrectionHistory(history, observedAt);
  assert.ok(
    Date.parse(claim.expiresAt) > Date.parse(observedAt),
    "CORRECTION_CLAIM_EXPIRED",
  );
  if (profile === CSS_ENTRY_ORDER_CORRECTION) {
    const paths = [
      ".morro/changesets/" + profile.successor + ".json",
      profile.productPath,
    ].sort();
    assert.deepEqual(
      [...claim.paths].sort(),
      paths,
      "CSS_CORRECTION_CLAIM_PATHS",
    );
    assert.deepEqual(
      [...successor.owns.paths].sort(),
      paths,
      "CSS_CORRECTION_MANIFEST_PATHS",
    );
    assert.equal(successor.scope, "DESTINATION:MORRO", "CSS_CORRECTION_SCOPE");
  }
  const token = freeze({
    ...checked,
    mainSha: expectedMain,
    observedAt: now,
    claim,
    successor,
  });
  verified.add(token);
  return token;
}
export function assertCorrectionAuthority(
  token,
  { task, changeSet, successor, claim },
) {
  assert.ok(verified.has(token), "TASK_CORRECTION_AUTHORITY_UNVERIFIED");
  assert.equal(
    token.grant.state,
    "CONSUMED",
    "TASK_CORRECTION_AUTHORITY_NOT_CONSUMED",
  );
  const clock = Date.now();
  assert.ok(
    clock >= Date.parse(token.observedAt) &&
      clock - Date.parse(token.observedAt) <= 30000 &&
      clock < Date.parse(token.grant.expiresAt) &&
      clock >= Date.parse(token.grant.issuedAt) &&
      clock < Date.parse(token.claim.expiresAt),
    "TASK_CORRECTION_AUTHORITY_STALE",
  );
  assert.equal(
    task.owner,
    token.grant.executor,
    "TASK_CORRECTION_EXECUTOR_UNAUTHORIZED",
  );
  assert.equal(
    task.changeSetId,
    token.grant.predecessor,
    "TASK_CORRECTION_PREDECESSOR_MISMATCH",
  );
  assert.equal(
    correctionDigest(task),
    token.grant.taskDigest,
    "TASK_CORRECTION_TASK_CHANGED",
  );
  assert.equal(
    task.handoffDigest,
    token.grant.handoffDigest,
    "TASK_CORRECTION_HANDOFF_CHANGED",
  );
  assert.equal(
    changeSetDigest(changeSet),
    token.grant.manifestDigest,
    "TASK_CORRECTION_MANIFEST_CHANGED",
  );
  assert.equal(
    successor.id,
    token.grant.successor,
    "TASK_CORRECTION_SUCCESSOR_CHANGED",
  );
  assert.equal(
    successor.branch,
    token.grant.branch,
    "TASK_CORRECTION_BRANCH_CHANGED",
  );
  assert.equal(
    successor.baseSha,
    token.mainSha,
    "TASK_CORRECTION_BASE_NOT_CURRENT",
  );
  assert.equal(
    correctionDigest(correctionEnvelope(successor)),
    token.grant.envelopeDigest,
    "TASK_CORRECTION_ENVELOPE_CHANGED",
  );
  assert.equal(
    correctionDigest(correctionClaim(claim)),
    token.grant.claimDigest,
    "TASK_CORRECTION_CLAIM_CHANGED",
  );
  return token;
}
