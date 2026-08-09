export type MapboxRoutingCoordinate = readonly [
  longitude: number,
  latitude: number,
];

export interface MapboxRoutingPayload {
  readonly coordinates: readonly [
    MapboxRoutingCoordinate,
    MapboxRoutingCoordinate,
  ];
  readonly language: "pt" | "en" | "es" | "he";
}

export interface MapboxRoutingContext {
  readonly signal: AbortSignal;
}

export interface MapboxRoutingFeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: readonly [
    {
      readonly type: "Feature";
      readonly geometry: {
        readonly type: "LineString";
        readonly coordinates: readonly MapboxRoutingCoordinate[];
      };
      readonly properties: Readonly<Record<string, unknown>>;
    },
  ];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface MapboxDirectionsRoutingProvider {
  request(
    payload: MapboxRoutingPayload,
    context: MapboxRoutingContext,
  ): Promise<MapboxRoutingFeatureCollection>;
}

export interface MapboxDirectionsFetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type MapboxDirectionsFetchLike = (
  input: string,
  init: {
    readonly method: "GET";
    readonly headers: Readonly<Record<string, string>>;
    readonly signal: AbortSignal;
    readonly cache: "no-store";
    readonly credentials: "omit";
  },
) => Promise<MapboxDirectionsFetchResponseLike>;

export class MapboxDirectionsRoutingError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = "MapboxDirectionsRoutingError";
    this.code = code;
    this.status = status;
  }
}

