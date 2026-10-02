const CANONICAL_RUNTIME_SCOPES = new Map([
  ["morro-digital-v2-staging", "staging"],
  ["morro-digital-v2", "production"],
]);

export function resolveLegacyCommercialRuntimeScope(
  environment = process.env,
  deniedCode = "LEGACY_COMMERCIAL_RUNTIME_SERVICE_DENIED",
) {
  const serviceName = String(environment.RENDER_SERVICE_NAME ?? "").trim();
  const scope = CANONICAL_RUNTIME_SCOPES.get(serviceName);
  if (!scope) throw new Error(deniedCode);
  return scope;
}

export function legacyCommercialMigrationActor(scope, operation) {
  if (!["staging", "production"].includes(scope)) {
    throw new Error("LEGACY_COMMERCIAL_RUNTIME_SCOPE_INVALID");
  }
  const token = String(operation ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(token)) {
    throw new Error("LEGACY_COMMERCIAL_RUNTIME_OPERATION_INVALID");
  }
  const now = Math.floor(Date.now() / 1000);
  const subject = `${scope}-legacy-commercial-${token}`;
  return Object.freeze({
    subject,
    email: `${subject}@example.invalid`,
    role: "PLATFORM_OWNER",
    businessIds: Object.freeze([]),
    issuedAt: now - 60,
    expiresAt: now + 3600,
    sessionId: subject,
  });
}
