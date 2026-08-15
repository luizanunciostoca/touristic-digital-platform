import {
  createBusinessOrderRequestKey,
  normalizeBusinessCheckoutHandoff,
  type CheckoutApplicationRequest,
  type ValidatedBusinessCheckoutHandoff,
} from "@touristic/ordering";

export const PAYMENTS_BROWSER_POLL_INTERVAL_MS = 2_500;
export const PAYMENTS_BROWSER_MAX_POLL_ATTEMPTS = 240;

const checkoutApiPrefix = "/api/payments/v1/checkouts";
const maxResponseBytes = 64 * 1024;
const statusTokenPattern = /^cst_v1_[A-Za-z0-9_-]{16,220}$/u;
const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u;

export type PaymentsBrowserCheckoutErrorCode =
  | "PAYMENTS_BROWSER_INVALID_HANDOFF"
  | "PAYMENTS_BROWSER_AUTHORITY_REQUIRED"
  | "PAYMENTS_BROWSER_AUTHORITY_AMBIGUOUS"
  | "PAYMENTS_BROWSER_INVALID_AUTHORITY"
  | "PAYMENTS_BROWSER_INVALID_CORRELATION_ID"
  | "PAYMENTS_BROWSER_CHECKOUT_REJECTED"
  | "PAYMENTS_BROWSER_INVALID_RESPONSE"
  | "PAYMENTS_BROWSER_RESPONSE_TOO_LARGE"
  | "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH"
  | "PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED"
  | "PAYMENTS_BROWSER_CONFIRMATION_TIMEOUT";

export class PaymentsBrowserCheckoutError extends Error {
  constructor(
    readonly code: PaymentsBrowserCheckoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PaymentsBrowserCheckoutError";
  }
}

export interface PaymentsBrowserCheckoutAuthorityPort {
  resolveCreateHeaders(
    handoff: ValidatedBusinessCheckoutHandoff,
  ): Promise<Readonly<Record<string, string>>>;
}

export interface PaymentsBrowserCheckoutPopupPort {
  open(url: string, target: string, features: string): object | null;
  assign(url: string): void;
}

export interface PaymentsBrowserCheckoutSchedulerPort {
  wait(milliseconds: number): Promise<void>;
}

export interface PaymentsBrowserCheckoutSignalPort {
  verified(detail: PaymentsBrowserVerifiedPayment): void | Promise<void>;
  failed(detail: PaymentsBrowserCheckoutFailure): void | Promise<void>;
}

export interface PaymentsBrowserVerifiedPayment {
  readonly verified: true;
  readonly sessionId: string;
  readonly reference: string;
  readonly definitiveBusinessId: string | null;
  readonly activationStatus: string | null;
}

export interface PaymentsBrowserVerifiedFailure {
  readonly verified: true;
  readonly sessionId: string;
  readonly reason: string;
  readonly resultId: string;
}

export interface PaymentsBrowserCheckoutFailure {
  readonly sessionId: string;
  readonly message: string;
  readonly code: PaymentsBrowserCheckoutErrorCode;
}

export interface PaymentsBrowserCheckoutSession {
  readonly checkoutId: string;
  readonly paymentId: string;
  readonly status: string;
  readonly checkoutUrl: string | null;
  readonly statusExpiresAt: string;
  readonly replayed: boolean;
  readonly confirmation: Promise<PaymentsBrowserVerifiedPayment>;
}

export interface PaymentsBrowserCheckoutClientOptions {
  readonly fetchFn: typeof fetch;
  readonly authority: PaymentsBrowserCheckoutAuthorityPort;
  readonly popup: PaymentsBrowserCheckoutPopupPort;
  readonly signals: PaymentsBrowserCheckoutSignalPort;
  readonly scheduler?: PaymentsBrowserCheckoutSchedulerPort;
  readonly correlationId?: () => string;
  readonly pollIntervalMs?: number;
  readonly maxPollAttempts?: number;
}

interface CheckoutCreateProjection {
  readonly checkoutId: string;
  readonly paymentId: string;
  readonly status: string;
  readonly statusToken: string;
  readonly statusExpiresAt: string;
  readonly checkoutUrl: string | null;
  readonly replayed: boolean;
}

interface CheckoutStatusProjection {
  readonly checkoutId: string;
  readonly sessionId: string;
  readonly status: string;
  readonly verifiedPayment: PaymentsBrowserVerifiedPayment | null;
  readonly verifiedFailure: PaymentsBrowserVerifiedFailure | null;
}

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

