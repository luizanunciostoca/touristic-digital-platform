import { describe, expect, it } from "vitest";
import { morroTourCatalog } from "./tour-catalog.js";
import { v1TourEditorialSource } from "./tour-editorial-source.js";
import {
  getLocalizedMorroTourCatalog,
  localizeMorroTour,
  normalizeTourLocale,
  supportedTourLocales,
} from "./tour-localization.js";
import { v1TourTranslationsEn } from "./tour-translations-en.js";
import { v1TourTranslationsEs } from "./tour-translations-es.js";
import { v1TourTranslationsHe } from "./tour-translations-he.js";

const expectedTourIds = [
  "volta-a-ilha",
  "trilha-gamboa",
  "passeio-quadriciclo",
] as const;

function collectExpectedTranslationKeys(): string[] {
  const keys: string[] = [];

  for (const route of morroTourCatalog) {
    keys.push(
      route.titleKey,
      route.descriptionKey,
      route.durationKey,
      route.transportKey,
    );

    for (const stop of route.stops) {
      const editorial = v1TourEditorialSource[route.id]?.stops[stop.id];
      if (!editorial)
        throw new Error(`Missing editorial fixture for ${route.id}/${stop.id}`);

      keys.push(
        stop.titleKey,
        editorial.descriptionKey,
        editorial.narrationKey,
        ...editorial.tipKeys,
      );
    }
  }

  return [...new Set(keys)].sort();
}

function geometrySnapshot(routeId: string, locale: string) {
  const route = localizeMorroTour(routeId, locale);
  if (!route) throw new Error(`Missing route ${routeId}`);

  return {
    id: route.id,
    startPoint: route.startPoint,
    stops: route.stops.map((stop) => ({
      id: stop.id,
      order: stop.order,
      position: stop.position,
      photoPath: stop.photoPath,
      photoAlt: stop.photoAlt,
    })),
  };
}

