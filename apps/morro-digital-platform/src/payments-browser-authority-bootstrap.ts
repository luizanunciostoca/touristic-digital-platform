import type {
  ValidatedBusinessCheckoutHandoff,
} from "@touristic/ordering";

import {
  PaymentsBrowserCheckoutError,
  type PaymentsBrowserCheckoutAuthorityPort,
} from "./payments-browser-checkout-client.js";

export const PAYMENTS_HANDOFF_AUTHORITY_PATH =
  "/api/payments/v1/checkout-authority";

const maxResponseBytes = 16 * 1024;
const handoffTokenPattern =
  /^[A-Za-z0-9_-]{16,1800}\.[A-Za-z0-9_-]{32,128}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_INVALID_AUTHORITY",
      "A autorização da contratação excedeu o limite permitido.",
    );
  }
  try {
    const parsed = record(JSON.parse(body) as unknown);
    if (!parsed) throw new Error("not an object");
    return parsed;
  } catch {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_INVALID_AUTHORITY",
      "A autorização da contratação retornou uma resposta inválida.",
    );
  }
}

export function createServerIssuedPaymentsCheckoutAuthority(
  fetchFn: typeof fetch,
): PaymentsBrowserCheckoutAuthorityPort {
  return Object.freeze({
    async resolveCreateHeaders(
      handoff: ValidatedBusinessCheckoutHandoff,
    ): Promise<Readonly<Record<string, string>>> {
      const response = await fetchFn(PAYMENTS_HANDOFF_AUTHORITY_PATH, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(handoff),
      });
      const payload = await responsePayload(response);
      if (!response.ok) {
        const code = text(payload.error, 120) || "AUTHORITY_BOOTSTRAP_REJECTED";
        throw new PaymentsBrowserCheckoutError(
          "PAYMENTS_BROWSER_INVALID_AUTHORITY",
          `Não foi possível autorizar a contratação (${code}).`,
        );
      }
      const data = record(payload.data);
      const handoffToken = text(data?.handoffToken, 2_048);
      if (!handoffTokenPattern.test(handoffToken)) {
        throw new PaymentsBrowserCheckoutError(
          "PAYMENTS_BROWSER_INVALID_AUTHORITY",
          "A autorização da contratação é inválida.",
        );
      }
      return Object.freeze({
        "X-Checkout-Handoff-Token": handoffToken,
      });
    },
  });
}
