export type RouteCoordinate = readonly [longitude: number, latitude: number];

export type RoutingProfile = "foot-walking";
export type RoutingLanguage = "pt" | "en" | "es" | "he";

export interface RoutingRequestPayload {
  readonly coordinates: readonly [RouteCoordinate, RouteCoordinate];
  readonly profile: RoutingProfile;
  readonly language: RoutingLanguage;
  readonly instructions: true;
}

export interface RouteGeometry {
  readonly type: "LineString";
  readonly coordinates: readonly RouteCoordinate[];
}

export interface RouteFeature {
  readonly geometry: RouteGeometry;
  readonly properties?: Readonly<Record<string, unknown>>;
}

export interface RouteFeatureCollection {
  readonly type?: string;
  readonly features: readonly RouteFeature[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface RoutingProviderContext {
  readonly signal: AbortSignal;
}

export interface RoutingProvider {
  request(
    payload: RoutingRequestPayload,
    context: RoutingProviderContext,
  ): Promise<RouteFeatureCollection>;
}

export interface RouteRequestInput {
  readonly start?: unknown;
  readonly end?: unknown;
  readonly profile?: string;
  readonly language?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | null;
  readonly primaryProvider?: RoutingProvider;
  readonly fallbackProvider?: RoutingProvider | null;
  readonly allowFallback?: boolean;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
    readonly credentials: "same-origin";
    readonly cache: "no-store";
  },
) => Promise<FetchResponseLike>;

export class RoutingError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause: unknown;

  constructor(
    code: string,
    message: string,
    options: { readonly status?: number; readonly cause?: unknown } = {},
  ) {
    super(message);
    this.name = "RoutingError";
    this.code = code;
    this.status = options.status ?? 0;
    this.cause = options.cause ?? null;
  }
}

const ROUTING_ENDPOINT = "/api/routing/directions";
const ALLOWED_PROFILES = new Set<RoutingProfile>(["foot-walking"]);
const ALLOWED_LANGUAGES = new Set<RoutingLanguage>(["pt", "en", "es", "he"]);
const FALLBACK_STATUSES = new Set([404, 405, 501]);

const defaultFetch: FetchLike = async (input, init) => globalThis.fetch(input, init);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorName(error: unknown): string {
  return isRecord(error) && typeof error.name === "string" ? error.name : "";
}

function normalizeTimeout(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) return 12_000;
  return Math.max(1_000, Math.min(30_000, Number(timeoutMs)));
}

function createNamedError(name: "AbortError" | "TimeoutError", message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export function normalizeCoordinatePair(
  value: unknown,
): RouteCoordinate | null {
  if (!Array.isArray(value) || value.length !== 2) return null;

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return null;
  }

  return [longitude, latitude];
}

export function normalizeRouteRequest(
  input: Pick<RouteRequestInput, "start" | "end" | "profile" | "language"> = {},
): RoutingRequestPayload {
  const start = normalizeCoordinatePair(input.start);
  const end = normalizeCoordinatePair(input.end);
  if (!start || !end) {
    throw new RoutingError(
      "INVALID_COORDINATES",
      "Coordenadas de rota inválidas.",
    );
  }

  const profile = ALLOWED_PROFILES.has(input.profile as RoutingProfile)
    ? (input.profile as RoutingProfile)
    : "foot-walking";
  const language = ALLOWED_LANGUAGES.has(input.language as RoutingLanguage)
    ? (input.language as RoutingLanguage)
    : "pt";

  return {
    coordinates: [start, end],
    profile,
    language,
    instructions: true,
  };
}

export function isValidRouteFeatureCollection(
  value: unknown,
): value is RouteFeatureCollection {
  if (!isRecord(value) || !Array.isArray(value.features)) return false;
  const features: unknown[] = value.features;
  const feature: unknown = features[0];
  if (!isRecord(feature) || !isRecord(feature.geometry)) return false;
  if (feature.geometry.type !== "LineString") return false;
  return (
    Array.isArray(feature.geometry.coordinates) &&
    feature.geometry.coordinates.length >= 2
  );
}

