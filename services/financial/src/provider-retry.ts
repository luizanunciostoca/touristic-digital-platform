export interface ProviderRetryEnvironment {
  readonly PAYMENTS_PROVIDER_MAX_ATTEMPTS?: string;
  readonly PAYMENTS_PROVIDER_RETRY_BASE_MS?: string;
}

export interface ProviderRetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export interface ProviderRetryRuntime {
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly random?: () => number;
}

export interface ProviderUnavailableResponseMetadata {
  readonly providerRequestId?: string | null;
  readonly retryAfter?: string | null;
  readonly contentType?: string | null;
  readonly providerErrorCode?: string | null;
  readonly providerBodyStatus?: number | null;
  readonly providerCauseCodes?: readonly string[] | null;
}

function containsDisallowedControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function boundedResponseMetadataValue(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    containsDisallowedControlCharacter(normalized)
  ) {
    return null;
  }
  return normalized;
}

export class ProviderRequestUnavailableError extends Error {
  readonly httpStatus: number | null;
  readonly providerRequestId: string | null;
  readonly retryAfter: string | null;
  readonly contentType: string | null;
  readonly providerErrorCode: string | null;
  readonly providerBodyStatus: number | null;
  readonly providerCauseCodes: readonly string[];

  constructor(
    httpStatus?: number,
    metadata: ProviderUnavailableResponseMetadata = {},
  ) {
    super("PROVIDER_REQUEST_UNAVAILABLE");
    this.name = "ProviderRequestUnavailableError";
    this.httpStatus =
      typeof httpStatus === "number" &&
      Number.isInteger(httpStatus) &&
      httpStatus >= 100 &&
      httpStatus <= 599
        ? httpStatus
        : null;
    this.providerRequestId = boundedResponseMetadataValue(
      metadata.providerRequestId,
      120,
    );
    this.retryAfter = boundedResponseMetadataValue(metadata.retryAfter, 120);
    this.contentType = boundedResponseMetadataValue(metadata.contentType, 120);
    this.providerErrorCode = boundedProviderErrorCode(
      metadata.providerErrorCode,
    );
    this.providerBodyStatus =
      typeof metadata.providerBodyStatus === "number" &&
      Number.isInteger(metadata.providerBodyStatus) &&
      metadata.providerBodyStatus >= 100 &&
      metadata.providerBodyStatus <= 599
        ? metadata.providerBodyStatus
        : null;
    this.providerCauseCodes = Object.freeze(
      (metadata.providerCauseCodes ?? [])
        .map((value) => boundedProviderErrorCode(value))
        .filter((value): value is string => value !== null)
        .slice(0, 5),
    );
  }
}

const safeProviderErrorCode = /^[A-Za-z0-9_.:-]{1,80}$/u;

function boundedProviderErrorCode(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : boundedResponseMetadataValue(
          typeof value === "string" ? value : null,
          80,
        );
  return normalized && safeProviderErrorCode.test(normalized)
    ? normalized
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function boundedResponseText(
  response: Response,
  maxBytes = 8 * 1024,
): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export async function readProviderResponseMetadata(
  response: Response,
): Promise<ProviderUnavailableResponseMetadata> {
  const contentType = boundedResponseMetadataValue(
    response.headers.get("content-type"),
    120,
  );
  const base: ProviderUnavailableResponseMetadata = {
    providerRequestId: response.headers.get("x-request-id"),
    retryAfter: response.headers.get("retry-after"),
    contentType,
  };
  if (!contentType?.toLowerCase().includes("application/json")) return base;
  try {
    const raw = await boundedResponseText(response.clone());
    if (!raw) return base;
    const payload = record(JSON.parse(raw));
    if (!payload) return base;
    const cause = Array.isArray(payload.cause) ? payload.cause.slice(0, 5) : [];
    const providerCauseCodes = cause
      .map((item) => boundedProviderErrorCode(record(item)?.code))
      .filter((value): value is string => value !== null);
    return {
      ...base,
      providerErrorCode:
        boundedProviderErrorCode(payload.error) ??
        boundedProviderErrorCode(payload.message),
      providerBodyStatus:
        typeof payload.status === "number" && Number.isInteger(payload.status)
          ? payload.status
          : null,
      providerCauseCodes,
    };
  } catch {
    return base;
  }
}

function boundedInteger(
  value: unknown,
  options: {
    readonly fallback: number;
    readonly minimum: number;
    readonly maximum: number;
    readonly name: string;
  },
): number {
  if (value === undefined || value === null || value === "") {
    return options.fallback;
  }
  if (typeof value !== "string" || !/^[0-9]+$/u.test(value.trim())) {
    throw new Error(`${options.name} is invalid`);
  }
  const parsed = Number(value.trim());
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < options.minimum ||
    parsed > options.maximum
  ) {
    throw new Error(`${options.name} is invalid`);
  }
  return parsed;
}

