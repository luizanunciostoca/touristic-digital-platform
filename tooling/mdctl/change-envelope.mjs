import { matchesOwnershipPath } from "../fabric/ownership-path.mjs";
import assert from "node:assert/strict";
import { pathOwned } from "../fabric/claim-guard.mjs";
import { validateChangeSetV2 } from "./changeset-v2.mjs";
const weight = { low: 1, medium: 2, high: 3, critical: 4 },
  highest = (xs) => xs.reduce((a, b) => (weight[b] > weight[a] ? b : a), "low");
const riskForPath = (path, policy) =>
  (policy.criticalPaths ?? []).some((x) => path.includes(x))
    ? "critical"
    : (policy.highPaths ?? []).some((x) => path.includes(x))
      ? "high"
      : (policy.lowExtensions ?? []).some((x) => path.endsWith(x))
        ? "low"
        : "medium";
export function buildChangeEnvelope(input) {
  const {
    rootCause,
    semanticImpact,
    probablePaths,
    contracts = [],
    entities = [],
    dependencies = [],
    tests = [],
    build = [],
    proofPlan = [],
    changeSet,
    ownership,
    riskPolicy,
  } = input;
  assert.ok(
    rootCause?.trim() && semanticImpact?.trim() && probablePaths?.length,
    "CHANGE_ENVELOPE_INPUT_REQUIRED",
  );
  validateChangeSetV2(changeSet);
  assert.deepEqual(
    probablePaths.filter(
      (path) =>
        !changeSet.owns.paths.some((pattern) => pathOwned(path, pattern)),
    ),
    [],
    "CHANGE_ENVELOPE_SCOPE_EXPANSION_REQUIRED",
  );
  const ownershipDomains = (ownership?.domains ?? [])
    .filter((domain) =>
      probablePaths.some((path) =>
        (domain.pathPrefixes ?? []).some((prefix) =>
          matchesOwnershipPath(path, prefix),
        ),
      ),
    )
    .map((domain) => domain.id);
  assert.ok(ownershipDomains.length, "CHANGE_ENVELOPE_OWNERSHIP_UNMAPPED");
  const semantic = contracts
    .map((contract) => riskPolicy.semanticRiskFloor?.[contract])
    .filter(Boolean);
  return {
    schemaVersion: 1,
    kind: "TDP_CHANGE_ENVELOPE",
    changeSetId: changeSet.id,
    rootCause: rootCause.trim(),
    semanticImpact: semanticImpact.trim(),
    probablePaths: [...probablePaths],
    contracts: [...contracts],
    entities: [...entities],
    dependencies: [...dependencies],
    tests: [...tests],
    build: [...build],
    proofPlan: [...proofPlan],
    ownershipDomains: [...new Set(ownershipDomains)].sort(),
    declaredRisk: changeSet.risk,
    riskFloor: highest([
      changeSet.risk,
      ...probablePaths.map((path) => riskForPath(path, riskPolicy)),
      ...semantic,
    ]),
    scopeExpansionRequired: false,
  };
}
export function assertScopeExpansionAuthorized({
  currentEnvelope,
  requestedPaths,
  expandedChangeSet,
}) {
  assert.ok(currentEnvelope?.changeSetId, "CHANGE_ENVELOPE_REQUIRED");
  validateChangeSetV2(expandedChangeSet);
  assert.equal(
    expandedChangeSet.id,
    currentEnvelope.changeSetId,
    "CHANGE_ENVELOPE_CHANGESET_MISMATCH",
  );
  assert.deepEqual(
    requestedPaths.filter(
      (path) =>
        !expandedChangeSet.owns.paths.some((pattern) =>
          pathOwned(path, pattern),
        ),
    ),
    [],
    "CHANGE_ENVELOPE_EXPANSION_UNCLAIMED",
  );
  return true;
}
