import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { createPlatformObservation } from "@touristic/core";

const correlationPattern = /^[A-Za-z0-9._:-]{1,160}$/u;
const providerHealthFailureCodes = new Set([
  "SANDBOX_PROVIDER_UNAVAILABLE",
  "SANDBOX_PROVIDER_INVALID_RESPONSE",
]);

function bounded(value, max = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, max);
}

function correlationId(value) {
  const normalized = bounded(value, 160);
  return correlationPattern.test(normalized)
    ? normalized
    : `corr_${randomUUID()}`;
}

function primitiveAttributes(input) {
  return Object.fromEntries(
    Object.entries(input ?? {})
      .map(([key, value]) => {
        const normalizedKey = bounded(key, 160);
        if (!normalizedKey) return null;
        if (value === null || typeof value === "boolean") {
          return [normalizedKey, value];
        }
        if (typeof value === "number" && Number.isFinite(value)) {
          return [normalizedKey, value];
        }
        if (typeof value === "string") {
          return [normalizedKey, bounded(value, 500)];
        }
        return null;
      })
      .filter(Boolean),
  );
}

function safeErrorCode(error) {
  if (
    error &&
    typeof error === "object" &&
    typeof error.code === "string"
  ) {
    return bounded(error.code, 120) || "unknown";
  }
  return "unknown";
}

function auditObservationName(action) {
  const normalized = bounded(action, 160);
  if (normalized.startsWith("payment.refund")) {
    return "payments.refund.lifecycle";
  }
  if (normalized.startsWith("reconciliation")) {
    return "payments.reconciliation.lifecycle";
  }
  if (normalized.startsWith("webhook")) {
    return "payments.verified_outcome.lifecycle";
  }
  if (normalized.startsWith("checkout.authority")) {
    return "payments.checkout_authority.lifecycle";
  }
  return "payments.checkout.lifecycle";
}

export function createPaymentsPlatformObservability({
  destinationId,
  sink = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
} = {}) {
  const destination = bounded(destinationId, 160);
  if (!destination) {
    throw new Error("PAYMENTS_OBSERVABILITY_DESTINATION_REQUIRED");
  }

  const context = new AsyncLocalStorage();
  const degradedProviders = new Set();

  function currentCorrelationId() {
    return correlationId(context.getStore()?.correlationId);
  }

  function emit({
    kind = "log",
    name,
    severity = "info",
    correlationId: requestedCorrelationId,
    tenantId,
    attributes = {},
  }) {
    try {
      const observation = createPlatformObservation({
        kind,
        name,
        severity,
        destinationId: destination,
        ...(bounded(tenantId, 160) ? { tenantId: bounded(tenantId, 160) } : {}),
        correlationId: correlationId(
          requestedCorrelationId ?? context.getStore()?.correlationId,
        ),
        attributes: Object.freeze({
          service: "morro-digital-platform",
          domain: "payments-financial-subscription",
          ...primitiveAttributes(attributes),
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
        // Observation delivery is non-authoritative and must never change money state.
      }
      return observation;
    } catch {
      return null;
    }
  }

  function runWithCorrelation(requestedCorrelationId, operation) {
    const resolved = correlationId(requestedCorrelationId);
    return context.run(Object.freeze({ correlationId: resolved }), operation);
  }

  function recordAudit(event) {
    const result = bounded(event?.result, 80) || "unknown";
    const action = bounded(event?.action, 160) || "unknown";
    emit({
      kind: "audit",
      name: auditObservationName(action),
      severity:
        result === "failure" || result === "denied" ? "warn" : "info",
      correlationId: event?.correlationId,
      tenantId: event?.tenantId,
      attributes: {
        action,
        result,
        reason: bounded(event?.reason, 160) || "unknown",
        actorSubject: bounded(event?.actorSubject, 200) || null,
        paymentId: bounded(event?.paymentId, 160) || null,
        orderId: bounded(event?.orderId, 160) || null,
        checkoutId: bounded(event?.checkoutId, 160) || null,
        reconciliationRunId:
          bounded(event?.reconciliationRunId, 160) || null,
      },
    });
  }

  function providerDegraded(provider, operation, error) {
    const providerName = bounded(provider, 120) || "payments-provider";
    const code = safeErrorCode(error);
    if (!providerHealthFailureCodes.has(code)) {
      emit({
        kind: "audit",
        name: "payments.provider.command_rejected",
        severity: "warn",
        attributes: { provider: providerName, operation, code },
      });
      return;
    }
    if (degradedProviders.has(providerName)) return;
    degradedProviders.add(providerName);
    emit({
      kind: "alert",
      name: "platform.provider.degraded",
      severity: "warn",
      attributes: { provider: providerName, operation, reason: code },
    });
  }

  function providerRecovered(provider, operation) {
    const providerName = bounded(provider, 120) || "payments-provider";
    if (!degradedProviders.delete(providerName)) return;
    emit({
      kind: "log",
      name: "platform.provider.recovered",
      severity: "info",
      attributes: { provider: providerName, operation },
    });
  }

  async function observedProviderCall(provider, operation, call) {
    try {
      const result = await call();
      providerRecovered(provider, operation);
      return result;
    } catch (error) {
      providerDegraded(provider, operation, error);
      throw error;
    }
  }

  function observeCheckoutProvider(provider, name = "payments-sandbox") {
    return Object.freeze({
      createCheckout(input) {
        return observedProviderCall(name, "checkout.create", () =>
          provider.createCheckout(input),
        );
      },
    });
  }

  function observeRefundProvider(provider, name = "payments-sandbox") {
    return Object.freeze({
      requestRefund(input) {
        return observedProviderCall(name, "refund.request", () =>
          provider.requestRefund(input),
        );
      },
    });
  }

  function observeReconciliationProvider(provider, name = "payments-sandbox") {
    return Object.freeze({
      readPayment(input) {
        return observedProviderCall(name, "reconciliation.read", () =>
          provider.readPayment(input),
        );
      },
    });
  }

  function recurrencePort() {
    return Object.freeze({
      record(event) {
        emit({
          kind: event?.severity === "warn" ? "alert" : "audit",
          name: "payments.subscription.recurrence",
          severity: event?.severity === "warn" ? "warn" : "info",
          correlationId: event?.correlationId,
          attributes: {
            action: bounded(event?.action, 120) || "recurrence.unknown",
            disposition: bounded(event?.disposition, 120) || "unknown",
            subscriptionId: bounded(event?.subscriptionId, 160) || null,
            periodNumber:
              Number.isSafeInteger(event?.periodNumber) && event.periodNumber >= 0
                ? event.periodNumber
                : null,
            orderId: bounded(event?.orderId, 160) || null,
            verifiedResultId: bounded(event?.verifiedResultId, 160) || null,
          },
        });
      },
    });
  }

  return Object.freeze({
    emit,
    runWithCorrelation,
    currentCorrelationId,
    recordAudit,
    observeCheckoutProvider,
    observeRefundProvider,
    observeReconciliationProvider,
    recurrencePort,
  });
}
