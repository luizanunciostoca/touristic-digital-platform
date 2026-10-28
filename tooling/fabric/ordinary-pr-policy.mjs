import assert from "node:assert/strict";

// No claim/lease for ordinary application work. Sensitive paths keep the existing
// Fabric checks. Policies passed here MUST be read from the verified current base.
export function ordinaryPrScope(files, risk, ownership) {
  assert.ok(Array.isArray(files) && files.length > 0, "ORDINARY_PATHS_REQUIRED");
  assert.ok(Array.isArray(risk?.highPaths) && Array.isArray(risk?.criticalPaths), "ORDINARY_RISK_POLICY_INVALID");
  assert.ok(Array.isArray(ownership?.domains), "ORDINARY_OWNERSHIP_INVALID");
  assert.ok(risk.semanticRiskFloor && typeof risk.semanticRiskFloor === "object" && !Array.isArray(risk.semanticRiskFloor), "ORDINARY_SEMANTIC_POLICY_INVALID");
  for (const prefix of [...risk.highPaths, ...risk.criticalPaths]) {
    assert.ok(typeof prefix === "string" && prefix.length > 0, "ORDINARY_RISK_PREFIX_INVALID");
  }
  for (const domain of ownership.domains) {
    assert.ok(Array.isArray(domain.pathPrefixes) && domain.pathPrefixes.every(p => typeof p === "string" && p.length > 0), "ORDINARY_DOMAIN_PATHS_INVALID");
    assert.ok(Array.isArray(domain.contracts), "ORDINARY_DOMAIN_CONTRACTS_INVALID");
    for (const contract of domain.contracts) {
      assert.ok(typeof contract === "string" && Object.hasOwn(risk.semanticRiskFloor, contract) && ["low", "medium", "high", "critical"].includes(risk.semanticRiskFloor[contract]), "ORDINARY_CONTRACT_RISK_UNKNOWN");
    }
  }
  const matches = (path, prefix) => prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix;
  const reserved = [".github/", ".morro/", "tooling/", "docs/operations/", "docs/architecture/", "docs/security/", "docs/control-center/"];
  return files.every(path => {
    assert.ok(typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("\\") && !path.split("/").some(p => p === "." || p === ".." || p === ""), "ORDINARY_PATH_INVALID");
    if (!/^(?:apps\/[^/]+\/(?:src|public)\/|packages\/[^/]+\/src\/|services\/[^/]+\/src\/|docs\/)/u.test(path)) return false;
    if (reserved.some(p => path.startsWith(p))) return false;
    if ([...risk.highPaths, ...risk.criticalPaths].some(p => path.startsWith(p))) return false;
    if (/(?:^|\/)(?:\.env[^/]*|secrets?|credentials?|migrations?|production|deploy)(?:\/|\.|$)/iu.test(path)) return false;
    const domains = ownership.domains.filter(d => d.pathPrefixes.some(p => matches(path, p)));
    if (domains.length === 0) return false;
    // All overlapping domains matter: a broad ordinary owner cannot mask auth.
    if (domains.some(d => d.contracts.some(c => ["high", "critical"].includes(risk.semanticRiskFloor[c])))) return false;
    return true;
  });
}
