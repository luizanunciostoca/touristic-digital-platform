import assert from "node:assert/strict";
import { pathOwned } from "../fabric/claim-guard.mjs";
import { validateChangeSetV2 } from "./changeset-v2.mjs";

const WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };

function pathRisk(path, policy) {
  if ((policy.criticalPaths ?? []).some((prefix) => path.includes(prefix)))
    return "critical";
  if ((policy.highPaths ?? []).some((prefix) => path.includes(prefix)))
    return "high";
  if (
    (policy.lowExtensions ?? []).some((extension) => path.endsWith(extension))
  )
    return "low";
  return "medium";
}

function maximumRisk(values) {
  return values.reduce(
    (best, value) => (WEIGHT[value] > WEIGHT[best] ? value : best),
    "low",
  );
}

export function buildChangeEnvelope({
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
}) {
  assert.equal(
    typeof rootCause,
    "string",
    "CHANGE_ENVELOPE_ROOT_CAUSE_REQUIRED",
  );
  assert.ok(rootCause.trim(), "CHANGE_ENVELOPE_ROOT_CAUSE_REQUIRED");
  assert.equal(
    typeof semanticImpact,
    "string",
    "CHANGE_ENVELOPE_IMPACT_REQUIRED",
  );
  assert.ok(semanticImpact.trim(), "CHANGE_ENVELOPE_IMPACT_REQUIRED");
  validateChangeSetV2(changeSet);
  assert.ok(
    Array.isArray(probablePaths) && probablePaths.length > 0,
    "CHANGE_ENVELOPE_PATHS_REQUIRED",
  );
  const outsideClaim = probablePaths.filter(
    (path) => !changeSet.owns.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(
    outsideClaim,
    [],
    "CHANGE_ENVELOPE_SCOPE_EXPANSION_REQUIRED",
  );
  const domains = (ownership?.domains ?? [])
    .filter((domain) =>
      probablePaths.some((path) =>
        (domain.pathPrefixes ?? []).some((prefix) => path.startsWith(prefix)),
      ),
    )
    .map((domain) => domain.id);
  assert.ok(domains.length > 0, "CHANGE_ENVELOPE_OWNERSHIP_UNMAPPED");
  const pathRisks = probablePaths.map((path) => pathRisk(path, riskPolicy));
  const riskFloor = maximumRisk([changeSet.risk, ...pathRisks]);
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
    ownershipDomains: [...new Set(domains)].sort(),
    declaredRisk: changeSet.risk,
    riskFloor,
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
  const unowned = requestedPaths.filter(
    (path) =>
      !expandedChangeSet.owns.paths.some((pattern) => pathOwned(path, pattern)),
  );
  assert.deepEqual(unowned, [], "CHANGE_ENVELOPE_EXPANSION_UNCLAIMED");
  return true;
}
