#!/usr/bin/env node

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function baseUrl() {
  const url = new URL(required("MORRO_V2_BASE_URL"));
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("MORRO_V2_BASE_URL_INVALID");
  }
  return url;
}

async function request(pathname) {
  const url = new URL(pathname, baseUrl());
  const response = await fetch(url, {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, body };
}

function requireHeader(headers, name) {
  const value = headers.get(name)?.trim() ?? "";
  if (!value || value === "unknown")
    throw new Error(`${name.toUpperCase()}_MISSING`);
  return value;
}

function requireHsts(headers) {
  const value = requireHeader(headers, "strict-transport-security");
  if (value !== "max-age=31536000") {
    throw new Error("STRICT_TRANSPORT_SECURITY_INVALID");
  }
  return value;
}

const health = await request("/healthz");
if (health.response.status !== 200 || health.body?.status !== "live") {
  throw new Error(`HEALTHZ_FAILED_${health.response.status}`);
}
const healthRelease = requireHeader(health.response.headers, "x-release-sha");
requireHeader(health.response.headers, "x-correlation-id");
const healthHsts = requireHsts(health.response.headers);

const ready = await request("/readyz");
if (ready.response.status !== 200 || ready.body?.readiness !== "ready") {
  const failedChecks = Array.isArray(ready.body?.checks)
    ? ready.body.checks
        .filter((check) => check?.status === "fail")
        .map((check) => check?.name)
        .filter(Boolean)
    : [];
  throw new Error(
    `READYZ_FAILED_${ready.response.status}${failedChecks.length ? `_${failedChecks.join(",")}` : ""}`,
  );
}
const readyRelease = requireHeader(ready.response.headers, "x-release-sha");
requireHeader(ready.response.headers, "x-release-version");
requireHeader(ready.response.headers, "x-deployment-id");
requireHeader(ready.response.headers, "x-correlation-id");
const readyHsts = requireHsts(ready.response.headers);
if (readyRelease !== healthRelease) throw new Error("RELEASE_IDENTITY_DRIFT");
if (readyHsts !== healthHsts) throw new Error("HSTS_HEADER_DRIFT");

process.stdout.write(
  `${JSON.stringify({
    contract: "MORRO-DIGITAL-V2-RENDER-SMOKE",
    contractVersion: 2,
    status: "pass",
    releaseSha: readyRelease,
    readiness: ready.body.readiness,
    securityHeaders: { strictTransportSecurity: readyHsts },
    checks: ready.body.checks,
  })}\n`,
);
