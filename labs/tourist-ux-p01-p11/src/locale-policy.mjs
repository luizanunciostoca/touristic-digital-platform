/** P01: user choice > supported browser language > configured destination > safe PT. */
export const SUPPORTED_LOCALES = Object.freeze([
  "pt-BR",
  "en-US",
  "es-ES",
  "he-IL",
]);
export const OVERRIDE_KEY = "morro-digital-language"; // retain existing production storage key
const normalize = (value) => {
  if (typeof value !== "string") return null;
  const language = value
    .trim()
    .replaceAll("_", "-")
    .split("-")[0]
    .toLowerCase();
  return (
    { pt: "pt-BR", en: "en-US", es: "es-ES", he: "he-IL", iw: "he-IL" }[
      language
    ] ?? null
  );
};
export function resolveApprovedLocale({
  manualOverride = null,
  browserLanguages = [],
  browserLanguage = null,
  destinationLocale = "pt-BR",
} = {}) {
  const manual = normalize(manualOverride);
  if (manual)
    return Object.freeze({
      locale: manual,
      source: "manual",
      direction: manual === "he-IL" ? "rtl" : "ltr",
    });
  for (const value of [
    ...(Array.isArray(browserLanguages) ? browserLanguages : []),
    browserLanguage,
  ]) {
    const locale = normalize(value);
    if (locale)
      return Object.freeze({
        locale,
        source: "browser",
        direction: locale === "he-IL" ? "rtl" : "ltr",
      });
  }
  const destination = normalize(destinationLocale);
  return Object.freeze({
    locale: destination ?? "pt-BR",
    source: destination ? "destination" : "safe-fallback",
    direction: destination === "he-IL" ? "rtl" : "ltr",
  });
}
export function resolveFromBrowser({
  document,
  navigator,
  storage,
  defaultDestinationLocale = "pt-BR",
}) {
  let manualOverride = null;
  try {
    manualOverride = storage?.getItem(OVERRIDE_KEY);
  } catch {}
  const result = resolveApprovedLocale({
    manualOverride,
    browserLanguages: navigator?.languages,
    browserLanguage: navigator?.language,
    destinationLocale: defaultDestinationLocale,
  });
  document.documentElement.lang = result.locale;
  document.documentElement.dir = result.direction;
  return result;
}
