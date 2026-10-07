import assert from "node:assert/strict";
import crypto from "node:crypto";
import { patternsOverlap } from "../fabric/claim-guard.mjs";
const SHA = /^[0-9a-f]{40}$/u;
const uniq = (value) => [...new Set(value ?? [])].sort();
const hash = (value) =>
  "sha256:" +
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function buildClaimIdentity(claimId, claim) {
  assert.match(claimId ?? "", /^MD-[A-Z0-9-]+$/u);
  assert.ok(claim && typeof claim === "object");
  const scope = {
    owner: claim.owner ?? null,
    reviewer: claim.reviewer ?? null,
    paths: uniq(claim.paths),
    domains: uniq(claim.domains),
    risk: claim.risk ?? null,
  };
  return {
    claimId,
    scope,
    scopeDigest: hash(scope),
    authorityAnchorSha: claim.baseSha ?? null,
  };
}
export function buildCandidateIdentity(value) {
  for (const key of ["baseSha", "headSha", "treeSha"])
    assert.match(value?.[key] ?? "", SHA, "CANDIDATE_IDENTITY_INVALID");
  assert.ok(value?.branch, "CANDIDATE_BRANCH_INVALID");
  return Object.freeze({ ...value });
}
export function semanticIntersection(left = {}, right = {}) {
  const findings = [];
  for (const a of left.paths ?? [])
    for (const b of right.paths ?? [])
      if (patternsOverlap(a, b))
        findings.push({ kind: "path", left: a, right: b });
  for (const key of [
    "contracts",
    "events",
    "tables",
    "routes",
    "authCapabilities",
  ]) {
    const values = new Set(right[key] ?? []);
    for (const value of left[key] ?? [])
      if (values.has(value)) findings.push({ kind: key, value });
  }
  return { intersects: Boolean(findings.length), findings };
}
export function evaluateMainAdvance({
  claimIdentity,
  candidateIdentity,
  candidateLocks,
  mainAdvance,
}) {
  assert.ok(claimIdentity?.scopeDigest && candidateIdentity?.headSha);
  assert.match(mainAdvance?.mainSha ?? "", SHA);
  const semanticIntersectionResult = semanticIntersection(
      candidateLocks,
      mainAdvance.semanticLocks,
    ),
    conflict = semanticIntersectionResult.intersects;
  return {
    claimPreserved: true,
    claimScopeDigest: claimIdentity.scopeDigest,
    previousCandidate: candidateIdentity,
    nextBaseSha: mainAdvance.mainSha,
    semanticIntersection: semanticIntersectionResult,
    action: conflict ? "RECOMPOSE_CANDIDATE" : "REFRESH_CANDIDATE_IDENTITY",
    restartImplementation: conflict,
    invalidatedDependencies: conflict ? uniq(mainAdvance.dependencies) : [],
  };
}
export function classifyRunAgainstCandidate({
  runHeadSha,
  currentHeadSha,
  status,
}) {
  assert.match(runHeadSha ?? "", SHA);
  assert.match(currentHeadSha ?? "", SHA);
  return runHeadSha === currentHeadSha
    ? { state: "CURRENT", cancelRecommended: false }
    : {
        state: "SUPERSEDED",
        cancelRecommended: ["queued", "in_progress"].includes(status),
      };
}
export const runCanSatisfyCandidate = ({
  runHeadSha,
  currentHeadSha,
  conclusion,
}) => runHeadSha === currentHeadSha && conclusion === "success";
