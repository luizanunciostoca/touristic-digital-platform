import { describe, expect, it } from "vitest";
import { morroTourCatalog } from "./tour-catalog.js";
import {
  getLocalizedMorroTourCatalog,
  localizeMorroTour,
  normalizeTourLocale,
  supportedTourLocales,
} from "./tour-localization.js";

describe("tour localization", () => {
  it("normalizes supported browser locale variants with pt-BR fallback", () => {
    expect(normalizeTourLocale("pt-BR")).toBe("pt-BR");
    expect(normalizeTourLocale("pt-PT")).toBe("pt-BR");
    expect(normalizeTourLocale("en-US")).toBe("en");
    expect(normalizeTourLocale("en-GB")).toBe("en");
    expect(normalizeTourLocale("es-AR")).toBe("es");
    expect(normalizeTourLocale("fr-FR")).toBe("pt-BR");
    expect(normalizeTourLocale()).toBe("pt-BR");
  });

  it.each(supportedTourLocales)(
    "provides complete non-empty content for every tour and stop in %s",
    (locale) => {
      const localizedCatalog = getLocalizedMorroTourCatalog(locale);

      expect(localizedCatalog).toHaveLength(morroTourCatalog.length);

      localizedCatalog.forEach((tour) => {
        const source = morroTourCatalog.find((item) => item.id === tour.id);
        expect(source).toBeDefined();
        expect(tour.locale).toBe(locale);
        expect(tour.title.trim()).not.toBe("");
        expect(tour.description.trim()).not.toBe("");
        expect(tour.duration.trim()).not.toBe("");
        expect(tour.transport.trim()).not.toBe("");
        expect(tour.stops).toHaveLength(source?.stops.length ?? 0);

        tour.stops.forEach((stop, index) => {
          const sourceStop = source?.stops[index];
          expect(stop.locale).toBe(locale);
          expect(stop.title.trim()).not.toBe("");
          expect(stop.photoAlt.trim()).not.toBe("");
          expect(stop.id).toBe(sourceStop?.id);
          expect(stop.order).toBe(sourceStop?.order);
          expect(stop.position).toEqual(sourceStop?.position);
          expect(stop.photoPath).toBe(sourceStop?.photoPath);
        });
      });
    },
  );

  it("preserves route geometry and media references across locales", () => {
    const portuguese = getLocalizedMorroTourCatalog("pt-BR");
    const english = getLocalizedMorroTourCatalog("en");
    const spanish = getLocalizedMorroTourCatalog("es");

    [english, spanish].forEach((catalog) => {
      catalog.forEach((tour, tourIndex) => {
        const base = portuguese[tourIndex];
        expect(base).toBeDefined();
        expect(tour.id).toBe(base?.id);
        expect(tour.startPoint).toEqual(base?.startPoint);
        expect(
          tour.stops.map(({ id, order, position, photoPath }) => ({
            id,
            order,
            position,
            photoPath,
          })),
        ).toEqual(
          base?.stops.map(({ id, order, position, photoPath }) => ({
            id,
            order,
            position,
            photoPath,
          })),
        );
      });
    });
  });

  it("keeps Portuguese localized content equivalent to the current catalog", () => {
    const localized = getLocalizedMorroTourCatalog("pt-BR");

    localized.forEach((tour, index) => {
      const source = morroTourCatalog[index];
      expect(source).toBeDefined();
      expect(tour.title).toBe(source?.title);
      expect(tour.description).toBe(source?.description);
      expect(tour.duration).toBe(source?.duration);
      expect(tour.transport).toBe(source?.transport);
      expect(tour.stops.map((stop) => stop.title)).toEqual(
        source?.stops.map((stop) => stop.title),
      );
      expect(tour.stops.map((stop) => stop.photoAlt)).toEqual(
        source?.stops.map((stop) => stop.photoAlt),
      );
    });
  });

  it("returns undefined for an unknown tour without throwing", () => {
    expect(localizeMorroTour("missing-tour", "en")).toBeUndefined();
  });

  it("returns immutable localized route and stop collections", () => {
    const tour = localizeMorroTour("volta-a-ilha", "en");

    expect(tour).toBeDefined();
    expect(Object.isFrozen(tour)).toBe(true);
    expect(Object.isFrozen(tour?.stops)).toBe(true);
    expect(tour?.stops.every((stop) => Object.isFrozen(stop))).toBe(true);
  });

  it("contains translated route and stop examples in English and Spanish", () => {
    expect(localizeMorroTour("volta-a-ilha", "en")?.title).toBe(
      "Around the Island Tour",
    );
    expect(localizeMorroTour("trilha-gamboa", "es")?.stops[3]?.title).toBe(
      "Paredón de Arcilla",
    );
    expect(localizeMorroTour("passeio-quadriciclo", "en")?.transport).toBe(
      "ATV",
    );
  });
});