function canonicalUrl(value: unknown): string | null {
  const candidate = text(value, 2_048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalTimestamp(value: unknown): string {
  const candidate = text(value, 80);
  if (!candidate) return "";
  const milliseconds = Date.parse(candidate);
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : "";
}

function safeCorrelationId(value: unknown): string {
  const candidate = text(value, 120);
  return correlationIdPattern.test(candidate) ? candidate : "";
}

function defaultCorrelationId(): string {
  if (
    typeof crypto === "undefined" ||
    typeof crypto.randomUUID !== "function"
  ) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_INVALID_CORRELATION_ID",
      "Não foi possível iniciar a contratação com segurança.",
    );
  }
  return `browser:${crypto.randomUUID()}`;
}

function defaultScheduler(): PaymentsBrowserCheckoutSchedulerPort {
  return Object.freeze({
    wait(milliseconds: number): Promise<void> {
      return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    },
  });
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  const candidate = value ?? fallback;
  if (
    !Number.isSafeInteger(candidate) ||
    candidate <= 0 ||
    candidate > maximum
  ) {
    throw new Error("PAYMENTS_BROWSER_POLL_CONFIGURATION_INVALID");
  }
  return candidate;
}

function normalizedAuthorityHeaders(
  input: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(input)) {
    const key = name.trim().toLowerCase();
    const value = text(
      rawValue,
      key === "x-checkout-handoff-token" ? 2_048 : 512,
    );
    if (!value) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_AUTHORITY",
        "A autorização da contratação é inválida.",
      );
    }
    if (
      key !== "x-checkout-handoff-token" &&
      key !== "x-csrf-token" &&
      key !== "x-business-id"
    ) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_AUTHORITY",
        "A autorização da contratação contém cabeçalhos não permitidos.",
      );
    }
    headers.set(key, value);
  }

  const handoffToken = headers.get("x-checkout-handoff-token");
  const csrf = headers.get("x-csrf-token");
  const businessId = headers.get("x-business-id");
  const guest = Boolean(handoffToken);
  const authenticated = Boolean(csrf && businessId);

  if (!guest && !authenticated) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_AUTHORITY_REQUIRED",
      "A contratação exige uma autorização válida.",
    );
  }
  if (guest && (csrf || businessId)) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_AUTHORITY_AMBIGUOUS",
      "A contratação recebeu autoridades incompatíveis.",
    );
  }
  if (!guest && Boolean(csrf) !== Boolean(businessId)) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_INVALID_AUTHORITY",
      "A autorização autenticada está incompleta.",
    );
  }

  const normalized: Record<string, string> = {};
  for (const name of [
    "x-checkout-handoff-token",
    "x-csrf-token",
    "x-business-id",
  ]) {
    const value = headers.get(name);
    if (value) normalized[name] = value;
  }
  return Object.freeze(normalized);
}

async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > maxResponseBytes) {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_RESPONSE_TOO_LARGE",
      "A resposta da contratação excedeu o limite permitido.",
    );
  }
  try {
    const parsed = JSON.parse(body) as unknown;
    const parsedRecord = record(parsed);
    if (!parsedRecord) throw new Error("not an object");
    return parsedRecord;
  } catch {
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_INVALID_RESPONSE",
      "A resposta da contratação é inválida.",
    );
  }
}

async function checkedJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const payload = await responseJson(response);
  if (!response.ok) {
    const code = text(payload.error, 120) || "CHECKOUT_REJECTED";
    throw new PaymentsBrowserCheckoutError(
      "PAYMENTS_BROWSER_CHECKOUT_REJECTED",
      `Não foi possível processar a contratação (${code}).`,
    );
  }
  return payload;
}

function createProjection(value: unknown): CheckoutCreateProjection | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (!data) return null;
  const checkoutId = text(data.checkoutId, 120);
  const paymentId = text(data.paymentId, 120);
  const status = text(data.status, 40);
  const statusToken = text(data.statusToken, 256);
  const statusExpiresAt = canonicalTimestamp(data.statusExpiresAt);
  const checkoutUrl =
    data.checkoutUrl === null ? null : canonicalUrl(data.checkoutUrl);
  const replayed = data.replayed === true;
  if (
    !checkoutId.startsWith("ord_") ||
    !paymentId.startsWith("pay_") ||
    !status ||
    !statusTokenPattern.test(statusToken) ||
    !statusExpiresAt ||
    (data.checkoutUrl !== null && !checkoutUrl)
  ) {
    return null;
  }
  return Object.freeze({
    checkoutId,
    paymentId,
    status,
    statusToken,
    statusExpiresAt,
    checkoutUrl,
    replayed,
  });
}

