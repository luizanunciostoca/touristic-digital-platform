import { describe, expect, it } from "vitest";
import type {
  PublicPlaceMapItem,
  PublicPlaceDetail,
} from "@touristic/business";
import type { PublicDestination } from "../runtime/public-destination.js";
import {
  assertPublicDetailDestination,
  destinationPublicBoundingBox,
  localeChoice,
  trustedPublicMapMarkers,
} from "./destination-page.js";

const destination: PublicDestination = {
  id: "itacare",
  name: "Itacaré",
  countryCode: "BR",
  timezone: "America/Bahia",
  currency: "BRL",
  center: { latitude: -14.278, longitude: -39.0 },
  radiusMeters: 35_000,
  modules: { map: true, assistant: true },
};

const place = (id: string, lat: number, lng: number) =>
  ({
    id,
    name: id,
    category: "beaches",
    lat,
    lng,
    presentation: { markerKey: "beaches", priority: 1 },
  }) as PublicPlaceMapItem;

describe("canonical multi-destination public page scope", () => {
  it("derives a finite Itacare boundary without using Morro coordinates", () => {
    const [west, south, east, north] =
      destinationPublicBoundingBox(destination);
    expect(west).toBeLessThan(-39);
    expect(east).toBeGreaterThan(-39);
    expect(south).toBeLessThan(-14.278);
    expect(north).toBeGreaterThan(-14.278);
    expect(south).toBeGreaterThan(-15);
    expect(north).toBeLessThan(-13);
    expect(south).not.toBeCloseTo(-13.3833, 3);
  });
  it("rejects invalid center/radius metadata", () => {
    for (const invalid of [
      { ...destination, radiusMeters: Infinity },
      { ...destination, radiusMeters: -1 },
      { ...destination, radiusMeters: 100_001 },
      { ...destination, center: { latitude: 90, longitude: 0 } },
      { ...destination, center: { latitude: 999, longitude: 0 } },
      { ...destination, id: "../itacare" },
    ])
      expect(() => destinationPublicBoundingBox(invalid)).toThrow();
  });
  it("keeps only distinct in-bound public map markers", () => {
    const bbox = destinationPublicBoundingBox(destination);
    const markers = trustedPublicMapMarkers(
      [
        place("beach-1", -14.3, -39.01),
        place("beach-1", -14.31, -39.02),
        place("outside-morro", -13.38, -38.91),
        place("bad-id/escape", -14.3, -39.0),
        place("bad-lat", 999, 0),
      ],
      bbox,
    );
    expect(markers.map((x) => x.id)).toEqual(["beach-1"]);
    expect(markers[0]?.position).toEqual({
      latitude: -14.3,
      longitude: -39.01,
    });
  });
  it("fails closed if detail or action scope crosses destination", () => {
    const detail = {
      profile: {
        id: "beach-1",
        destinationId: "itacare",
        location: { latitude: -14.278, longitude: -39, address: "", area: "" },
      },
      actions: { placeId: "beach-1", destinationId: "itacare" },
    } as unknown as PublicPlaceDetail;
    expect(assertPublicDetailDestination(detail, "itacare", "beach-1")).toBe(
      detail,
    );
    expect(() =>
      assertPublicDetailDestination(detail, "morro-de-sao-paulo", "beach-1"),
    ).toThrow();
    expect(() =>
      assertPublicDetailDestination(
        {
          ...detail,
          actions: { ...detail.actions, destinationId: "morro-de-sao-paulo" },
        },
        "itacare",
        "beach-1",
      ),
    ).toThrow();
    expect(() =>
      assertPublicDetailDestination(detail, "itacare", "another"),
    ).toThrow();
  });
  it("rejects corrupt coordinates even with otherwise matching public identity", () => {
    const corrupt = {
      profile: {
        id: "beach-1",
        destinationId: "itacare",
        location: {
          latitude: Number.NaN,
          longitude: -39,
          address: "",
          area: "",
        },
      },
      actions: { placeId: "beach-1", destinationId: "itacare" },
    } as unknown as PublicPlaceDetail;
    expect(() =>
      assertPublicDetailDestination(corrupt, "itacare", "beach-1"),
    ).toThrow("PUBLIC_PLACE_DETAIL_LOCATION_INVALID");
  });

  it("supports four existing locales with deterministic fallback", () => {
    expect(localeChoice("pt-BR")).toBe("pt-BR");
    expect(localeChoice("en-US")).toBe("en");
    expect(localeChoice("es")).toBe("es");
    expect(localeChoice("he-IL")).toBe("he");
    expect(localeChoice("xx")).toBe("pt-BR");
  });
});