const MAPBOX_DIRECTIONS_BASE =
  "https://api.mapbox.com/directions/v5/mapbox/walking";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function normalizeCoordinate(value: unknown): MapboxRoutingCoordinate | null {
  if (!isUnknownArray(value) || value.length !== 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function coordinateDistanceSquared(a: unknown, b: unknown): number {
  const left = normalizeCoordinate(a);
  const right = normalizeCoordinate(b);
  if (!left || !right) return Number.POSITIVE_INFINITY;
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  return dx * dx + dy * dy;
}

function nearestCoordinateIndex(
  routeCoordinates: readonly MapboxRoutingCoordinate[],
  target: unknown,
  startIndex = 0,
): number {
  const normalizedTarget = normalizeCoordinate(target);
  const boundedStart = Math.max(
    0,
    Math.min(startIndex, Math.max(0, routeCoordinates.length - 1)),
  );
  if (!normalizedTarget) return boundedStart;

  let bestIndex = boundedStart;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = boundedStart; index < routeCoordinates.length; index += 1) {
    const distance = coordinateDistanceSquared(
      routeCoordinates[index],
      normalizedTarget,
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildUrl(payload: MapboxRoutingPayload, token: string): string {
  const coordinates = payload.coordinates
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(";");
  const params = new URLSearchParams({
    alternatives: "false",
    geometries: "geojson",
    overview: "full",
    steps: "true",
    language: payload.language,
    voice_units: "metric",
    access_token: token,
  });
  return `${MAPBOX_DIRECTIONS_BASE}/${coordinates}?${params.toString()}`;
}

export function adaptMapboxDirectionsResponse(
  data: unknown,
  generatedAt = Date.now(),
): MapboxRoutingFeatureCollection {
  if (!isRecord(data) || !isUnknownArray(data.routes)) {
    throw new MapboxDirectionsRoutingError(
      "INVALID_MAPBOX_ROUTE_RESPONSE",
      "A Mapbox não retornou uma rota válida.",
    );
  }

  const routeCandidate: unknown = data.routes[0];
  if (!isRecord(routeCandidate) || !isRecord(routeCandidate.geometry)) {
    throw new MapboxDirectionsRoutingError(
      "INVALID_MAPBOX_ROUTE_RESPONSE",
      "A Mapbox não retornou uma rota válida.",
    );
  }
  const route = routeCandidate;
  const rawCoordinates: unknown = route.geometry.coordinates;
  if (!isUnknownArray(rawCoordinates)) {
    throw new MapboxDirectionsRoutingError(
      "INVALID_MAPBOX_ROUTE_RESPONSE",
      "A Mapbox não retornou uma rota válida.",
    );
  }

  const coordinates: MapboxRoutingCoordinate[] = [];
  for (const candidate of rawCoordinates) {
    const coordinate = normalizeCoordinate(candidate);
    if (coordinate) coordinates.push(coordinate);
  }
  if (coordinates.length < 2) {
    throw new MapboxDirectionsRoutingError(
      "INVALID_MAPBOX_ROUTE_RESPONSE",
      "A Mapbox não retornou uma rota válida.",
    );
  }

  const legs: readonly unknown[] = isUnknownArray(route.legs) ? route.legs : [];
  const rawSteps: unknown[] = [];
  for (const leg of legs) {
    if (!isRecord(leg) || !isUnknownArray(leg.steps)) continue;
    rawSteps.push(...leg.steps);
  }

  let previousStartIndex = 0;
  const steps = rawSteps.map((step, index) => {
    const stepRecord: Record<string, unknown> = isRecord(step) ? step : {};
    const maneuver: Record<string, unknown> = isRecord(stepRecord.maneuver)
      ? stepRecord.maneuver
      : {};
    const startIndex = nearestCoordinateIndex(
      coordinates,
      maneuver.location,
      previousStartIndex,
    );
    const nextStep: unknown = rawSteps[index + 1];
    const nextManeuver =
      isRecord(nextStep) && isRecord(nextStep.maneuver)
        ? nextStep.maneuver
        : null;
    const endIndex = nextManeuver
      ? nearestCoordinateIndex(coordinates, nextManeuver.location, startIndex)
      : coordinates.length - 1;
    previousStartIndex = startIndex;

    const isLast = index === rawSteps.length - 1;
    const maneuverInstruction =
      typeof maneuver.instruction === "string"
        ? maneuver.instruction
        : undefined;
    const stepName =
      typeof stepRecord.name === "string" ? stepRecord.name : undefined;
    const instruction = (
      maneuverInstruction ??
      stepName ??
      (isLast ? "Você chegou ao destino." : "Continue em frente.")
    ).trim();

    return {
      instruction,
      distance: Number(stepRecord.distance) || 0,
      duration: Number(stepRecord.duration) || 0,
      name: stepName ?? "",
      type: typeof maneuver.type === "string" ? maneuver.type : "continue",
      way_points: [startIndex, Math.max(startIndex, endIndex)],
    };
  });

  const distance = Number(route.distance) || 0;
  const duration = Number(route.duration) || 0;
  if (steps.length === 0) {
    steps.push({
      instruction: "Siga pela rota destacada até o destino.",
      distance,
      duration,
      name: "",
      type: "continue",
      way_points: [0, coordinates.length - 1],
    });
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates },
        properties: {
          summary: { distance, duration },
          segments: [{ distance, duration, steps }],
        },
      },
    ],
    metadata: {
      provider: "mapbox_directions",
      generatedAt,
    },
  };
}

export function createMapboxDirectionsRoutingProvider(options: {
  readonly token: string;
  readonly fetchImpl?: MapboxDirectionsFetchLike;
  readonly now?: () => number;
}): MapboxDirectionsRoutingProvider {
  const token = options.token.trim();
  const fetchImpl =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const now = options.now ?? Date.now;

  const provider: MapboxDirectionsRoutingProvider = {
    async request(
      payload: MapboxRoutingPayload,
      context: MapboxRoutingContext,
    ): Promise<MapboxRoutingFeatureCollection> {
      if (!token) {
        throw new MapboxDirectionsRoutingError(
          "MAPBOX_TOKEN_UNAVAILABLE",
          "Serviço alternativo de rotas não configurado.",
        );
      }

      const response = await fetchImpl(buildUrl(payload, token), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: context.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const body: unknown = await response.json().catch((): null => null);
      if (!response.ok) {
        const message =
          isRecord(body) && typeof body.message === "string"
            ? body.message
            : "Não foi possível calcular a rota pela Mapbox.";
        throw new MapboxDirectionsRoutingError(
          "MAPBOX_ROUTING_HTTP_ERROR",
          message,
          response.status,
        );
      }

      return adaptMapboxDirectionsResponse(body, now());
    },
  };

  return Object.freeze(provider);
}