export function createProviderRetryPolicyFromEnvironment(
  environment: ProviderRetryEnvironment,
): ProviderRetryPolicy {
  return Object.freeze({
    maxAttempts: boundedInteger(environment.PAYMENTS_PROVIDER_MAX_ATTEMPTS, {
      fallback: 2,
      minimum: 1,
      maximum: 2,
      name: "PAYMENTS_PROVIDER_MAX_ATTEMPTS",
    }),
    baseDelayMs: boundedInteger(environment.PAYMENTS_PROVIDER_RETRY_BASE_MS, {
      fallback: 100,
      minimum: 0,
      maximum: 1_000,
      name: "PAYMENTS_PROVIDER_RETRY_BASE_MS",
    }),
  });
}

function retryAuthorized(init: RequestInit): boolean {
  const method = (init.method ?? "GET").trim().toUpperCase();
  if (method === "GET" || method === "HEAD") return true;
  if (!new Set(["POST", "PUT", "PATCH", "DELETE"]).has(method)) return false;
  const headers = new Headers(init.headers);
  const idempotencyKey = (
    headers.get("X-Idempotency-Key") ?? headers.get("Idempotency-Key")
  )?.trim();
  return Boolean(idempotencyKey && idempotencyKey.length <= 220);
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

const maxProviderRetryAfterMs = 30_000;

type RetryAfterDecision =
  | Readonly<{ kind: "absent_or_invalid" }>
  | Readonly<{ kind: "delay"; delayMs: number }>
  | Readonly<{ kind: "exceeds_bound" }>;

function retryAfterDecision(value: string | null): RetryAfterDecision {
  if (typeof value !== "string") return { kind: "absent_or_invalid" };
  const normalized = value.trim();
  if (!/^[0-9]{1,6}$/u.test(normalized)) {
    return { kind: "absent_or_invalid" };
  }
  const seconds = Number(normalized);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    return { kind: "absent_or_invalid" };
  }
  const delayMs = seconds * 1_000;
  return delayMs <= maxProviderRetryAfterMs
    ? { kind: "delay", delayMs }
    : { kind: "exceeds_bound" };
}

function retryDelayMs(
  baseDelayMs: number,
  failedAttempt: number,
  random: () => number,
): number {
  if (baseDelayMs === 0) return 0;
  const exponential = Math.min(baseDelayMs * 2 ** (failedAttempt - 1), 1_000);
  const jitter = 0.5 + Math.min(Math.max(random(), 0), 1) * 0.5;
  return Math.floor(exponential * jitter);
}

async function discardResponse(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best effort only: the failed response must never prevent bounded retry.
  }
}

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export async function executeBoundedProviderRequest(input: {
  readonly fetch: typeof fetch;
  readonly url: URL;
  readonly init: RequestInit;
  readonly timeoutMs: number;
  readonly policy: ProviderRetryPolicy;
  readonly runtime?: ProviderRetryRuntime;
}): Promise<Response> {
  const attempts = retryAuthorized(input.init) ? input.policy.maxAttempts : 1;
  const sleep = input.runtime?.sleep ?? defaultSleep;
  const random = input.runtime?.random ?? Math.random;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response: Response;
    try {
      response = await input.fetch(input.url, {
        ...input.init,
        redirect: "error",
        signal: AbortSignal.timeout(input.timeoutMs),
      });
    } catch {
      if (attempt >= attempts) throw new ProviderRequestUnavailableError();
      const delay = retryDelayMs(input.policy.baseDelayMs, attempt, random);
      if (delay > 0) await sleep(delay);
      continue;
    }

    if (!transientStatus(response.status)) return response;

    if (attempt >= attempts) {
      const responseMetadata = await readProviderResponseMetadata(response);
      await discardResponse(response);
      throw new ProviderRequestUnavailableError(
        response.status,
        responseMetadata,
      );
    }

    const localDelay = retryDelayMs(
      input.policy.baseDelayMs,
      attempt,
      random,
    );
    const retryAfter = retryAfterDecision(response.headers.get("retry-after"));
    if (retryAfter.kind === "exceeds_bound") {
      const responseMetadata = await readProviderResponseMetadata(response);
      await discardResponse(response);
      throw new ProviderRequestUnavailableError(
        response.status,
        responseMetadata,
      );
    }
    await discardResponse(response);
    const delay =
      retryAfter.kind === "delay"
        ? Math.max(localDelay, retryAfter.delayMs)
        : localDelay;
    if (delay > 0) await sleep(delay);
  }

  throw new ProviderRequestUnavailableError();
}
