import {
  assistantVoiceLocale,
  cleanAssistantSpeechText,
  loadAssistantVoicePreferences,
  resolveAssistantVoice,
  saveAssistantVoicePreferences,
  type AssistantVoiceLanguage,
  type AssistantVoicePreferences,
  type AssistantVoiceStorage,
} from "@touristic/assistant";

export interface AssistantBrowserVoiceOptions {
  readonly synthesis: Pick<
    SpeechSynthesis,
    | "cancel"
    | "getVoices"
    | "speak"
    | "addEventListener"
    | "removeEventListener"
  >;
  readonly createUtterance: (text: string) => SpeechSynthesisUtterance;
  readonly storage?: AssistantVoiceStorage;
}

export interface AssistantBrowserVoice {
  speak(text: string, language?: AssistantVoiceLanguage): boolean;
  stop(): void;
  getPreferences(): AssistantVoicePreferences;
  updatePreferences(
    patch: Partial<AssistantVoicePreferences>,
  ): AssistantVoicePreferences;
  destroy(): void;
}

function voiceDescriptors(voices: readonly SpeechSynthesisVoice[]) {
  return voices.map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    default: voice.default,
  }));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createAssistantBrowserVoice(
  options: AssistantBrowserVoiceOptions,
): AssistantBrowserVoice {
  let preferences = loadAssistantVoicePreferences(options.storage);
  let destroyed = false;

  const persist = (): void => {
    saveAssistantVoicePreferences(options.storage, preferences);
  };

  const selectVoice = (
    language: AssistantVoiceLanguage,
  ): SpeechSynthesisVoice | null => {
    const voices = options.synthesis.getVoices();
    const descriptor = resolveAssistantVoice(
      language,
      voiceDescriptors(voices),
      preferences.language === language ? preferences.selectedVoice : null,
    );
    if (!descriptor) return null;
    return voices.find((voice) => voice.name === descriptor.name) ?? null;
  };

  const onVoicesChanged = (): void => {
    if (destroyed || preferences.selectedVoice) return;
    const voice = selectVoice(preferences.language);
    if (!voice) return;
    preferences = Object.freeze({
      ...preferences,
      selectedVoice: voice.name,
    });
    persist();
  };

  options.synthesis.addEventListener("voiceschanged", onVoicesChanged);
  onVoicesChanged();

  return Object.freeze({
    speak(text: string, language = preferences.language): boolean {
      if (destroyed || !preferences.enabled) return false;
      const cleanText = cleanAssistantSpeechText(text);
      if (!cleanText) return false;

      const utterance = options.createUtterance(cleanText);
      utterance.lang = assistantVoiceLocale(language);
      utterance.volume = clamp(preferences.volume, 0, 1);
      utterance.rate = clamp(preferences.rate, 0.5, 2);
      utterance.pitch = clamp(preferences.pitch, 0, 2);
      const voice = selectVoice(language);
      if (voice) utterance.voice = voice;

      options.synthesis.cancel();
      options.synthesis.speak(utterance);
      return true;
    },
    stop(): void {
      options.synthesis.cancel();
    },
    getPreferences(): AssistantVoicePreferences {
      return preferences;
    },
    updatePreferences(
      patch: Partial<AssistantVoicePreferences>,
    ): AssistantVoicePreferences {
      preferences = Object.freeze({
        ...preferences,
        ...patch,
        volume: clamp(patch.volume ?? preferences.volume, 0, 1),
        rate: clamp(patch.rate ?? preferences.rate, 0.5, 2),
        pitch: clamp(patch.pitch ?? preferences.pitch, 0, 2),
      });
      persist();
      return preferences;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      options.synthesis.cancel();
      options.synthesis.removeEventListener("voiceschanged", onVoicesChanged);
    },
  });
}
