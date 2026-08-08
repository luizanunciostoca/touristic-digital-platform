export const DEFAULT_LOCATION_MAX_AGE_MS = 30_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5_000;
const WATCH_TIMEOUT_MS = 15_000;
const WATCH_MAXIMUM_AGE_MS = 10_000;
const FALLBACK_TIMEOUT_MS = 8_000;
const REQUEST_TIMEOUT_MS = 12_000;

export interface BrowserLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number;
  readonly heading: number | null;
  readonly speed: number | null;
  readonly timestamp: number;
}

export interface BrowserGeolocationDriver {
  watchPosition(
    success: (position: GeolocationPosition) => void,
    error: (error: GeolocationPositionError) => void,
    options: PositionOptions,
  ): number;
  getCurrentPosition(
    success: (position: GeolocationPosition) => void,
    error: (error: GeolocationPositionError) => void,
    options: PositionOptions,
  ): void;
  clearWatch(id: number): void;
}

export interface BrowserLocationRequestOptions {
  readonly timeout?: number;
  readonly maxAge?: number;
}

export interface BrowserGeolocationService {
  start(): void;
  stop(): void;
  getLocation(options?: BrowserLocationRequestOptions): Promise<BrowserLocation>;
  getCurrentLocation(options?: Pick<BrowserLocationRequestOptions, "maxAge">): BrowserLocation | null;
  subscribe(listener: (location: BrowserLocation) => void): () => void;
}

interface PendingRequest {
  readonly id: number;
  readonly maxAge: number;
  readonly resolve: (location: BrowserLocation) => void;
  readonly reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  phase: "watch" | "fallback" | "settled";
}

function normalizeNonNegative(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function hasValidCoordinates(location: BrowserLocation): boolean {
  return (
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

export function getBrowserLocationAge(location: BrowserLocation, now = Date.now()): number {
  const timestamp = Number(location.timestamp);
  const currentTime = Number(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(currentTime)) return Infinity;
  const age = currentTime - timestamp;
  if (age < -MAX_FUTURE_CLOCK_SKEW_MS) return Infinity;
  return Math.max(0, age);
}

export function isBrowserLocationFresh(
  location: BrowserLocation | null | undefined,
  options: { readonly maxAge?: number; readonly now?: number } = {},
): location is BrowserLocation {
  if (!location || !hasValidCoordinates(location)) return false;
  const maxAge = normalizeNonNegative(options.maxAge, DEFAULT_LOCATION_MAX_AGE_MS);
  return getBrowserLocationAge(location, options.now ?? Date.now()) <= maxAge;
}

export function normalizeBrowserPosition(
  position: GeolocationPosition,
  now = Date.now(),
): BrowserLocation | null {
  const location: BrowserLocation = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Number(position.coords.accuracy),
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: Number.isFinite(Number(position.timestamp))
      ? Number(position.timestamp)
      : now,
  };
  return hasValidCoordinates(location) ? location : null;
}

export function createBrowserGeolocationService(options: {
  readonly driver?: BrowserGeolocationDriver;
  readonly now?: () => number;
} = {}): BrowserGeolocationService {
  const driver: BrowserGeolocationDriver = options.driver ?? navigator.geolocation;
  const now = options.now ?? (() => Date.now());
  const subscribers = new Set<(location: BrowserLocation) => void>();
  const pending = new Map<number, PendingRequest>();
  let nextRequestId = 1;
  let watchId: number | null = null;
  let watchGeneration = 0;
  let currentLocation: BrowserLocation | null = null;

  function notify(location: BrowserLocation): void {
    for (const subscriber of subscribers) subscriber(location);
  }

  function settle(
    request: PendingRequest,
    callback: (value: BrowserLocation | Error) => void,
    value: BrowserLocation | Error,
  ): void {
    if (request.phase === "settled") return;
    request.phase = "settled";
    if (request.timeoutId !== null) clearTimeout(request.timeoutId);
    request.timeoutId = null;
    pending.delete(request.id);
    callback(value);
  }

  function resolveRequest(request: PendingRequest, location: BrowserLocation): void {
    settle(request, (value) => request.resolve(value as BrowserLocation), location);
  }

  function rejectRequest(request: PendingRequest, error: Error): void {
    settle(request, (value) => request.reject(value as Error), error);
  }

  function acceptLocation(location: BrowserLocation): void {
    currentLocation = location;
    notify(location);
    for (const request of [...pending.values()]) {
      if (
        request.phase === "watch" &&
        isBrowserLocationFresh(location, { maxAge: request.maxAge, now: now() })
      ) {
        resolveRequest(request, location);
      }
    }
  }

  function start(): void {
    if (watchId !== null) return;
    const generation = ++watchGeneration;
    watchId = driver.watchPosition(
      (position) => {
        if (generation !== watchGeneration || watchId === null) return;
        const location = normalizeBrowserPosition(position, now());
        if (location) acceptLocation(location);
      },
      (error) => {
        if (generation !== watchGeneration || watchId === null) return;
        if (error.code !== 1) return;
        for (const request of [...pending.values()]) {
          rejectRequest(request, new Error(error.message || "PERMISSION_DENIED"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: WATCH_TIMEOUT_MS,
        maximumAge: WATCH_MAXIMUM_AGE_MS,
      },
    );
  }

  function stop(): void {
    watchGeneration += 1;
    if (watchId !== null) driver.clearWatch(watchId);
    watchId = null;
    for (const request of [...pending.values()]) {
      rejectRequest(request, new Error("LOCATION_SERVICE_STOPPED"));
    }
  }

  function beginFallback(request: PendingRequest): void {
    if (request.phase !== "watch") return;
    request.phase = "fallback";
    driver.getCurrentPosition(
      (position) => {
        if (request.phase !== "fallback") return;
        const location = normalizeBrowserPosition(position, now());
        if (!location || !isBrowserLocationFresh(location, { maxAge: request.maxAge, now: now() })) {
          rejectRequest(request, new Error("STALE_LOCATION"));
          return;
        }
        currentLocation = location;
        notify(location);
        resolveRequest(request, location);
      },
      (error) => {
        if (request.phase !== "fallback") return;
        if (error.code === 1) {
          rejectRequest(request, new Error("PERMISSION_DENIED"));
          return;
        }
        rejectRequest(
          request,
          new Error(`Timeout ao obter localização: ${error.message}`),
        );
      },
      { timeout: FALLBACK_TIMEOUT_MS, maximumAge: request.maxAge },
    );
  }

  return Object.freeze({
    start,
    stop,
    getLocation(requestOptions = {}) {
      const maxAge = normalizeNonNegative(
        requestOptions.maxAge,
        DEFAULT_LOCATION_MAX_AGE_MS,
      );
      if (isBrowserLocationFresh(currentLocation, { maxAge, now: now() })) {
        return Promise.resolve(currentLocation);
      }
      start();
      const timeout = normalizeNonNegative(requestOptions.timeout, REQUEST_TIMEOUT_MS);
      return new Promise<BrowserLocation>((resolve, reject) => {
        const request: PendingRequest = {
          id: nextRequestId++,
          maxAge,
          resolve,
          reject,
          timeoutId: null,
          phase: "watch",
        };
        request.timeoutId = setTimeout(() => beginFallback(request), timeout);
        pending.set(request.id, request);
      });
    },
    getCurrentLocation(requestOptions = {}) {
      const maxAge = normalizeNonNegative(
        requestOptions.maxAge,
        DEFAULT_LOCATION_MAX_AGE_MS,
      );
      return isBrowserLocationFresh(currentLocation, { maxAge, now: now() })
        ? currentLocation
        : null;
    },
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  });
}
