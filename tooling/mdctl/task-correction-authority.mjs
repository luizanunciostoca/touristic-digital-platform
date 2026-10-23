import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { canonicalJson, changeSetDigest } from "./changeset-v2.mjs";

// This is one reviewed correction, not a general delegation facility.
export const CORRECTION = Object.freeze({
  repository: "luizanunciostoca/touristic-digital-platform",
  owner: "CHATGPT-PRO-CONTROL",
  executor: "CODEX-STAGING-NODE-9482F85B-20261023",
  predecessor: "MD-STAGING-NODE-GOVERNANCE-20261023",
  successor: "MD-STAGING-NODE-GOVERNANCE-CORRECTION-20261023",
  branch: "fix/staging-node-governance-correction-20261023",
  path: ".morro/task-corrections/MD-STAGING-NODE-GOVERNANCE-CORRECTION-20261023.json",
});
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
export function correctionKey(handoffDigest) {
  assert.match(handoffDigest ?? "", HASH, "CORRECTION_HANDOFF_INVALID");
  return createHash("sha256")
    .update(
      CORRECTION.repository +
        "\n" +
        CORRECTION.predecessor +
        "\n" +
        handoffDigest,
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
  closed(grant, keys, "CORRECTION_GRANT_FIELDS");
  assert.equal(grant.schemaVersion, 1, "CORRECTION_GRANT_VERSION");
  assert.equal(
    grant.kind,
    "TDP_GOVERNANCE_CORRECTION_DELEGATION",
    "CORRECTION_GRANT_KIND",
  );
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
      CORRECTION[field],
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
      ["key", "commitSha", "issuedCommitSha"],
      "CORRECTION_RESERVATION_FIELDS",
    );
    assert.equal(
      grant.reservation.key,
      correctionKey(grant.handoffDigest),
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
  return grant;
}
const core = ({ state, reservation, ...rest }) => rest;

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
    key: correctionKey(current.handoffDigest),
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
function jsonBlob(path, ref) {
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
  return JSON.parse(bytes.toString("utf8"));
}
export function collectCorrectionAuthority({
  expectedMain,
  now = new Date().toISOString(),
}) {
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
      encodeURIComponent(CORRECTION.path),
  );
  assert.ok(
    commits.length > 0 && commits.length <= 32,
    "CORRECTION_HISTORY_REQUIRED",
  );
  // Every path-changing commit is read: deletion/recreation is not collapsed.
  const history = commits.toReversed().map((item) => ({
    commitSha: item.sha,
    grant: jsonBlob(CORRECTION.path, item.sha),
  }));
  const checked = validateCorrectionHistory(history, now);
  assert.deepEqual(
    jsonBlob(CORRECTION.path, expectedMain),
    checked.grant,
    "CORRECTION_CURRENT_HISTORY_MISMATCH",
  );
  const registry = jsonBlob(".github/morro-control/claims.json", expectedMain);
  const claim = registry.claims?.[CORRECTION.successor];
  assert.equal(
    registry.registryAuthority,
    "ORCHESTRATOR",
    "CORRECTION_REGISTRY_AUTHORITY",
  );
  assert.equal(claim?.owner, CORRECTION.owner, "CORRECTION_CANONICAL_OWNER");
  assert.equal(claim.branch, CORRECTION.branch, "CORRECTION_CLAIM_BRANCH");
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
    ".morro/changesets/" + CORRECTION.successor + ".json",
    expectedMain,
  );
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
  { task, changeSet, successor, claim, now },
) {
  assert.ok(verified.has(token), "TASK_CORRECTION_AUTHORITY_UNVERIFIED");
  assert.equal(
    token.grant.state,
    "CONSUMED",
    "TASK_CORRECTION_AUTHORITY_NOT_CONSUMED",
  );
  const clock = Date.parse(now);
  assert.ok(
    clock >= Date.parse(token.observedAt) &&
      clock - Date.parse(token.observedAt) <= 30000 &&
      clock < Date.parse(token.grant.expiresAt),
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
