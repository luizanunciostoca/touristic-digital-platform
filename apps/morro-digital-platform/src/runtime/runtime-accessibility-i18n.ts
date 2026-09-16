import {
  getLocalizedMorroTourCatalog,
  localizeMorroTour,
  normalizeTourLocale,
  type TourLocale,
} from "../config/tour-localization.js";

export type RuntimeAccessibilityLocale = TourLocale;

export type RuntimeStatusDescriptor =
  | Readonly<{ kind: "initializing" }>
  | Readonly<{
      kind: "runtime-ready";
      modules: readonly string[];
      providerId?: string | null;
    }>
  | Readonly<{ kind: "tour-switching" }>
  | Readonly<{
      kind: "tour-ready";
      tourId: string;
      markerCount: number;
    }>
  | Readonly<{
      kind: "map-fallback";
      mode: "using" | "restoring";
      detail?: string;
    }>
  | Readonly<{ kind: "tour-error"; detail?: string }>
  | Readonly<{ kind: "runtime-error"; detail?: string }>;

interface RuntimeAccessibilityCopy {
  readonly tourSelectLabel: string;
  readonly initializing: string;
  readonly unavailable: string;
  readonly unknownSdkError: string;
  readonly unknownMapboxStartError: string;
  readonly unknownTourError: string;
  readonly unknownRuntimeError: string;
  runtimeReady(modules: string, provider: string): string;
  mapFallbackUsing(detail: string): string;
  mapFallbackRestoring(detail: string): string;
  readonly tourSwitching: string;
  tourReady(count: number, tourTitle: string): string;
  tourError(detail: string): string;
  runtimeError(detail: string): string;
}

const COPY: Readonly<Record<RuntimeAccessibilityLocale, RuntimeAccessibilityCopy>> =
  Object.freeze({
    "pt-BR": Object.freeze({
      tourSelectLabel: "Roteiro exibido no mapa",
      initializing: "Inicializando o runtime…",
      unavailable: "indisponível",
      unknownSdkError: "Falha desconhecida no SDK.",
      unknownMapboxStartError: "Falha desconhecida ao inicializar o Mapbox.",
      unknownTourError: "Falha desconhecida ao trocar o roteiro.",
      unknownRuntimeError: "Falha desconhecida no runtime.",
      runtimeReady: (modules, provider) =>
        `Runtime ativo: ${modules} — provider ${provider} — Home pronta para explorar.`,
      mapFallbackUsing: (detail) =>
        `Mapbox indisponível; usando fallback da V1: ${detail}`,
      mapFallbackRestoring: (detail) =>
        `Mapbox indisponível; restaurando fallback da V1: ${detail}`,
      tourSwitching: "Atualizando o roteiro exibido no mapa…",
      tourReady: (count, tourTitle) =>
        `Runtime ativo — ${count} ${count === 1 ? "parada" : "paradas"} de ${tourTitle} ${count === 1 ? "carregada" : "carregadas"}.`,
      tourError: (detail) => `Não foi possível trocar o roteiro: ${detail}`,
      runtimeError: (detail) => `Falha ao iniciar o Morro Digital: ${detail}`,
    }),
    en: Object.freeze({
      tourSelectLabel: "Tour displayed on the map",
      initializing: "Initializing runtime…",
      unavailable: "unavailable",
      unknownSdkError: "Unknown SDK failure.",
      unknownMapboxStartError: "Unknown failure while starting Mapbox.",
      unknownTourError: "Unknown failure while changing the tour.",
      unknownRuntimeError: "Unknown runtime failure.",
      runtimeReady: (modules, provider) =>
        `Runtime active: ${modules} — provider ${provider} — Home is ready to explore.`,
      mapFallbackUsing: (detail) =>
        `Mapbox unavailable; using the V1 fallback: ${detail}`,
      mapFallbackRestoring: (detail) =>
        `Mapbox unavailable; restoring the V1 fallback: ${detail}`,
      tourSwitching: "Updating the tour displayed on the map…",
      tourReady: (count, tourTitle) =>
        `Runtime active — ${count} ${count === 1 ? "stop" : "stops"} from ${tourTitle} ${count === 1 ? "loaded" : "loaded"}.`,
      tourError: (detail) => `Could not change the tour: ${detail}`,
      runtimeError: (detail) => `Could not start Morro Digital: ${detail}`,
    }),
    es: Object.freeze({
      tourSelectLabel: "Recorrido mostrado en el mapa",
      initializing: "Inicializando el runtime…",
      unavailable: "no disponible",
      unknownSdkError: "Fallo desconocido del SDK.",
      unknownMapboxStartError: "Fallo desconocido al iniciar Mapbox.",
      unknownTourError: "Fallo desconocido al cambiar el recorrido.",
      unknownRuntimeError: "Fallo desconocido del runtime.",
      runtimeReady: (modules, provider) =>
        `Runtime activo: ${modules} — proveedor ${provider} — Inicio listo para explorar.`,
      mapFallbackUsing: (detail) =>
        `Mapbox no disponible; usando el fallback de V1: ${detail}`,
      mapFallbackRestoring: (detail) =>
        `Mapbox no disponible; restaurando el fallback de V1: ${detail}`,
      tourSwitching: "Actualizando el recorrido mostrado en el mapa…",
      tourReady: (count, tourTitle) =>
        `Runtime activo — ${count} ${count === 1 ? "parada" : "paradas"} de ${tourTitle} ${count === 1 ? "cargada" : "cargadas"}.`,
      tourError: (detail) => `No se pudo cambiar el recorrido: ${detail}`,
      runtimeError: (detail) => `No se pudo iniciar Morro Digital: ${detail}`,
    }),
    he: Object.freeze({
      tourSelectLabel: "המסלול המוצג במפה",
      initializing: "מאתחל את המערכת…",
      unavailable: "לא זמין",
      unknownSdkError: "תקלה לא ידועה ב-SDK.",
      unknownMapboxStartError: "תקלה לא ידועה בהפעלת Mapbox.",
      unknownTourError: "תקלה לא ידועה בהחלפת המסלול.",
      unknownRuntimeError: "תקלה לא ידועה במערכת.",
      runtimeReady: (modules, provider) =>
        `המערכת פעילה: ${modules} — ספק ${provider} — דף הבית מוכן לחקירה.`,
      mapFallbackUsing: (detail) =>
        `Mapbox אינו זמין; משתמש בפתרון הגיבוי של V1: ${detail}`,
      mapFallbackRestoring: (detail) =>
        `Mapbox אינו זמין; משחזר את פתרון הגיבוי של V1: ${detail}`,
      tourSwitching: "מעדכן את המסלול המוצג במפה…",
      tourReady: (count, tourTitle) =>
        count === 1
          ? `המערכת פעילה — תחנה אחת מתוך ${tourTitle} נטענה.`
          : `המערכת פעילה — ${count} תחנות מתוך ${tourTitle} נטענו.`,
      tourError: (detail) => `לא ניתן להחליף את המסלול: ${detail}`,
      runtimeError: (detail) => `לא ניתן להפעיל את Morro Digital: ${detail}`,
    }),
  });