describe("tour localization — frozen V1 editorial equivalence", () => {
  it("supports the four V1 tour languages and browser aliases", () => {
    expect(supportedTourLocales).toEqual(["pt-BR", "en", "es", "he"]);
    expect(normalizeTourLocale("pt")).toBe("pt-BR");
    expect(normalizeTourLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeTourLocale("en-US")).toBe("en");
    expect(normalizeTourLocale("es-AR")).toBe("es");
    expect(normalizeTourLocale("he-IL")).toBe("he");
    expect(normalizeTourLocale("iw-IL")).toBe("he");
    expect(normalizeTourLocale("fr-FR")).toBe("en");
    expect(normalizeTourLocale()).toBe("pt-BR");
  });

  it("covers exactly the three V1 routes and all 18 stops in every locale", () => {
    for (const locale of supportedTourLocales) {
      const catalog = getLocalizedMorroTourCatalog(locale);
      expect(catalog.map(({ id }) => id)).toEqual(expectedTourIds);
      expect(catalog.map(({ stops }) => stops.length)).toEqual([8, 5, 5]);
      expect(catalog.reduce((sum, route) => sum + route.stops.length, 0)).toBe(
        18,
      );

      for (const route of catalog) {
        expect(route.title.trim()).not.toBe("");
        expect(route.description.trim()).not.toBe("");
        expect(route.duration.trim()).not.toBe("");
        expect(route.transport.trim()).not.toBe("");

        for (const stop of route.stops) {
          expect(stop.title.trim()).not.toBe("");
          expect(stop.description.trim()).not.toBe("");
          expect(stop.narration.trim()).not.toBe("");
          expect(stop.tipKeys.length).toBe(stop.tips.length);
          expect(stop.tips.length).toBeGreaterThan(0);
          expect(stop.tips.every((tip) => tip.trim().length > 0)).toBe(true);
        }
      }
    }
  });

  it("requires EN, ES and HE dictionaries to cover every V1 tour translation key", () => {
    const expectedKeys = collectExpectedTranslationKeys();

    for (const dictionary of [
      v1TourTranslationsEn,
      v1TourTranslationsEs,
      v1TourTranslationsHe,
    ]) {
      expect(Object.keys(dictionary).sort()).toEqual(expectedKeys);
      expect(
        Object.values(dictionary).every((value) => value.trim().length > 0),
      ).toBe(true);
    }
  });

  it("pins translations that previously diverged from the frozen V1", () => {
    expect(localizeMorroTour("volta-a-ilha", "en")?.title).toBe(
      "Island Round Trip",
    );
    expect(localizeMorroTour("volta-a-ilha", "es")?.title).toBe(
      "Vuelta a la Isla",
    );
    expect(localizeMorroTour("trilha-gamboa", "en")?.stops[3]?.title).toBe(
      "Clay Wall",
    );
    expect(localizeMorroTour("passeio-quadriciclo", "en")?.transport).toBe(
      "ATV (Quad bike)",
    );
    expect(
      localizeMorroTour("passeio-quadriciclo", "en")?.stops[0]?.title,
    ).toBe("Base and Instructions");
    expect(
      localizeMorroTour("passeio-quadriciclo", "es")?.stops[0]?.title,
    ).toBe("Base e Instrucciones");
    expect(localizeMorroTour("volta-a-ilha", "he")?.title).toBe("סיבוב האי");
  });

  it("preserves V1 Portuguese fallback text byte-for-byte", () => {
    const localized = getLocalizedMorroTourCatalog("pt-BR");

    for (const [routeIndex, route] of morroTourCatalog.entries()) {
      const localizedRoute = localized[routeIndex];
      expect(localizedRoute?.title).toBe(route.title);
      expect(localizedRoute?.description).toBe(route.description);
      expect(localizedRoute?.duration).toBe(route.duration);
      expect(localizedRoute?.transport).toBe(route.transport);

      for (const [stopIndex, stop] of route.stops.entries()) {
        const localizedStop = localizedRoute?.stops[stopIndex];
        const editorial = v1TourEditorialSource[route.id]?.stops[stop.id];
        expect(localizedStop?.title).toBe(stop.title);
        expect(localizedStop?.photoAlt).toBe(stop.photoAlt);
        expect(localizedStop?.description).toBe(editorial?.description);
        expect(localizedStop?.narration).toBe(editorial?.narration);
        expect(localizedStop?.tips).toEqual(editorial?.tips);
      }
    }
  });

  it("does not invent localized photoAlt values because V1 leaves photoAlt structural", () => {
    for (const route of morroTourCatalog) {
      for (const locale of supportedTourLocales) {
        const localized = localizeMorroTour(route.id, locale);
        expect(localized).toBeDefined();

        for (const [index, stop] of route.stops.entries()) {
          expect(localized?.stops[index]?.photoAlt).toBe(stop.photoAlt);
        }
      }
    }
  });

  it("preserves geometry, ordering and media across all locales", () => {
    for (const route of morroTourCatalog) {
      const baseline = geometrySnapshot(route.id, "pt-BR");
      for (const locale of supportedTourLocales) {
        expect(geometrySnapshot(route.id, locale)).toEqual(baseline);
      }
    }
  });

  it("preserves the V1 English fallback for unsupported locale values", () => {
    expect(localizeMorroTour("volta-a-ilha", "fr-FR")).toEqual(
      localizeMorroTour("volta-a-ilha", "en"),
    );
  });

  it("returns immutable localized routes, stops and editorial collections", () => {
    const route = localizeMorroTour("trilha-gamboa", "he");
    expect(route).toBeDefined();
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route?.stops)).toBe(true);
    expect(Object.isFrozen(route?.stops[0])).toBe(true);
    expect(Object.isFrozen(route?.stops[0]?.tipKeys)).toBe(true);
    expect(Object.isFrozen(route?.stops[0]?.tips)).toBe(true);
  });

  it("returns undefined for unknown tour IDs", () => {
    expect(localizeMorroTour("nao-existe", "pt-BR")).toBeUndefined();
  });
});