function verifiedPayment(
  value: unknown,
): PaymentsBrowserVerifiedPayment | null {
  const data = record(value);
  if (!data || data.verified !== true) return null;
  const sessionId = text(data.sessionId, 120);
  const reference = text(data.reference, 160);
  if (!sessionId || !reference) return null;
  return Object.freeze({
    verified: true,
    sessionId,
    reference,
    definitiveBusinessId: text(data.definitiveBusinessId, 160) || null,
    activationStatus: text(data.activationStatus, 80) || null,
  });
}

function verifiedFailure(
  value: unknown,
): PaymentsBrowserVerifiedFailure | null {
  const data = record(value);
  if (!data || data.verified !== true) return null;
  const sessionId = text(data.sessionId, 120);
  const reason = text(data.reason, 80);
  const resultId = text(data.resultId, 160);
  if (!sessionId || !reason || !resultId) return null;
  return Object.freeze({ verified: true, sessionId, reason, resultId });
}

function statusProjection(value: unknown): CheckoutStatusProjection | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (!data) return null;
  const checkoutId = text(data.checkoutId, 120);
  const sessionId = text(data.sessionId, 120);
  const status = text(data.status, 40);
  if (!checkoutId || !sessionId || !status) return null;
  return Object.freeze({
    checkoutId,
    sessionId,
    status,
    verifiedPayment: verifiedPayment(data.verifiedPayment),
    verifiedFailure: verifiedFailure(data.verifiedFailure),
  });
}

function paymentFailure(
  sessionId: string,
  code: PaymentsBrowserCheckoutErrorCode,
  message: string,
): PaymentsBrowserCheckoutError {
  return new PaymentsBrowserCheckoutError(code, message);
}

