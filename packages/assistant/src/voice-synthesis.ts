export const ASSISTANT_VOICE_STORAGE_KEY = "voiceAssistant";
export const ASSISTANT_VOICE_ENABLED_KEY = "voice-enabled";
export const ASSISTANT_VOICE_SPEED_KEY = "voice-speed";
export const ASSISTANT_VOICE_NAME_KEY = "assistant-voice";
export const ASSISTANT_VOICE_LANGUAGE_KEY = "voice-language";

export type AssistantVoiceLanguage = "pt" | "en" | "es" | "he";

export interface AssistantVoicePreferences {
  readonly enabled: boolean;
  readonly volume: number;
  readonly rate: number;
  readonly pitch: number;
  readonly selectedVoice: string | null;
  readonly language: AssistantVoiceLanguage;
}

export interface AssistantVoiceDescriptor {
  readonly name: string;
  readonly lang: string;
  readonly default?: boolean;
}

export interface AssistantVoiceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_ASSISTANT_VOICE_PREFERENCES: AssistantVoicePreferences =
  Object.freeze({
    enabled: true,
    volume: 0.8,
    rate: 1,
    pitch: 1,
    selectedVoice: null,
    language: "pt",
  });

const LOCALES: Readonly<Record<AssistantVoiceLanguage, string>> = Object.freeze(
  {
    pt: "pt-BR",
    en: "en-US",
    es: "es-ES",
    he: "he-IL",
  },
);

function finiteRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeAssistantVoiceLanguage(
  value: unknown,
): AssistantVoiceLanguage {
  if (typeof value !== "string") return "pt";
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "he" || normalized.startsWith("he-")) return "he";
  return "pt";
}

export function assistantVoiceLocale(language: AssistantVoiceLanguage): string {
  return LOCALES[language];
}

export function cleanAssistantSpeechText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&amp;/giu, " e ")
    .replace(/&lt;/giu, " menor que ")
    .replace(/&gt;/giu, " maior que ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/[\uE000-\uF8FF]/gu, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\p{Emoji_Presentation}/gu, " ")
    .replace(/\p{Regional_Indicator}/gu, " ")
    .replace(/\u200D|\uFE0F/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function resolveAssistantVoice(
  language: AssistantVoiceLanguage,
  voices: readonly AssistantVoiceDescriptor[],
  selectedVoice?: string | null,
): AssistantVoiceDescriptor | null {
  if (selectedVoice) {
    const selected = voices.find((voice) => voice.name === selectedVoice);
    if (selected) return selected;
  }

  const locale = assistantVoiceLocale(language).toLowerCase();
  const prefix = locale.slice(0, 2);
  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ??
    null
  );
}

export function loadAssistantVoicePreferences(
  storage?: AssistantVoiceStorage,
): AssistantVoicePreferences {
  if (!storage) return DEFAULT_ASSISTANT_VOICE_PREFERENCES;

  let parsed: Partial<AssistantVoicePreferences> = {};
  try {
    const serialized = storage.getItem(ASSISTANT_VOICE_STORAGE_KEY);
    if (serialized)
      parsed = JSON.parse(serialized) as Partial<AssistantVoicePreferences>;
  } catch {
    parsed = {};
  }

  const compatibilityEnabled = storage.getItem(ASSISTANT_VOICE_ENABLED_KEY);
  const compatibilitySpeed = storage.getItem(ASSISTANT_VOICE_SPEED_KEY);
  const compatibilityVoice = storage.getItem(ASSISTANT_VOICE_NAME_KEY);
  const compatibilityLanguage = storage.getItem(ASSISTANT_VOICE_LANGUAGE_KEY);

  return Object.freeze({
    enabled:
      compatibilityEnabled === null
        ? parsed.enabled !== false
        : compatibilityEnabled !== "false",
    volume: finiteRange(parsed.volume, 0.8, 0, 1),
    rate: finiteRange(
      compatibilitySpeed ?? parsed.rate,
      DEFAULT_ASSISTANT_VOICE_PREFERENCES.rate,
      0.5,
      2,
    ),
    pitch: finiteRange(parsed.pitch, 1, 0, 2),
    selectedVoice:
      compatibilityVoice?.trim() ||
      (typeof parsed.selectedVoice === "string" && parsed.selectedVoice.trim()
        ? parsed.selectedVoice.trim()
        : null),
    language: normalizeAssistantVoiceLanguage(
      compatibilityLanguage ?? parsed.language,
    ),
  });
}

export function saveAssistantVoicePreferences(
  storage: AssistantVoiceStorage | undefined,
  preferences: AssistantVoicePreferences,
): void {
  if (!storage) return;
  try {
    storage.setItem(ASSISTANT_VOICE_STORAGE_KEY, JSON.stringify(preferences));
    storage.setItem(
      ASSISTANT_VOICE_ENABLED_KEY,
      preferences.enabled ? "true" : "false",
    );
    storage.setItem(ASSISTANT_VOICE_SPEED_KEY, String(preferences.rate));
    storage.setItem(
      ASSISTANT_VOICE_LANGUAGE_KEY,
      assistantVoiceLocale(preferences.language),
    );
    if (preferences.selectedVoice) {
      storage.setItem(ASSISTANT_VOICE_NAME_KEY, preferences.selectedVoice);
    }
  } catch {
    // Storage is optional. Private mode/quota failures must not break the assistant.
  }
}
