import { describe, expect, it } from "vitest";
import {
  assistantVoiceLocale,
  cleanAssistantSpeechText,
  loadAssistantVoicePreferences,
  resolveAssistantVoice,
  saveAssistantVoicePreferences,
  type AssistantVoiceStorage,
} from "./voice-synthesis.js";

function memoryStorage(initial: Record<string, string> = {}): AssistantVoiceStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("assistant voice synthesis contract", () => {
  it("maps all supported languages to the V1 locales", () => {
    expect(assistantVoiceLocale("pt")).toBe("pt-BR");
    expect(assistantVoiceLocale("en")).toBe("en-US");
    expect(assistantVoiceLocale("es")).toBe("es-ES");
    expect(assistantVoiceLocale("he")).toBe("he-IL");
  });

  it("cleans markup, emoji and legacy entities before speech", () => {
    expect(cleanAssistantSpeechText("<b>Olá</b> 😄 &amp; bem-vindo&nbsp;!")).toBe(
      "Olá e bem-vindo !",
    );
  });

  it("prefers the saved voice, then exact locale, then language prefix", () => {
    const voices = [
      { name: "English", lang: "en-GB" },
      { name: "Português", lang: "pt-BR" },
      { name: "Hebrew", lang: "he-IL" },
    ];
    expect(resolveAssistantVoice("pt", voices)?.name).toBe("Português");
    expect(resolveAssistantVoice("en", voices)?.name).toBe("English");
    expect(resolveAssistantVoice("pt", voices, "Hebrew")?.name).toBe("Hebrew");
  });

  it("loads legacy storage keys with precedence over the aggregate object", () => {
    const storage = memoryStorage({
      voiceAssistant: JSON.stringify({
        enabled: true,
        volume: 0.5,
        rate: 0.7,
        selectedVoice: "Old voice",
        language: "pt",
      }),
      "voice-enabled": "false",
      "voice-speed": "1.25",
      "assistant-voice": "Saved voice",
      "voice-language": "es-ES",
    });

    expect(loadAssistantVoicePreferences(storage)).toEqual({
      enabled: false,
      volume: 0.5,
      rate: 1.25,
      pitch: 1,
      selectedVoice: "Saved voice",
      language: "es",
    });
  });

  it("persists the aggregate state and V1 compatibility keys", () => {
    const storage = memoryStorage();
    saveAssistantVoicePreferences(storage, {
      enabled: true,
      volume: 0.9,
      rate: 1.1,
      pitch: 1,
      selectedVoice: "Português",
      language: "pt",
    });

    expect(storage.getItem("voice-enabled")).toBe("true");
    expect(storage.getItem("voice-speed")).toBe("1.1");
    expect(storage.getItem("assistant-voice")).toBe("Português");
    expect(storage.getItem("voice-language")).toBe("pt-BR");
  });
});
