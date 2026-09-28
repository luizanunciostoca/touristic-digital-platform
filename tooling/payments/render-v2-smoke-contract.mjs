export function assertHealthyReadiness(responseStatus, body) {
  const checks = Array.isArray(body?.checks) ? body.checks : [];
  const failedChecks = checks
    .filter((check) => check?.status !== "pass")
    .map((check) => check?.name)
    .filter(Boolean);

  if (
    responseStatus !== 200 ||
    body?.readiness !== "ready" ||
    body?.status !== "healthy" ||
    !Array.isArray(body?.checks) ||
    failedChecks.length > 0
  ) {
    const status = String(body?.status ?? "unknown")
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/gu, "_");
    const failures = failedChecks.length ? `_${failedChecks.join(",")}` : "";
    throw new Error(`READYZ_FAILED_${responseStatus}_${status}${failures}`);
  }

  return {
    readiness: body.readiness,
    status: body.status,
    checks,
  };
}
