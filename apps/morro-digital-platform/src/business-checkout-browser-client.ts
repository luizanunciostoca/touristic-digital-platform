import {
  createBusinessOrderRequestKey,
  normalizeBusinessCheckoutHandoff,
  normalizeOrderId,
  type CheckoutApplicationRequest,
  type ValidatedBusinessCheckoutHandoff,
} from "@touristic/ordering";

export interface BusinessCheckoutBrowserClientOptions {
  readonly fetchFn: typeof fetch;
  readonly authenticatedFetchFn?: typeof fetch;
  readonly openCheckout?: (url: string) => unknown | null;
  readonly navigate?: (url: string) => void;
  readonly dispatch?: (
    name: string,
    detail: Readonly<Record<string, unknown>>,
  ) => void;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPollAttempts?: number;
  readonly maxResponseBytes?: number;
}

export interface BusinessCheckoutBrowserClient {
  readonly setGuestCapability: (value: unknown) => boolean;
  readonly clearGuestCapability: () => void;
  readonly cancel: () => void;
  readonly start: (handoff: CheckoutApplicationRequest) => Promise<boolean>;
}

interface CheckoutLaunch {
  readonly orderId: string;
  readonly statusToken: string;
  readonly checkoutUrl: string;
}

const checkoutEndpoint = "/api/payments/v1/checkouts";
const defaultPollIntervalMs = 2_500;
const defaultMaxPollAttempts = 240;
const defaultMaxResponseBytes = 64 * 1024;
const terminalFailureStatuses = new Set([
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return "";
  const forbidden = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });
  return forbidden ? "" : normalized;
}

function boundedCapability(value: unknown): string {
  return boundedText(value, 2_048);
}

function safeCheckoutUrl(value: unknown): string {
  const normalized = boundedText(value, 2_048);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function configuredInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const resolved = value ?? fallback;
  if (
    !Number.isSafeInteger(resolved) ||
    resolved < minimum ||
    resolved > maximum
  ) {
    throw new Error("PAYMENTS_BROWSER_CONFIGURATION_INVALID");
  }
  return resolved;
}

async function readBoundedJson(
  response: Response,
  maxResponseBytes: number,
): Promise<Record<string, unknown>> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    throw new Error("PAYMENTS_BROWSER_RESPONSE_TOO_LARGE");
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxResponseBytes) {
    throw new Error("PAYMENTS_BROWSER_RESPONSE_TOO_LARGE");
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) throw new Error("INVALID");
    return parsed;
  } catch {
    throw new Error("PAYMENTS_BROWSER_INVALID_RESPONSE");
  }
}

function responseData(body: Record<string, unknown>): Record<string, unknown> {
  return isRecord(body.data) ? body.data : {};
}

function normalizeLaunch(body: Record<string, unknown>): CheckoutLaunch | null {
  const data = responseData(body);
  const orderId = normalizeOrderId(data.checkoutId);
  const statusToken = boundedText(data.statusToken, 256);
  const checkoutUrl = safeCheckoutUrl(data.checkoutUrl);
  const expiresAt = boundedText(data.statusExpiresAt, 40);
  if (
    !orderId ||
    !statusToken.startsWith("cst_v1_") ||
    !checkoutUrl ||
    !expiresAt ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    return null;
  }
  return Object.freeze({ orderId, statusToken, checkoutUrl });
}

function verifiedPaymentDetail(
  value: unknown,
  expectedSessionId: string,
): Readonly<Record<string, unknown>> | null {
  if (!isRecord(value) || value.verified !== true) return null;
  const sessionId = boundedText(value.sessionId, 120);
  const reference = boundedText(value.reference, 160);
  const activationStatus =
    value.activationStatus === null || value.activationStatus === undefined
      ? null
      : boundedText(value.activationStatus, 80);
  const definitiveBusinessId =
    value.definitiveBusinessId === null ||
    value.definitiveBusinessId === undefined
      ? null
      : boundedText(value.definitiveBusinessId, 160);
  if (
    sessionId !== expectedSessionId ||
    !reference ||
    (activationStatus !== null && activationStatus !== "READY_TO_CONVERT") ||
    (value.definitiveBusinessId !== null &&
      value.definitiveBusinessId !== undefined &&
      !definitiveBusinessId)
  ) {
    return null;
  }
  return Object.freeze({
    verified: true,
    sessionId,
    reference,
    definitiveBusinessId,
    activationStatus: activationStatus ?? "READY_TO_CONVERT",
  });
}

function verifiedFailureReason(
  value: unknown,
  expectedSessionId: string,
): string {
  if (!isRecord(value) || value.verified !== true) return "";
  if (boundedText(value.sessionId, 120) !== expectedSessionId) return "";
  return boundedText(value.reason, 80);
}

function failureMessage(reason: string): string {
  if (reason === "cancelled" || reason === "CANCELLED") {
    return "O pagamento foi cancelado.";
  }
  if (reason === "expired" || reason === "EXPIRED") {
    return "O pagamento expirou antes da confirmação.";
  }
  if (reason === "refunded" || reason === "REFUNDED") {
    return "O pagamento foi estornado e não pode ativar a empresa.";
  }
  if (reason === "timeout") {
    return "A confirmação do pagamento não chegou dentro do tempo esperado.";
  }
  return "O pagamento não foi confirmado.";
}

