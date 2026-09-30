import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveApprovedLocale,
  resolveFromBrowser,
  OVERRIDE_KEY,
} from "../src/locale-policy.mjs";
import {
  mapCameraQuery,
  fetchCanonicalCoverage,
  reconcileVisiblePlaces,
  safeCanonicalProjection,
} from "../src/canonical-places.mjs";
const query = mapCameraQuery({
  destinationId: "morro-de-sao-paulo",
  bbox: [-39.05, -13.5, -38.89, -13.35],
  zoom: 14,
});
test("P01 manual override persists ahead of browser and destination", () =>
  assert.deepEqual(
    resolveApprovedLocale({
      manualOverride: "he",
      browserLanguages: ["es"],
      destinationLocale: "pt",
    }),
    { locale: "he-IL", source: "manual", direction: "rtl" },
  ));
for (const [input, expected] of [
  ["pt-BR", "pt-BR"],
  ["en-US", "en-US"],
  ["es-AR", "es-ES"],
  ["he-IL", "he-IL"],
  ["iw", "he-IL"],
])
  test(`P01 browser ${input} precedence`, () => {
    const x = resolveApprovedLocale({
      browserLanguages: [input],
      destinationLocale: "pt-BR",
    });
    assert.equal(x.locale, expected);
    assert.equal(x.source, "browser");
  });
test("P01 unsupported browser falls back to destination", () =>
  assert.equal(
    resolveApprovedLocale({ browserLanguages: ["fr"], destinationLocale: "es" })
      .locale,
    "es-ES",
  ));
test("P01 absence of all language signals fails to safe pt-BR", () =>
  assert.equal(
    resolveApprovedLocale({ destinationLocale: "fr" }).locale,
    "pt-BR",
  ));
test("P01 storage blocked does not break locale / RTL DOM", () => {
  let lang = "",
    dir = "";
  const doc = {
    documentElement: {
      set lang(v) {
        lang = v;
      },
      get lang() {
        return lang;
      },
      set dir(v) {
        dir = v;
      },
      get dir() {
        return dir;
      },
    },
  };
  const resolved = resolveFromBrowser({
    document: doc,
    navigator: { languages: ["he-IL"] },
    storage: {
      getItem() {
        throw Error("private");
      },
    },
  });
  assert.equal(resolved.direction, "rtl");
  assert.equal(dir, "rtl");
  assert.equal(lang, "he-IL");
});
test("P01 production override key unchanged", () =>
  assert.equal(OVERRIDE_KEY, "morro-digital-language"));
test("P02 camera query validates scope", () => {
  assert.throws(() =>
    mapCameraQuery({ destinationId: "a/../", bbox: [1, 2, 3, 4], zoom: 15 }),
  );
  assert.throws(() =>
    mapCameraQuery({
      destinationId: "morro",
      bbox: [-39, -13, -40, -14],
      zoom: 10,
    }),
  );
  assert.throws(() =>
    mapCameraQuery({ destinationId: "morro", bbox: [0, 0, 1, 1], zoom: 77 }),
  );
});
test("P02 owned cursor pagination and canonical count", async () => {
  let n = 0;
  const c = {
    async listMap() {
      return ++n === 1
        ? {
            items: [
              {
                id: "1",
                name: "Praia",
                category: "beaches",
                lat: -13,
                lng: -38,
              },
            ],
            nextCursor: "abc",
          }
        : {
            items: [
              {
                id: "2",
                name: "Mirante",
                category: "attractions",
                lat: -13,
                lng: -38,
              },
            ],
            nextCursor: null,
          };
    },
  };
  const result = await fetchCanonicalCoverage(c, query);
  assert.equal(result.complete, true);
  assert.equal(result.pages, 2);
  const visible = reconcileVisiblePlaces({ canonical: result });
  assert.equal(visible.canonicalCount, 2);
  assert.deepEqual(visible.counts, { beaches: 1, attractions: 1 });
});
test("P02 duplicate cursor rejected, no silent partial proof", async () => {
  const c = {
    async listMap() {
      return { items: [], nextCursor: "repeat" };
    },
  };
  await assert.rejects(
    () => fetchCanonicalCoverage(c, query),
    /PAGINATION_LOOP/,
  );
});
test("P02 upper bound on pagination never invents completion", async () => {
  const c = {
    async listMap() {
      return { items: [], nextCursor: Math.random().toString(36) };
    },
  };
  const x = await fetchCanonicalCoverage(c, query, { maxPages: 2 });
  assert.equal(x.complete, false);
});
test("P02 empty canonical is explicit, not proof whole catalog empty", () => {
  const v = reconcileVisiblePlaces({
    canonical: { queried: true, complete: true, items: [] },
  });
  assert.equal(v.status, "empty");
  assert.equal(v.verified, false);
  assert.match(v.emptyReason, /área/);
});
test("P02 legacy compatibility opt-in and source labeling", () => {
  const legacy = [{ name: "Praia", category: "beaches", lat: -13, lng: -38 }];
  const off = reconcileVisiblePlaces({
    canonical: { queried: true, complete: true, items: [] },
    legacy,
  });
  assert.equal(off.places.length, 0);
  const on = reconcileVisiblePlaces({
    canonical: { queried: true, complete: true, items: [] },
    legacy,
    legacyApproved: true,
  });
  assert.equal(on.places.length, 1);
  assert.equal(on.places[0].source, "legacy");
  assert.equal(on.verified, false);
});
test("P02 owner failure degrades only when compatibility approved", async () => {
  const client = {
    async listMap() {
      throw Error("503");
    },
  };
  const off = await safeCanonicalProjection(client, query);
  assert.equal(off.status, "unavailable");
  const on = await safeCanonicalProjection(client, query, {
    legacyApproved: true,
    legacy: [{ name: "P", category: "beaches", lat: 1, lng: 2 }],
  });
  assert.equal(on.status, "degraded");
  assert.equal(on.places[0].authoritative, false);
});
test("P02 invalid canonical coordinates do not appear on map", async () => {
  const c = {
    async listMap() {
      return {
        items: [{ name: "invalid", category: "x", lat: NaN, lng: 2 }],
        nextCursor: null,
      };
    },
  };
  const x = await fetchCanonicalCoverage(c, query);
  assert.equal(x.items.length, 0);
});
