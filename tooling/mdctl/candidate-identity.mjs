import assert from "node:assert/strict";
import crypto from "node:crypto";
import { patternsOverlap } from "../fabric/claim-guard.mjs";

const SHA = /^[0-9a-f]{40}$/u;

function sorted(values = []) {
  assert.ok(Array.isArray(values), "CANDIDATE_IDENTITY_ARRAY_REQUIRED");
  return [...new Set(values)].sort();
}

function digest(value) {
  return (
    "sha256:" +
    crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
  );
}

export function buildClaimIdentity(claimId, claim) {
  assert.match(claimId ?? "", /^MD-[A-Z0-9-]+$/u, "CLAIM_IDENTITY_ID_INVALID");
  assert.ok(claim && typeof claim === "object", "CLAIM_IDENTITY_REQUIRED");
  const scope = {
    owner: claim.owner ?? null,
    reviewer: claim.reviewer ?? null,
    paths: sorted(claim.paths),
    domains: sorted(claim.domains),
    risk: claim.risk ?? null,
  };
  return {
    claimId,
    scope,
    scopeDigest: digest(scope),
    authorityAnchorSha: claim.baseSha ?? null,
  };
}

export function buildCandidateIdentity({ baseSha, headSha, treeSha, branch }) {
  for (const [name, value] of [
    ["BASE", baseSha],
    ["HEAD", headSha],
    ["TREE", treeSha],
  ])
    assert.match(value ?? "", SHA, "CANDIDATE_" + name + "_INVALID");
  assert.equal(typeof branch, "string", "CANDIDATE_BRANCH_INVALID");
  assert.ok(branch.length > 0, "CANDIDATE_BRANCH_INVALID");
  return Object.freeze({ baseSha, headSha, treeSha, branch });
}

export function semanticIntersection(left = {}, right = {}) {
  const findings = [];
  for (const a of left.paths ?? []) {
    for (const b of right.paths ?? []) {
      if (patternsOverlap(a, b))
        findings.push({ kind: "path", left: a, right: b });
    }
  }
  for (const key of [
    "contracts",
    "events",
    "tables",
    "routes",
    "authCapabilities",
  ]) {
    const r = new Set(right[key] ?? []);
    for (const value of left[key] ?? [])
      if (r.has(value)) findings.push({ kind: key, value });
  }
  return { intersects: findings.length > 0, findings };
}

export function evaluateMainAdvance({
  claimIdentity,
  candidateIdentity,
  candidateLocks,
  mainAdvance,
}) {
  assert.ok(claimIdentity?.scopeDigest, "MAIN_ADVANCE_CLAIM_IDENTITY_REQUIRED");
  assert.ok(
    candidateIdentity?.headSha,
    "MAIN_ADVANCE_CANDIDATE_IDENTITY_REQUIRED",
  );
  assert.match(mainAdvance?.mainSha ?? "", SHA, "MAIN_ADVANCE_SHA_INVALID");
  const intersection = semanticIntersection(
    candidateLocks,
    mainAdvance.semanticLocks,
  );
  return {
    claimPreserved: true,
    claimScopeDigest: claimIdentity.scopeDigest,
    previousCandidate: candidateIdentity,
    nextBaseSha: mainAdvance.mainSha,
    semanticIntersection: intersection,
    action: intersection.intersects
      ? "RECOMPOSE_CANDIDATE"
      : "REFRESH_CANDIDATE_IDENTITY",
    restartImplementation: intersection.intersects,
    invalidatedDependencies: intersection.intersects
      ? sorted(mainAdvance.dependencies ?? [])
      : [],
  };
}

export function classifyRunAgainstCandidate({
  runHeadSha,
  currentHeadSha,
  status,
}) {
  assert.match(runHeadSha ?? "", SHA, "RUN_HEAD_INVALID");
  assert.match(currentHeadSha ?? "", SHA, "CURRENT_HEAD_INVALID");
  if (runHeadSha === currentHeadSha)
    return { state: "CURRENT", cancelRecommended: false };
  return {
    state: "SUPERSEDED",
    cancelRecommended: ["queued", "in_progress"].includes(status),
  };
}

export function runCanSatisfyCandidate({
  runHeadSha,
  currentHeadSha,
  conclusion,
}) {
  return runHeadSha === currentHeadSha && conclusion === "success";
}