function createLinkedAbortController(
  externalSignal: AbortSignal | null | undefined,
  timeoutMs: number | undefined,
) {
  const controller = new AbortController();
  const abortFromExternal = () => {
    controller.abort(createNamedError("AbortError", "Routing request cancelled"));
  };

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, {
      once: true,
    });
  }

  const timeoutId = setTimeout(() => {
    controller.abort(createNamedError("TimeoutError", "Routing request timed out"));
  }, normalizeTimeout(timeoutMs));

  return {
    controller,
    cleanup() {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

function ensureSameOriginEndpoint(endpoint: string): string {
  const normalized = endpoint.trim();
  if (
    !normalized.startsWith("/") ||
    normalized.startsWith("//") ||
    normalized.includes("://")
  ) {
    throw new RoutingError(
      "INVALID_ROUTING_ENDPOINT",
      "O endpoint primário de rotas deve ser same-origin.",
    );
  }
  return normalized;
}

export function createSameOriginRoutingProvider(
  options: {
    readonly fetchImpl?: FetchLike;
    readonly endpoint?: string;
  } = {},
): RoutingProvider {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const endpoint = ensureSameOriginEndpoint(options.endpoint ?? ROUTING_ENDPOINT);

  return {
    async request(payload, context) {
      let response: FetchResponseLike;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: context.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch (error) {
        const name = errorName(error);
        if (name === "AbortError" || name === "TimeoutError") throw error;
        throw new RoutingError(
          "ROUTING_PROXY_UNAVAILABLE",
          "O servidor de rotas próprio não está disponível.",
          { cause: error },
        );
      }

      const body: unknown = await response.json().catch((): null => null);
      if (!response.ok) {
        const errorCode =
          isRecord(body) && typeof body.error === "string"
            ? body.error
            : "ROUTING_HTTP_ERROR";
        const message =
          isRecord(body) && typeof body.message === "string"
            ? body.message
            : "Não foi possível calcular a rota.";
        throw new RoutingError(errorCode, message, { status: response.status });
      }

      if (!isValidRouteFeatureCollection(body)) {
        throw new RoutingError(
          "INVALID_ROUTE_RESPONSE",
          "A resposta do servidor de rotas é inválida.",
          { status: response.status },
        );
      }

      return body;
    },
  };
}

export function shouldUseRoutingFallback(error: unknown): boolean {
  return (
    error instanceof RoutingError &&
    (error.code === "ROUTING_PROXY_UNAVAILABLE" ||
      error.code === "INVALID_ROUTE_RESPONSE" ||
      FALLBACK_STATUSES.has(error.status))
  );
}

export async function requestRoute(
  input: RouteRequestInput,
): Promise<RouteFeatureCollection> {
  const payload = normalizeRouteRequest(input);
  const primaryProvider = input.primaryProvider ?? createSameOriginRoutingProvider();
  const linked = createLinkedAbortController(input.signal, input.timeoutMs);

  try {
    try {
      return await primaryProvider.request(payload, {
        signal: linked.controller.signal,
      });
    } catch (primaryError) {
      if (
        input.allowFallback === false ||
        !input.fallbackProvider ||
        !shouldUseRoutingFallback(primaryError)
      ) {
        throw primaryError;
      }

      return await input.fallbackProvider.request(payload, {
        signal: linked.controller.signal,
      });
    }
  } catch (error) {
    if (error instanceof RoutingError) throw error;

    const name = errorName(error);
    const timedOut =
      name === "TimeoutError" ||
      (name === "AbortError" && input.signal?.aborted !== true);
    const cancelled = name === "AbortError" || input.signal?.aborted === true;

    throw new RoutingError(
      timedOut
        ? "ROUTING_TIMEOUT"
        : cancelled
          ? "ROUTING_CANCELLED"
          : "ROUTING_NETWORK_ERROR",
      timedOut
        ? "Tempo excedido ao calcular a rota."
        : cancelled
          ? "Cálculo da rota cancelado."
          : "Falha de conexão ao calcular a rota.",
      { cause: error },
    );
  } finally {
    linked.cleanup();
  }
}
