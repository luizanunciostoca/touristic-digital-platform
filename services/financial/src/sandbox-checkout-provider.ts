import {
  createCheckoutProviderRequest,
  normalizeCheckoutProviderSession,
  type CheckoutProviderRequest,
  type CheckoutProviderSession,
  type FinancialCheckoutProviderPort,
} from "@touristic/financial";

export type SandboxCheckoutProviderErrorCode =
  | "SANDBOX_PROVIDER_INVALID_REQUEST"
  | "SANDBOX_PROVIDER_REJECTED"
  | "SANDBOX_PROVIDER_UNAVAILABLE"
  | "SANDBOX_PROVIDER_INVALID_RESPONSE";

export class SandboxCheckoutProviderError extends Error {
  readonly code: SandboxCheckoutProviderErrorCode;

  constructor(code: SandboxCheckoutProviderErrorCode) {
    super(code);
    this.name = "SandboxCheckoutProviderError";
    this.code = code;
  }
}

export interface SandboxCheckoutProviderEnvironment {
  readonly NODE_ENV?: string;
  readonly PAYMENTS_PROVIDER_MODE?: string;
  readonly PAYMENTS_SANDBOX_PROVIDER_BASE_URL?: string;
  readonly PAYMENTS_SANDBOX_PROVIDER_API_TOKEN?: string;
  readonly PAYMENTS_SANDBOX_CHECKOUT_ORIGINS?: string;
  readonly PAYMENTS_PROVIDER_TIMEOUT_MS?: string;
}

export interface SandboxCheckoutProviderOptions {
  readonly fetch?: typeof fetch;
}

const maxResponseBytes = 64 * 1024;

function boundedValue(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function configuredUrl(
  value: unknown,
  production: boolean,
  originOnly: boolean,
): URL | null {
  const normalized = boundedValue(value, 2_048);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      (production && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (originOnly && url.pathname !== "/")
    ) {
      return null;
    }
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch {
    return null;
  }
}

function configuredOrigins(
  value: unknown,
  production: boolean,
): ReadonlySet<string> {
  const raw = boundedValue(value, 4_096);
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0 || entries.length > 20) {
    throw new Error("PAYMENTS_SANDBOX_CHECKOUT_ORIGINS is required");
  }
  const origins = new Set<string>();
  for (const entry of entries) {
    const url = configuredUrl(entry, production, true);
    if (!url) {
      throw new Error("PAYMENTS_SANDBOX_CHECKOUT_ORIGINS is invalid");
    }
    origins.add(url.origin);
  }
  return origins;
}

function configuredTimeout(value: unknown): number {
  const raw = boundedValue(value, 10);
  if (!raw) return 8_000;
  if (!/^[0-9]+$/u.test(raw)) {
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  }
  const timeout = Number(raw);
  if (!Number.isSafeInteger(timeout) || timeout < 500 || timeout > 15_000) {
    throw new Error("PAYMENTS_PROVIDER_TIMEOUT_MS is invalid");
  }
  return timeout;
}

async function responseJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE");
  }
  if (!response.body) {
    throw new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxResponseBytes) {
        await reader.cancel();
        throw new SandboxCheckoutProviderError(
          "SANDBOX_PROVIDER_INVALID_RESPONSE",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SandboxCheckoutProviderError("SANDBOX_PROVIDER_INVALID_RESPONSE");
  }
}

function providerBody(request: CheckoutProviderRequest) {
  return Object.freeze({
    version: 1,
    externalReference: request.paymentId,
    amount: request.amount,
    description: request.description,
    returnUrl: request.returnUrl,
    webhookUrl: request.webhookUrl,
    customer: request.customer,
    metadata: request.metadata,
  });
}

export function createSandboxCheckoutProviderFromEnvironment(
  environment: SandboxCheckoutProviderEnvironment,
  options: SandboxCheckoutProviderOptions = {},
): FinancialCheckoutProviderPort {
  const production = environment.NODE_ENV === "production";
  if (environment.PAYMENTS_PROVIDER_MODE !== "sandbox") {
    throw new Error("PAYMENTS_PROVIDER_MODE=sandbox is required");
  }
  const baseUrl = configuredUrl(
    environment.PAYMENTS_SANDBOX_PROVIDER_BASE_URL,
    production,
    false,
  );
  if (!baseUrl) {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_BASE_URL is required");
  }
  const token = boundedValue(
    environment.PAYMENTS_SANDBOX_PROVIDER_API_TOKEN,
    1_024,
  );
  if (token.length < 32) {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_API_TOKEN is required");
  }
  const checkoutOrigins = configuredOrigins(
    environment.PAYMENTS_SANDBOX_CHECKOUT_ORIGINS,
    production,
  );
  const timeoutMs = configuredTimeout(environment.PAYMENTS_PROVIDER_TIMEOUT_MS);
  const fetchProvider = options.fetch ?? globalThis.fetch;
  if (typeof fetchProvider !== "function") {
    throw new Error("PAYMENTS_SANDBOX_PROVIDER_FETCH_UNAVAILABLE");
  }
  const endpoint = new URL("v1/checkouts", baseUrl);

  return Object.freeze({
    async createCheckout(
      input: CheckoutProviderRequest,
    ): Promise<CheckoutProviderSession> {
      const request = createCheckoutProviderRequest(input);
      if (!request) {
        throw new SandboxCheckoutProviderError(
          "SANDBOX_PROVIDER_INVALID_REQUEST",
        );
      }

      try {
        const response = await fetchProvider(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
            "Idempotency-Key": request.idempotencyKey,
            "X-Touristic-Provider-Mode": "sandbox",
          },
          body: JSON.stringify(providerBody(request)),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) {
          throw new SandboxCheckoutProviderError(
            response.status >= 400 && response.status < 500
              ? "SANDBOX_PROVIDER_REJECTED"
              : "SANDBOX_PROVIDER_UNAVAILABLE",
          );
        }
        const payload = (await responseJson(response)) as Record<
          string,
          unknown
        >;
        const session =
          payload?.version === 1
            ? normalizeCheckoutProviderSession({
                providerCheckoutId: payload.checkoutId,
                checkoutUrl: payload.checkoutUrl,
                providerReference:
                  payload.paymentReference === undefined
                    ? null
                    : payload.paymentReference,
              })
            : null;
        if (!session) {
          throw new SandboxCheckoutProviderError(
            "SANDBOX_PROVIDER_INVALID_RESPONSE",
          );
        }
        const checkoutUrl = new URL(session.checkoutUrl);
        if (
          (production && checkoutUrl.protocol !== "https:") ||
          !checkoutOrigins.has(checkoutUrl.origin)
        ) {
          throw new SandboxCheckoutProviderError(
            "SANDBOX_PROVIDER_INVALID_RESPONSE",
          );
        }
        return session;
      } catch (error) {
        if (error instanceof SandboxCheckoutProviderError) throw error;
        throw new SandboxCheckoutProviderError("SANDBOX_PROVIDER_UNAVAILABLE");
      }
    },
  });
}
