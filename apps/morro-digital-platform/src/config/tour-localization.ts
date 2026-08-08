import {
  getMorroTourById,
  morroTourCatalog,
  type TourRouteContract,
  type TourStopContract,
} from "./tour-catalog.js";
import {
  v1TourEditorialSource,
  type TourStopEditorialSource,
} from "./tour-editorial-source.js";
import { v1TourTranslationsEn } from "./tour-translations-en.js";
import { v1TourTranslationsEs } from "./tour-translations-es.js";
import { v1TourTranslationsHe } from "./tour-translations-he.js";

export const supportedTourLocales = ["pt-BR", "en", "es", "he"] as const;
export type TourLocale = (typeof supportedTourLocales)[number];

export interface LocalizedTourStopContract extends TourStopContract {
  readonly locale: TourLocale;
  readonly descriptionKey: string;
  readonly description: string;
  readonly narrationKey: string;
  readonly narration: string;
  readonly tipKeys: readonly string[];
  readonly tips: readonly string[];
}

export interface LocalizedTourRouteContract extends TourRouteContract {
  readonly locale: TourLocale;
  readonly stops: readonly LocalizedTourStopContract[];
}

type TranslationDictionary = Readonly<Record<string, string>>;

const translatedDictionaries: Readonly<
  Record<Exclude<TourLocale, "pt-BR">, TranslationDictionary>
> = Object.freeze({
  en: v1TourTranslationsEn,
  es: v1TourTranslationsEs,
  he: v1TourTranslationsHe,
});

/**
 * V1 uses `pt` as its default language. V2 exposes the canonical `pt-BR`
 * locale while preserving V1 browser-language aliases.
 *
 * When V1 receives an unsupported language, getGeneralText() attempts English
 * before the PT fallback stored in tour-data.js. We preserve that behavior.
 */
export function normalizeTourLocale(locale?: string | null): TourLocale {
  if (!locale?.trim()) return "pt-BR";

  const normalized = locale.trim().toLowerCase().replaceAll("_", "-");
  const language = normalized.split("-")[0];

  if (language === "pt") return "pt-BR";
  if (language === "en") return "en";
  if (language === "es") return "es";
  if (language === "he" || language === "iw") return "he";

  return "en";
}

function resolveText(
  locale: TourLocale,
  key: string,
  portugueseFallback: string,
): string {
  if (locale === "pt-BR") return portugueseFallback;

  const selected = translatedDictionaries[locale];
  return selected[key] ?? v1TourTranslationsEn[key] ?? portugueseFallback;
}

function requireEditorialStop(
  routeId: string,
  stopId: string,
): TourStopEditorialSource {
  const stop = v1TourEditorialSource[routeId]?.stops[stopId];
  if (!stop) {
    throw new Error(`Missing V1 editorial source for ${routeId}/${stopId}.`);
  }
  return stop;
}

function localizeStop(
  routeId: string,
  stop: TourStopContract,
  locale: TourLocale,
): LocalizedTourStopContract {
  const editorial = requireEditorialStop(routeId, stop.id);
  const localizedTips = editorial.tipKeys.map((tipKey, index) =>
    resolveText(locale, tipKey, editorial.tips[index] ?? ""),
  );

  return Object.freeze({
    ...stop,
    locale,
    title: resolveText(locale, stop.titleKey, stop.title),
    // V1 does not localize photoAlt in translateTour(); keep the structural
    // Portuguese value byte-for-byte instead of inventing translated alt text.
    photoAlt: stop.photoAlt,
    descriptionKey: editorial.descriptionKey,
    description: resolveText(
      locale,
      editorial.descriptionKey,
      editorial.description,
    ),
    narrationKey: editorial.narrationKey,
    narration: resolveText(locale, editorial.narrationKey, editorial.narration),
    tipKeys: editorial.tipKeys,
    tips: Object.freeze(localizedTips),
  });
}

function localizeRoute(
  route: TourRouteContract,
  locale: TourLocale,
): LocalizedTourRouteContract {
  const stops = route.stops.map((stop) => localizeStop(route.id, stop, locale));

  return Object.freeze({
    ...route,
    locale,
    title: resolveText(locale, route.titleKey, route.title),
    description: resolveText(
      locale,
      route.descriptionKey,
      route.description,
    ),
    duration: resolveText(locale, route.durationKey, route.duration),
    transport: resolveText(locale, route.transportKey, route.transport),
    stops: Object.freeze(stops),
  });
}

export function localizeMorroTour(
  tourId: string,
  locale?: string | null,
): LocalizedTourRouteContract | undefined {
  const route = getMorroTourById(tourId);
  if (!route) return undefined;

  return localizeRoute(route, normalizeTourLocale(locale));
}

export function getLocalizedMorroTourCatalog(
  locale?: string | null,
): readonly LocalizedTourRouteContract[] {
  const resolvedLocale = normalizeTourLocale(locale);
  return Object.freeze(
    morroTourCatalog.map((route) => localizeRoute(route, resolvedLocale)),
  );
}
