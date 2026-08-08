import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LOCATION_MAX_AGE_MS,
  createBrowserGeolocationService,
  getBrowserLocationAge,
  isBrowserLocationFresh,
  type BrowserGeolocationDriver,
} from "./browser-geolocation.js";

function position(
  latitude: number,
  longitude: number,
  timestamp: number,
): GeolocationPosition {
  return {
    coords: {
      latitude,
      longitude,
      accuracy: 7,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp,
    toJSON: () => ({}),
  };
}

function setup() {
  let watchSuccess: ((value: GeolocationPosition) => void) | null = null;
  let watchError: ((value: GeolocationPositionError) => void) | null = null;
  let fallbackSuccess: ((value: GeolocationPosition) => void) | null = null;
  let fallbackError: ((value: GeolocationPositionError) => void) | null = null;
  const watchPosition = vi.fn<BrowserGeolocationDriver["watchPosition"]>(
    (success, error) => {
      watchSuccess = success;
      watchError = error;
      return 77;
    },
  );
  const getCurrentPosition = vi.fn<BrowserGeolocationDriver["getCurrentPosition"]>(
    (success, error) => {
      fallbackSuccess = success;
      fallbackError = error;
    },
  );
  const clearWatch = vi.fn<BrowserGeolocationDriver["clearWatch"]>();
  const driver: BrowserGeolocationDriver = {
    watchPosition,
    getCurrentPosition,
    clearWatch,
  };
  let now = Date.parse("2026-07-15T12:00:00.000Z");
  const service = createBrowserGeolocationService({ driver, now: () => now });

  return {
    service,
    watchPosition,
    getCurrentPosition,
    clearWatch,
    emitWatch(lat: number, lon: number, timestamp = now) {
      if (!watchSuccess) throw new Error("watch not started");
      watchSuccess(position(lat, lon, timestamp));
    },
    failWatch(code: number, message: string) {
      if (!watchError) throw new Error("watch not started");
      watchError({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    },
    emitFallback(lat: number, lon: number, timestamp = now) {
      if (!fallbackSuccess) throw new Error("fallback not started");
      fallbackSuccess(position(lat, lon, timestamp));
    },
    failFallback(code: number, message: string) {
      if (!fallbackError) throw new Error("fallback not started");
      fallbackError({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    },
    advance(milliseconds: number) {
      now += milliseconds;
      vi.advanceTimersByTime(milliseconds);
    },
  };
}

describe("browser geolocation service", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("preserves V1 freshness rules including future clock skew", () => {
    const now = 100_000;
    const recent = {
      latitude: -13.38,
      longitude: -38.91,
      accuracy: 7,
      heading: null,
      speed: null,
      timestamp: now - 5_000,
    };
    expect(getBrowserLocationAge(recent, now)).toBe(5_000);
    expect(isBrowserLocationFresh(recent, { now })).toBe(true);
    expect(
      isBrowserLocationFresh(
        { ...recent, timestamp: now - DEFAULT_LOCATION_MAX_AGE_MS - 1 },
        { now },
      ),
    ).toBe(false);
    expect(isBrowserLocationFresh({ ...recent, timestamp: now + 6_000 }, { now })).toBe(false);
  });

  it("starts one high-accuracy watch with the V1 options and reuses fresh location", async () => {
    const context = setup();
    const first = context.service.getLocation();
    expect(context.watchPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    );

    context.emitWatch(-13.38, -38.91);
    await expect(first).resolves.toMatchObject({ latitude: -13.38, longitude: -38.91 });
    await expect(context.service.getLocation()).resolves.toMatchObject({ latitude: -13.38 });
    expect(context.watchPosition).toHaveBeenCalledTimes(1);
    expect(context.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("does not reuse stale cache and waits for a fresh watch update", async () => {
    const context = setup();
    const first = context.service.getLocation();
    context.emitWatch(-13.38, -38.91);
    await first;
    context.advance(30_001);

    expect(context.service.getCurrentLocation()).toBeNull();
    const next = context.service.getLocation({ timeout: 1_000 });
    context.emitWatch(-13.39, -38.92);
    await expect(next).resolves.toMatchObject({ latitude: -13.39, longitude: -38.92 });
  });

  it("isolates concurrent request timeouts", async () => {
    const context = setup();
    const expired = context.service.getLocation({ timeout: 10 });
    const active = context.service.getLocation({ timeout: 100 });

    context.advance(10);
    expect(context.getCurrentPosition).toHaveBeenCalledTimes(1);
    context.emitWatch(-13.37, -38.9);
    await expect(active).resolves.toMatchObject({ latitude: -13.37 });

    context.emitFallback(-13.4, -38.93);
    await expect(expired).resolves.toMatchObject({ latitude: -13.4 });
  });

  it("does not let a late watch update settle a request already in fallback", async () => {
    const context = setup();
    const request = context.service.getLocation({ timeout: 10 });
    const resolved = vi.fn();
    void request.then(resolved);

    context.advance(10);
    context.emitWatch(-13.36, -38.89);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    context.emitFallback(-13.39, -38.92);
    await expect(request).resolves.toMatchObject({ latitude: -13.39, longitude: -38.92 });
  });

  it("rejects stale fallback and maps fallback errors", async () => {
    const context = setup();
    const stale = context.service.getLocation({ timeout: 10, maxAge: 1_000 });
    context.advance(10);
    context.emitFallback(-13.38, -38.91, Date.parse("2026-07-15T11:59:58.999Z"));
    await expect(stale).rejects.toThrow("STALE_LOCATION");

    const failed = context.service.getLocation({ timeout: 10 });
    context.advance(10);
    context.failFallback(2, "Position unavailable");
    await expect(failed).rejects.toThrow("Timeout ao obter localização: Position unavailable");
  });

  it("permission denial rejects pending requests and stop clears the watcher", async () => {
    const context = setup();
    const request = context.service.getLocation({ timeout: 100 });
    context.failWatch(1, "Permission denied");
    await expect(request).rejects.toThrow("Permission denied");

    context.service.stop();
    expect(context.clearWatch).toHaveBeenCalledWith(77);
  });

  it("ignores callbacks from a watcher after stop and restart", async () => {
    const context = setup();
    const oldRequest = context.service.getLocation();
    context.service.stop();
    await expect(oldRequest).rejects.toThrow("LOCATION_SERVICE_STOPPED");

    const newRequest = context.service.getLocation();
    context.emitWatch(-13.4, -38.93);
    await expect(newRequest).resolves.toMatchObject({ latitude: -13.4 });
    expect(context.watchPosition).toHaveBeenCalledTimes(2);
  });
});