export function createBusinessCheckoutBrowserClient(
  options: BusinessCheckoutBrowserClientOptions,
): BusinessCheckoutBrowserClient {
  const pollIntervalMs = configuredInteger(
    options.pollIntervalMs,
    defaultPollIntervalMs,
    10,
    60_000,
  );
  const maxPollAttempts = configuredInteger(
    options.maxPollAttempts,
    defaultMaxPollAttempts,
    1,
    1_000,
  );
  const maxResponseBytes = configuredInteger(
    options.maxResponseBytes,
    defaultMaxResponseBytes,
    1_024,
    256 * 1_024,
  );
  const openCheckout = options.openCheckout ?? (() => null);
  const navigate = options.navigate ?? (() => undefined);
  const dispatch = options.dispatch ?? (() => undefined);
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let guestCapability = "";
  let generation = 0;

  function fail(sessionId: string, reason: string, run: number): false {
    if (run !== generation) return false;
    dispatch("businessPaymentVerificationFailed", {
      sessionId,
      message: failureMessage(reason),
    });
    return false;
  }

  async function createCheckout(
    handoff: ValidatedBusinessCheckoutHandoff,
  ): Promise<CheckoutLaunch> {
    const idempotencyKey = createBusinessOrderRequestKey(
      handoff.sessionId,
      handoff.planId,
    );
    if (!idempotencyKey) throw new Error("PAYMENTS_BROWSER_IDEMPOTENCY_INVALID");
    const capability = guestCapability;
    guestCapability = "";
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    });
    if (capability) headers.set("X-Checkout-Handoff-Token", capability);
    const request: RequestInit = {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body: JSON.stringify(handoff),
    };
    const transport = capability
      ? options.fetchFn
      : (options.authenticatedFetchFn ?? options.fetchFn);
    const response = await transport(checkoutEndpoint, request);
    const body = await readBoundedJson(response, maxResponseBytes);
    if (!response.ok) {
      const error = boundedText(body.error, 80) || `HTTP_${response.status}`;
      throw new Error(error);
    }
    const launch = normalizeLaunch(body);
    if (!launch) throw new Error("PAYMENTS_BROWSER_INVALID_CHECKOUT");
    return launch;
  }

  async function poll(
    handoff: ValidatedBusinessCheckoutHandoff,
    launch: CheckoutLaunch,
    run: number,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
      if (run !== generation) return false;
      if (attempt > 0) await sleep(pollIntervalMs);
      if (run !== generation) return false;
      const response = await options.fetchFn(
        `${checkoutEndpoint}/${encodeURIComponent(launch.orderId)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "X-Checkout-Token": launch.statusToken,
          },
        },
      );
      const body = await readBoundedJson(response, maxResponseBytes);
      if (!response.ok) {
        if (response.status === 429) continue;
        return fail(handoff.sessionId, "status_unavailable", run);
      }
      const data = responseData(body);
      const verified = verifiedPaymentDetail(
        data.verifiedPayment,
        handoff.sessionId,
      );
      if (verified) {
        if (run !== generation) return false;
        dispatch("businessPaymentVerified", verified);
        return true;
      }
      const verifiedFailure = verifiedFailureReason(
        data.verifiedFailure,
        handoff.sessionId,
      );
      if (verifiedFailure) {
        return fail(handoff.sessionId, verifiedFailure, run);
      }
      const status = boundedText(data.status, 40).toUpperCase();
      if (terminalFailureStatuses.has(status)) {
        return fail(handoff.sessionId, status, run);
      }
      // A bare CONFIRMED status is not Business authority. Wait for the
      // persisted verifiedPayment projection instead of synthesizing success.
    }
    return fail(handoff.sessionId, "timeout", run);
  }

  async function start(input: CheckoutApplicationRequest): Promise<boolean> {
    const run = ++generation;
    const handoff = normalizeBusinessCheckoutHandoff(input);
    if (!handoff) return fail("unknown", "invalid_handoff", run);
    try {
      const launch = await createCheckout(handoff);
      if (run !== generation) return false;
      const popup = openCheckout(launch.checkoutUrl);
      dispatch("businessCheckoutLaunched", {
        sessionId: handoff.sessionId,
        popupOpened: popup !== null,
      });
      if (popup === null) {
        navigate(launch.checkoutUrl);
        return true;
      }
      return await poll(handoff, launch, run);
    } catch {
      return fail(handoff.sessionId, "client_failure", run);
    }
  }

  return Object.freeze({
    setGuestCapability(value: unknown): boolean {
      const capability = boundedCapability(value);
      if (!capability) return false;
      guestCapability = capability;
      return true;
    },
    clearGuestCapability(): void {
      guestCapability = "";
    },
    cancel(): void {
      generation += 1;
      guestCapability = "";
    },
    start,
  });
}
