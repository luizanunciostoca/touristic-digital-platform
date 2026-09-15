export type NavigationSpeechLanguage = "pt" | "en" | "es" | "he";

export interface NavigationSpeech {
  speak(text: string): boolean;
  stop(): void;
  language(): NavigationSpeechLanguage;
  destroy(): void;
}

export type NavigationSpeechMessage =
  "approaching" | "arrived" | "recalculating";

const LOCALES: Readonly<Record<NavigationSpeechLanguage, string>> =
  Object.freeze({
    pt: "pt-BR",
    en: "en-US",
    es: "es-ES",
    he: "he-IL",
  });

const COPY: Readonly<
  Record<NavigationSpeechLanguage, Record<NavigationSpeechMessage, string>>
> = Object.freeze({
  pt: Object.freeze({
    approaching: "Você está chegando ao destino.",
    arrived: "Você chegou ao destino.",
    recalculating: "Recalculando a rota.",
  }),
  en: Object.freeze({
    approaching: "You are approaching your destination.",
    arrived: "You have arrived at your destination.",
    recalculating: "Recalculating the route.",
  }),
  es: Object.freeze({
    approaching: "Estás llegando a tu destino.",
    arrived: "Has llegado a tu destino.",
    recalculating: "Recalculando la ruta.",
  }),
  he: Object.freeze({
    approaching: "אתה מתקרב ליעד.",
    arrived: "הגעת ליעד.",
    recalculating: "מחשב את המסלול מחדש.",
  }),
});

interface StoredVoicePreferences {
  readonly enabled?: boolean;
  readonly volume?: number;
  readonly rate?: number;
  readonly pitch?: number;
  readonly selectedVoice?: string | null;
  readonly language?: string;
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

export function normalizeNavigationSpeechLanguage(
  value: unknown,
): NavigationSpeechLanguage {
  if (typeof value !== "string") return "pt";
  const normalized = value.trim().toLowerCase();
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "he" || normalized.startsWith("he-")) return "he";
  return "pt";
}

export function navigationSpeechMessage(
  language: NavigationSpeechLanguage,
  message: NavigationSpeechMessage,
): string {
  return COPY[language][message];
}

function cleanSpeechText(value: string): string {
  return value
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function safeStorage(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}

function parseStoredPreferences(
  storage: Storage | null,
): StoredVoicePreferences {
  if (!storage) return {};
  try {
    const serialized = storage.getItem("voiceAssistant");
    if (!serialized) return {};
    const parsed = JSON.parse(serialized) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as StoredVoicePreferences)
      : {};
  } catch {
    return {};
  }
}

function resolveLanguage(
  document: Document,
  storage: Storage | null,
  stored: StoredVoicePreferences,
): NavigationSpeechLanguage {
  return normalizeNavigationSpeechLanguage(
    storage?.getItem("voice-language") ??
      stored.language ??
      document.documentElement.lang,
  );
}

function resolveVoice(
  synthesis: SpeechSynthesis,
  language: NavigationSpeechLanguage,
  selectedVoice: string | null,
): SpeechSynthesisVoice | null {
  const voices = synthesis.getVoices();
  if (selectedVoice) {
    const selected = voices.find((voice) => voice.name === selectedVoice);
    if (selected) return selected;
  }
  const locale = LOCALES[language].toLowerCase();
  const prefix = locale.slice(0, 2);
  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ??
    null
  );
}

export function createNavigationSpeech(document: Document): NavigationSpeech {
  const view = document.defaultView;
  const synthesis = view?.speechSynthesis ?? null;
  const Utterance = view?.SpeechSynthesisUtterance;
  const storage = safeStorage(document);
  let destroyed = false;

  function language(): NavigationSpeechLanguage {
    return resolveLanguage(document, storage, parseStoredPreferences(storage));
  }

  return Object.freeze({
    speak(text: string): boolean {
      if (destroyed || !synthesis || typeof Utterance !== "function") {
        return false;
      }
      const stored = parseStoredPreferences(storage);
      const compatibilityEnabled = storage?.getItem("voice-enabled");
      const enabled =
        compatibilityEnabled === null
          ? stored.enabled !== false
          : compatibilityEnabled !== "false";
      if (!enabled) return false;

      const cleanText = cleanSpeechText(text);
      if (!cleanText) return false;
      const selectedLanguage = resolveLanguage(document, storage, stored);
      const utterance = new Utterance(cleanText);
      utterance.lang = LOCALES[selectedLanguage];
      utterance.volume = clamp(stored.volume, 0.8, 0, 1);
      utterance.rate = clamp(
        storage?.getItem("voice-speed") ?? stored.rate,
        1,
        0.5,
        2,
      );
      utterance.pitch = clamp(stored.pitch, 1, 0, 2);
      const selectedVoice =
        storage?.getItem("assistant-voice")?.trim() ||
        (typeof stored.selectedVoice === "string"
          ? stored.selectedVoice.trim()
          : "");
      const voice = resolveVoice(
        synthesis,
        selectedLanguage,
        selectedVoice || null,
      );
      if (voice) utterance.voice = voice;
      synthesis.cancel();
      synthesis.speak(utterance);
      return true;
    },
    stop(): void {
      synthesis?.cancel();
    },
    language,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      synthesis?.cancel();
    },
  });
}