export function createPaymentsBrowserCheckoutClient(
  options: PaymentsBrowserCheckoutClientOptions,
) {
  const pollIntervalMs = positiveInteger(
    options.pollIntervalMs,
    PAYMENTS_BROWSER_POLL_INTERVAL_MS,
    60_000,
  );
  const maxPollAttempts = positiveInteger(
    options.maxPollAttempts,
    PAYMENTS_BROWSER_MAX_POLL_ATTEMPTS,
    2_000,
  );
  const scheduler = options.scheduler ?? defaultScheduler();
  const correlationIdFactory = options.correlationId ?? defaultCorrelationId;

  async function poll(
    checkout: CheckoutCreateProjection,
    handoff: ValidatedBusinessCheckoutHandoff,
    correlationId: string,
  ): Promise<PaymentsBrowserVerifiedPayment> {
    try {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await scheduler.wait(pollIntervalMs);
        const response = await options.fetchFn(
          `${checkoutApiPrefix}/${encodeURIComponent(checkout.checkoutId)}`,
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "X-Checkout-Token": checkout.statusToken,
              "X-Correlation-ID": correlationId,
            },
          },
        );
        const projection = statusProjection(await checkedJson(response));
        if (!projection) {
          throw paymentFailure(
            handoff.sessionId,
            "PAYMENTS_BROWSER_INVALID_RESPONSE",
            "A confirmação do pagamento retornou uma resposta inválida.",
          );
        }
        if (
          projection.checkoutId !== checkout.checkoutId ||
          projection.sessionId !== handoff.sessionId
        ) {
          throw paymentFailure(
            handoff.sessionId,
            "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH",
            "A confirmação do pagamento não corresponde a esta contratação.",
          );
        }

        if (projection.status === "CONFIRMED") {
          if (projection.verifiedFailure) {
            throw paymentFailure(
              handoff.sessionId,
              "PAYMENTS_BROWSER_INVALID_RESPONSE",
              "A confirmação do pagamento retornou evidências conflitantes.",
            );
          }
          if (!projection.verifiedPayment) continue;
          if (projection.verifiedPayment.sessionId !== handoff.sessionId) {
            throw paymentFailure(
              handoff.sessionId,
              "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH",
              "A confirmação do pagamento não corresponde a esta contratação.",
            );
          }
          await options.signals.verified(projection.verifiedPayment);
          return projection.verifiedPayment;
        }

        if (
          projection.status === "FAILED" ||
          projection.status === "CANCELLED" ||
          projection.status === "EXPIRED" ||
          projection.status === "REFUNDED"
        ) {
          if (projection.verifiedPayment) {
            throw paymentFailure(
              handoff.sessionId,
              "PAYMENTS_BROWSER_INVALID_RESPONSE",
              "A confirmação do pagamento retornou evidências conflitantes.",
            );
          }
          if (!projection.verifiedFailure) continue;
          if (projection.verifiedFailure.sessionId !== handoff.sessionId) {
            throw paymentFailure(
              handoff.sessionId,
              "PAYMENTS_BROWSER_STATUS_IDENTITY_MISMATCH",
              "A falha do pagamento não corresponde a esta contratação.",
            );
          }
          throw paymentFailure(
            handoff.sessionId,
            "PAYMENTS_BROWSER_PAYMENT_NOT_COMPLETED",
            "O pagamento não foi concluído.",
          );
        }

        if (projection.verifiedPayment || projection.verifiedFailure) {
          throw paymentFailure(
            handoff.sessionId,
            "PAYMENTS_BROWSER_INVALID_RESPONSE",
            "O estado do pagamento não corresponde à evidência verificada.",
          );
        }
      }

      throw paymentFailure(
        handoff.sessionId,
        "PAYMENTS_BROWSER_CONFIRMATION_TIMEOUT",
        "A confirmação do pagamento demorou mais do que o esperado.",
      );
    } catch (error) {
      const failure =
        error instanceof PaymentsBrowserCheckoutError
          ? error
          : paymentFailure(
              handoff.sessionId,
              "PAYMENTS_BROWSER_CHECKOUT_REJECTED",
              "Não foi possível confirmar o pagamento.",
            );
      await options.signals.failed({
        sessionId: handoff.sessionId,
        message: failure.message,
        code: failure.code,
      });
      throw failure;
    }
  }

  async function start(
    input: CheckoutApplicationRequest,
  ): Promise<PaymentsBrowserCheckoutSession> {
    const handoff = normalizeBusinessCheckoutHandoff(input);
    if (!handoff) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_HANDOFF",
        "Os dados da contratação são inválidos.",
      );
    }
    const idempotencyKey = createBusinessOrderRequestKey(
      handoff.sessionId,
      handoff.planId,
    );
    if (!idempotencyKey) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_HANDOFF",
        "Os dados da contratação são inválidos.",
      );
    }
    const correlationId = safeCorrelationId(correlationIdFactory());
    if (!correlationId) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_CORRELATION_ID",
        "Não foi possível iniciar a contratação com segurança.",
      );
    }
    const authority = normalizedAuthorityHeaders(
      await options.authority.resolveCreateHeaders(handoff),
    );
    const headers = new Headers(authority);
    headers.set("Accept", "application/json");
    headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", idempotencyKey);
    headers.set("X-Correlation-ID", correlationId);

    const response = await options.fetchFn(checkoutApiPrefix, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body: JSON.stringify(handoff),
    });
    const checkout = createProjection(await checkedJson(response));
    if (!checkout) {
      throw new PaymentsBrowserCheckoutError(
        "PAYMENTS_BROWSER_INVALID_RESPONSE",
        "A resposta de criação da contratação é inválida.",
      );
    }

    if (checkout.checkoutUrl) {
      const popup = options.popup.open(
        checkout.checkoutUrl,
        "morro-digital-checkout",
        "noopener,noreferrer",
      );
      if (popup === null) options.popup.assign(checkout.checkoutUrl);
    }

    const confirmation = poll(checkout, handoff, correlationId);
    return Object.freeze({
      checkoutId: checkout.checkoutId,
      paymentId: checkout.paymentId,
      status: checkout.status,
      checkoutUrl: checkout.checkoutUrl,
      statusExpiresAt: checkout.statusExpiresAt,
      replayed: checkout.replayed,
      confirmation,
    });
  }

  return Object.freeze({ start });
}

export function createWindowPaymentsBrowserCheckoutSignals(
  view: Window,
): PaymentsBrowserCheckoutSignalPort {
  return Object.freeze({
    verified(detail: PaymentsBrowserVerifiedPayment): void {
      view.dispatchEvent(
        new CustomEvent("businessPaymentVerified", { detail }),
      );
    },
    failed(detail: PaymentsBrowserCheckoutFailure): void {
      view.dispatchEvent(
        new CustomEvent("businessPaymentVerificationFailed", { detail }),
      );
    },
  });
}
