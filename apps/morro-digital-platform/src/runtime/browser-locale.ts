export const MORRO_LANGUAGE_OVERRIDE_KEY = "morro-digital-language";

export type MorroDocumentLocale = "pt-BR" | "en-US" | "es-ES" | "he-IL";
export type MorroLocaleResolutionSource =
  | "manual"
  | "browser"
  | "browser-fallback"
  | "document-fallback";

export interface MorroBrowserLocaleResolution {
  readonly locale: MorroDocumentLocale;
  readonly source: MorroLocaleResolutionSource;
}

export interface MorroBrowserLocaleInput {
  readonly override?: string | null;
  readonly languages?: readonly string[] | null;
  readonly language?: string | null;
  readonly fallbackLocale?: string | null;
}

export interface MorroLanguageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface InitializeMorroBrowserLocaleOptions {
  readonly document: Document;
  readonly navigator?: Pick<Navigator, "language" | "languages"> | null;
  readonly storage?: MorroLanguageStorage | null;
}

function canonicalSupportedLocale(value?: string | null): MorroDocumentLocale | null {
  if (!value?.trim()) return null;

  const normalized = value.trim().toLowerCase().replaceAll("_", "-");
  const language = normalized.split("-")[0];

  switch (language) {
    case "pt":
      return "pt-BR";
    case "en":
      return "en-US";
    case "es":
      return "es-ES";
    case "he":
    case "iw":
      return "he-IL";
    default:
      return null;
  }
}

function nonEmpty(values: readonly (string | null | undefined)[]): string[] {
  return values.flatMap((value) => {
    const normalized = value?.trim();
    return normalized ? [normalized] : [];
  });
}

/**
 * V1 language precedence restored for the public browser runtime:
 * 1. an explicit Morro Digital language choice;
 * 2. the first supported browser preference from navigator.languages/language;
 * 3. English when the browser reports only unsupported locales, matching the
 *    V1 getGeneralText() unsupported-language fallback;
 * 4. the document fallback (PT-BR in the public shell) when the browser does
 *    not report a language at all.
 */
export function resolveMorroBrowserLocale(
  input: MorroBrowserLocaleInput,
): MorroBrowserLocaleResolution {
  const manual = canonicalSupportedLocale(input.override);
  if (manual) return Object.freeze({ locale: manual, source: "manual" as const });

  const browserCandidates = nonEmpty([
    ...(input.languages ?? []),
    input.language,
  ]);

  for (const candidate of browserCandidates) {
    const locale = canonicalSupportedLocale(candidate);
    if (locale) {
      return Object.freeze({ locale, source: "browser" as const });
    }
  }

  if (browserCandidates.length > 0) {
    return Object.freeze({
      locale: "en-US" as const,
      source: "browser-fallback" as const,
    });
  }

  return Object.freeze({
    locale: canonicalSupportedLocale(input.fallbackLocale) ?? "pt-BR",
    source: "document-fallback" as const,
  });
}

function resolveStorage(
  document: Document,
  override?: MorroLanguageStorage | null,
): MorroLanguageStorage | null {
  if (override !== undefined) return override;
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readMorroLanguageOverride(
  storage?: Pick<MorroLanguageStorage, "getItem"> | null,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(MORRO_LANGUAGE_OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function applyMorroDocumentLocale(
  document: Document,
  locale: MorroDocumentLocale,
): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "he-IL" ? "rtl" : "ltr";
}

export function initializeMorroBrowserLocale(
  options: InitializeMorroBrowserLocaleOptions,
): MorroBrowserLocaleResolution {
  const viewNavigator =
    options.navigator === undefined
      ? options.document.defaultView?.navigator ?? null
      : options.navigator;
  const storage = resolveStorage(options.document, options.storage);

  const resolution = resolveMorroBrowserLocale({
    override: readMorroLanguageOverride(storage),
    languages: viewNavigator?.languages ?? [],
    language: viewNavigator?.language ?? null,
    fallbackLocale: options.document.documentElement.lang,
  });

  applyMorroDocumentLocale(options.document, resolution.locale);
  return resolution;
}

export function persistMorroLanguageOverride(
  document: Document,
  locale: string,
  storage?: MorroLanguageStorage | null,
): MorroDocumentLocale | null {
  const canonical = canonicalSupportedLocale(locale);
  if (!canonical) return null;

  applyMorroDocumentLocale(document, canonical);
  const target = resolveStorage(document, storage);
  try {
    target?.setItem(MORRO_LANGUAGE_OVERRIDE_KEY, canonical);
  } catch {
    // Language switching must still work when localStorage is unavailable.
  }
  return canonical;
}