export function runtimeAccessibilityLocale(locale?: string | null): RuntimeAccessibilityLocale {
  return normalizeTourLocale(locale);
}

export function formatRuntimeStatus(
  descriptor: RuntimeStatusDescriptor,
  locale?: string | null,
): string {
  const resolvedLocale = runtimeAccessibilityLocale(locale);
  const copy = COPY[resolvedLocale];

  switch (descriptor.kind) {
    case "initializing":
      return copy.initializing;
    case "runtime-ready":
      return copy.runtimeReady(
        descriptor.modules.join(", "),
        descriptor.providerId?.trim() || copy.unavailable,
      );
    case "tour-switching":
      return copy.tourSwitching;
    case "tour-ready": {
      const tour = localizeMorroTour(descriptor.tourId, resolvedLocale);
      return copy.tourReady(
        descriptor.markerCount,
        tour?.title ?? descriptor.tourId,
      );
    }
    case "map-fallback": {
      const detail =
        descriptor.detail?.trim() ||
        (descriptor.mode === "using"
          ? copy.unknownSdkError
          : copy.unknownMapboxStartError);
      return descriptor.mode === "using"
        ? copy.mapFallbackUsing(detail)
        : copy.mapFallbackRestoring(detail);
    }
    case "tour-error":
      return copy.tourError(descriptor.detail?.trim() || copy.unknownTourError);
    case "runtime-error":
      return copy.runtimeError(
        descriptor.detail?.trim() || copy.unknownRuntimeError,
      );
  }
}

export function localizedTourStopLabel(
  tourId: string,
  stopId: string,
  locale?: string | null,
): string | undefined {
  return localizeMorroTour(tourId, locale)?.stops.find(
    (stop) => stop.id === stopId,
  )?.title;
}

export function applyRuntimeAccessibilityPresentation(
  document: Document,
  locale = document.documentElement.lang,
): void {
  const resolvedLocale = runtimeAccessibilityLocale(locale);
  const copy = COPY[resolvedLocale];
  const select = document.getElementById("tour-select");
  select?.setAttribute("aria-label", copy.tourSelectLabel);

  if (select) {
    const localizedTours = new Map(
      getLocalizedMorroTourCatalog(resolvedLocale).map((tour) => [
        tour.id,
        tour.title,
      ]),
    );
    select.querySelectorAll<HTMLOptionElement>("option").forEach((option) => {
      const title = localizedTours.get(option.value);
      if (title) option.textContent = title;
    });
  }

  document
    .querySelectorAll<HTMLElement>(
      ".tour-stop-marker[data-tour-id][data-stop-id]",
    )
    .forEach((marker) => {
      const tourId = marker.dataset.tourId;
      const stopId = marker.dataset.stopId;
      if (!tourId || !stopId) return;
      const label = localizedTourStopLabel(tourId, stopId, resolvedLocale);
      if (label) marker.setAttribute("aria-label", label);
    });
}
