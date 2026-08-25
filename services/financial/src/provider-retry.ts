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
  const idempotencyKey = new Headers(init.headers)
    .get("Idempotency-Key")
    ?.trim();
  return Boolean(idempotencyKey && idempotencyKey.length <= 220);
}

function transientStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
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

    const transientMetadata = {
      providerRequestId: response.headers.get("x-request-id"),
      retryAfter: response.headers.get("retry-after"),
      contentType: response.headers.get("content-type"),
    };
    await discardResponse(response);
    if (attempt >= attempts) {
      throw new ProviderRequestUnavailableError(
        response.status,
        transientMetadata,
      );
    }
    const delay = retryDelayMs(input.policy.baseDelayMs, attempt, random);
    if (delay > 0) await sleep(delay);
  }

  throw new ProviderRequestUnavailableError();
}
