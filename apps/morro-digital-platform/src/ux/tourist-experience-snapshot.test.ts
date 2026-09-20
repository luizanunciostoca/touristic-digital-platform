import { describe, expect, it } from "vitest";

import {
  TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY,
  TOURIST_EXPERIENCE_SNAPSHOT_TTL_MS,
  captureTouristExperienceSnapshot,
  parseTouristExperienceSnapshot,
  readTouristExperienceSnapshot,
  restoreTouristExperienceSnapshot,
  writeTouristExperienceSnapshot,
  type TouristExperienceSnapshot,
} from "./tourist-experience-snapshot.js";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function createDocumentFixture() {
  const body = { dataset: { mdMode: "place" } as DOMStringMap };
  const documentElement = { lang: "pt-BR" };
  const sheet = { dataset: {} as DOMStringMap };
  const document = {
    body,
    documentElement,
    querySelector(selector: string) {
      return selector === ".md-bottom-sheet" ? sheet : null;
    },
  } as unknown as Document;
  return { document, body, sheet };
}

describe("TouristExperienceSnapshot", () => {
  it("validates a browser-safe schema and discards unknown authority fields", () => {
    const now = 1_800_000_000_000;
    const parsed = parseTouristExperienceSnapshot(
      {
        version: 1,
        mode: "place",
        placeId: "Toca do Morcego",
        category: "nightlife",
        locale: "pt-BR",
        mapCenter: [-38.9172057, -13.3766787],
        mapZoom: 15.5,
        mapBearing: 20,
        mapPitch: 45,
        sheetState: "half",
        scrollY: 120,
        createdAt: now,
        statusToken: "must-not-survive",
        paymentAuthority: "must-not-survive",
        holder: { email: "private@example.test" },
      },
      now,
    );

    expect(parsed).toMatchObject({
      version: 1,
      mode: "place",
      placeId: "Toca do Morcego",
      category: "nightlife",
      locale: "pt-BR",
      mapCenter: [-38.9172057, -13.3766787],
      mapZoom: 15.5,
      sheetState: "half",
    });
    expect(parsed).not.toHaveProperty("statusToken");
    expect(parsed).not.toHaveProperty("paymentAuthority");
    expect(parsed).not.toHaveProperty("holder");
  });

  it("expires stale snapshots and removes invalid session state", () => {
    const storage = createMemoryStorage();
    const createdAt = 1_800_000_000_000;
    storage.setItem(
      TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mode: "discover",
        locale: "pt-BR",
        createdAt,
      }),
    );

    expect(
      readTouristExperienceSnapshot(
        storage,
        createdAt + TOURIST_EXPERIENCE_SNAPSHOT_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(
      storage.getItem(TOURIST_EXPERIENCE_SNAPSHOT_STORAGE_KEY),
    ).toBeNull();
  });

  it("captures place, category, locale and map camera into session storage", () => {
    const storage = createMemoryStorage();
    const { document } = createDocumentFixture();
    const window = {
      scrollY: 84,
      sessionStorage: storage,
    } as unknown as Window;

    const snapshot = captureTouristExperienceSnapshot({
      document,
      window,
      storage,
      explore: {
        category: "nightlife",
        place: "Toca do Morcego",
        stage: "detail",
      },
      map: {
        getCenter: () => ({ lng: -38.9172057, lat: -13.3766787 }),
        getZoom: () => 16,
        getBearing: () => 5,
        getPitch: () => 45,
      },
      now: () => 1_800_000_000_000,
    });

    expect(snapshot).toMatchObject({
      mode: "place",
      placeId: "Toca do Morcego",
      category: "nightlife",
      locale: "pt-BR",
      mapCenter: [-38.9172057, -13.3766787],
      mapZoom: 16,
      scrollY: 84,
    });
    expect(readTouristExperienceSnapshot(storage, snapshot.createdAt)).toEqual(
      snapshot,
    );
  });

  it("restores Explore before applying the saved camera and presentation state", async () => {
    const storage = createMemoryStorage();
    const now = 1_800_000_000_000;
    const snapshot: TouristExperienceSnapshot = {
      version: 1,
      mode: "place",
      placeId: "Toca do Morcego",
      category: "nightlife",
      locale: "pt-BR",
      mapCenter: [-38.9172057, -13.3766787],
      mapZoom: 15.25,
      mapBearing: 12,
      mapPitch: 40,
      sheetState: "half",
      scrollY: 144,
      createdAt: now,
    };
    expect(writeTouristExperienceSnapshot(storage, snapshot)).toBe(true);

    const { document, body, sheet } = createDocumentFixture();
    const order: string[] = [];
    let camera: unknown;
    let scrolledTo: unknown;
    const window = {
      sessionStorage: storage,
      scrollTo(options: unknown) {
        order.push("scroll");
        scrolledTo = options;
      },
    } as unknown as Window;

    const restored = await restoreTouristExperienceSnapshot({
      document,
      window,
      storage,
      map: {
        jumpTo(options) {
          order.push("camera");
          camera = options;
        },
      },
      async restorePlace(place) {
        order.push("place:" + place);
        return true;
      },
      async restoreCategory(category) {
        order.push("category:" + category);
        return true;
      },
      now: () => now,
    });

    expect(restored).toBe(true);
    expect(order[0]).toBe("place:Toca do Morcego");
    expect(camera).toEqual({
      center: [-38.9172057, -13.3766787],
      zoom: 15.25,
      bearing: 12,
      pitch: 40,
    });
    expect(sheet.dataset.sheetState).toBe("half");
    expect(scrolledTo).toEqual({ top: 144, behavior: "auto" });
    expect(body.dataset.mdContextRestored).toBe("true");
    expect(body.dataset.mdContextRestoredMode).toBe("place");
  });
});
