import { randomUUID } from "node:crypto";

import {
  createPlatformHealthSnapshot,
  createPlatformObservation,
} from "@touristic/core";

const service = "morro-digital-platform";
const destinationId = "morro-de-sao-paulo";
const correlationPattern = /^[A-Za-z0-9._:-]{1,160}$/u;
const approvedInlineImportMapHashes = Object.freeze([
  "'sha256-m42qLvsHi55hG6DJxpKtlwgH50ivEzS+c7mS4Bsk5CE='",
  "'sha256-8kxcShLx6HFFQPDtnPQPJp+VZhd/lQeB+ir19hB7kTA='",
  "'sha256-v+ikbD8xIyBtt9hWH4Ialp9gTbe357EC4dWfgkMtMOc='",
]);

function firstHeader(value) {
  if (Array.isArray(value)) return firstHeader(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function bounded(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function releaseField(value, fallback = "unknown") {
  const normalized = bounded(value, 160);
  return normalized || fallback;
}

function integerEnvironment(getEnvironmentValue, key, fallback, min, max) {
  const raw = String(getEnvironmentValue(key) ?? "").trim();
  if (!raw) return fallback;
  if (!/^\d+$/u.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function bindApprovedImportMapHashes(response) {
  const header = response.getHeader("Content-Security-Policy");
  if (typeof header !== "string") return;

  const directives = header
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean);
  const scriptIndex = directives.findIndex((directive) =>
    directive.startsWith("script-src "),
  );
  if (scriptIndex < 0) return;

  directives[scriptIndex] =
    `${directives[scriptIndex]} ${approvedInlineImportMapHashes.join(" ")}`;
  if (!directives.some((directive) => directive.startsWith("script-src-attr "))) {
    directives.push("script-src-attr 'none'");
  }
  response.setHeader("Content-Security-Policy", directives.join("; "));
}

export function createPlatformOperations({
  getEnvironmentValue = (key) => process.env[key] ?? "",
  additionalReadinessChecks = () => [],
  sink = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
  processEvents = process,
} = {}) {
  const production = getEnvironmentValue("NODE_ENV") === "production";
  const release = Object.freeze({
    sha: releaseField(
      getEnvironmentValue("MORRO_RELEASE_SHA") ||
        getEnvironmentValue("GITHUB_SHA"),
    ),
    version: releaseField(getEnvironmentValue("MORRO_RELEASE_VERSION")),
    deploymentId: releaseField(getEnvironmentValue("MORRO_DEPLOYMENT_ID")),
  });
  const releaseIdentityConfigured = Object.values(release).every(
    (value) => value !== "unknown",
  );
  const rollbackFromSha = bounded(
    getEnvironmentValue("MORRO_ROLLBACK_FROM_SHA"),
    160,
  );
  const shutdownReadinessDelayMs = integerEnvironment(
    getEnvironmentValue,
    "PLATFORM_SHUTDOWN_READINESS_DELAY_MS",
    production ? 5_000 : 0,
    0,
    60_000,
  );
  const shutdownDrainTimeoutMs = integerEnvironment(
    getEnvironmentValue,
    "PLATFORM_SHUTDOWN_DRAIN_TIMEOUT_MS",
    15_000,
    1_000,
    120_000,
  );
  const degradedProviders = new Map();
  let listening = false;
  let acceptingTraffic = true;
  let fatalFailureMonitorInstalled = false;

  function newCorrelationId() {
    return `corr_${randomUUID()}`;
  }

  function correlationIdFromRequest(request) {
    const requested = firstHeader(request?.headers?.["x-correlation-id"]);
    return correlationPattern.test(requested) ? requested : newCorrelationId();
  }

  function bindResponse(response, correlationId) {
    bindApprovedImportMapHashes(response);
    response.setHeader("X-Correlation-ID", correlationId);
    response.setHeader("X-Release-SHA", release.sha);
    response.setHeader("X-Release-Version", release.version);
    response.setHeader("X-Deployment-ID", release.deploymentId);
  }

  function emit({
    kind = "log",
    name,
    severity = "info",
    correlationId = newCorrelationId(),
    attributes = {},
  }) {
    const safeAttributes = Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        bounded(key, 160),
        typeof value === "string" ? bounded(value, 500) : value,
      ]),
    );
    const observation = createPlatformObservation({
      kind,
      name,
      severity,
      destinationId,
      correlationId,
      attributes: Object.freeze({
        service,
        releaseSha: release.sha,
        releaseVersion: release.version,
        deploymentId: release.deploymentId,
        ...safeAttributes,
      }),
    });
    try {
      sink(
        Object.freeze({
          contract: "PLATFORM-OBSERVATION",
          contractVersion: 1,
          observation,
        }),
      );
    } catch {
      // Observation delivery cannot change request authority or response outcome.
    }
    return observation;
  }

  function fatalFailureMonitor(error, origin) {
    emit({
      kind: "alert",
      name: "platform.runtime.fatal_failure",
      severity: "critical",
      attributes: {
        origin: bounded(origin, 80) || "uncaughtException",
        errorName: error instanceof Error ? error.name : "UnknownError",
        message:
          error instanceof Error
            ? error.message
            : bounded(error, 500) || "unknown fatal process failure",
      },
    });
  }

  function installFatalFailureMonitor() {
    if (
      !production ||
      fatalFailureMonitorInstalled ||
      typeof processEvents?.on !== "function"
    ) {
      return;
    }
    processEvents.on("uncaughtExceptionMonitor", fatalFailureMonitor);
    fatalFailureMonitorInstalled = true;
  }

  function removeFatalFailureMonitor() {
    if (!fatalFailureMonitorInstalled) return;
    if (typeof processEvents?.off === "function") {
      processEvents.off("uncaughtExceptionMonitor", fatalFailureMonitor);
    } else if (typeof processEvents?.removeListener === "function") {
      processEvents.removeListener(
        "uncaughtExceptionMonitor",
        fatalFailureMonitor,
      );
    }
    fatalFailureMonitorInstalled = false;
  }

  function providerDegraded(provider, reason, correlationId) {
    const name = bounded(provider, 120) || "unknown";
    const detail = bounded(reason, 300) || "degraded";
    const previous = degradedProviders.get(name);
    degradedProviders.set(name, detail);
    if (previous === detail) return;
    emit({
      kind: "alert",
      name: "platform.provider.degraded",
      severity: "warn",
      correlationId,
      attributes: { provider: name, reason: detail },
    });
  }

  function providerRecovered(provider, correlationId) {
    const name = bounded(provider, 120) || "unknown";
    if (!degradedProviders.delete(name)) return;
    emit({
      kind: "log",
      name: "platform.provider.recovered",
      severity: "info",
      correlationId,
      attributes: { provider: name },
    });
  }

  function healthSnapshot(correlationId = newCorrelationId()) {
    const checks = [
      {
        name: "http-listener",
        status: listening ? "pass" : "fail",
        critical: true,
        detail: listening ? "listening" : "not-listening",
      },
      {
        name: "shutdown-readiness",
        status: acceptingTraffic ? "pass" : "fail",
        critical: true,
        detail: acceptingTraffic ? "accepting-traffic" : "draining",
      },
      {
        name: "release-identity",
        status: production && !releaseIdentityConfigured ? "fail" : "pass",
        critical: true,
        detail: releaseIdentityConfigured
          ? "immutable-release-identity-configured"
          : production
            ? "MORRO_RELEASE_IDENTITY_REQUIRED_IN_PRODUCTION"
            : "local-development-identity",
      },
      ...additionalReadinessChecks(),
      ...Array.from(degradedProviders, ([provider, detail]) => ({
        name: `provider-${provider}`.slice(0, 160),
        status: "warn",
        critical: false,
        detail,
      })),
    ];
    return createPlatformHealthSnapshot({
      service,
      destinationId,
      correlationId,
      checks,
    });
  }

  function setListening(value, correlationId = newCorrelationId()) {
    listening = Boolean(value);
    if (listening) installFatalFailureMonitor();
    else removeFatalFailureMonitor();
    emit({
      kind: "log",
      name: listening ? "platform.runtime.started" : "platform.runtime.stopped",
      severity: "info",
      correlationId,
      attributes: { listening },
    });
    if (listening && rollbackFromSha) {
      emit({
        kind: "audit",
        name: "platform.release.rollback_activated",
        severity: "warn",
        correlationId,
        attributes: {
          fromReleaseSha: rollbackFromSha,
          toReleaseSha: release.sha,
        },
      });
    }
  }

  function beginShutdown(signal, correlationId = newCorrelationId()) {
    if (!acceptingTraffic) return false;
    acceptingTraffic = false;
    emit({
      kind: "alert",
      name: "platform.shutdown.readiness_transition",
      severity: "warn",
      correlationId,
      attributes: { signal: bounded(signal, 80), readiness: "not_ready" },
    });
    return true;
  }

  return Object.freeze({
    service,
    destinationId,
    release,
    shutdownReadinessDelayMs,
    shutdownDrainTimeoutMs,
    correlationIdFromRequest,
    bindResponse,
    emit,
    providerDegraded,
    providerRecovered,
    healthSnapshot,
    setListening,
    beginShutdown,
    isAcceptingTraffic: () => acceptingTraffic,
  });
}
