import { describe, expect, it, vi } from "vitest";
import { createAssistantBrowserVoice } from "./assistant-voice-adapter.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function fakeVoice(name: string, lang: string): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name,
    voiceURI: name,
  };
}

describe("createAssistantBrowserVoice", () => {
  it("speaks sanitized text using the matching locale voice", () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    const voices = [fakeVoice("Português", "pt-BR"), fakeVoice("English", "en-US")];
    const synthesis = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => voices),
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => utterances.push(utterance)),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const voice = createAssistantBrowserVoice({
      synthesis,
      storage: memoryStorage(),
      createUtterance: (text) =>
        ({ text, lang: "", volume: 1, rate: 1, pitch: 1, voice: null }) as SpeechSynthesisUtterance,
    });

    expect(voice.speak("<b>Hello</b> 🌴", "en")).toBe(true);
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(synthesis.speak).toHaveBeenCalledOnce();
    expect(utterances[0]?.text).toBe("Hello");
    expect(utterances[0]?.lang).toBe("en-US");
    expect(utterances[0]?.voice?.name).toBe("English");
  });

  it("honors the legacy voice-enabled preference", () => {
    const synthesis = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]),
      speak: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const voice = createAssistantBrowserVoice({
      synthesis,
      storage: memoryStorage({ "voice-enabled": "false" }),
      createUtterance: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    expect(voice.speak("Olá", "pt")).toBe(false);
    expect(synthesis.speak).not.toHaveBeenCalled();
  });

  it("persists updated language, speed and enabled state", () => {
    const storage = memoryStorage();
    const synthesis = {
      cancel: vi.fn(),
      getVoices: vi.fn(() => [] as SpeechSynthesisVoice[]),
      speak: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const voice = createAssistantBrowserVoice({
      synthesis,
      storage,
      createUtterance: (text) => ({ text }) as SpeechSynthesisUtterance,
    });

    const preferences = voice.updatePreferences({
      enabled: false,
      rate: 1.25,
      language: "he",
    });

    expect(preferences.enabled).toBe(false);
    expect(preferences.rate).toBe(1.25);
    expect(preferences.language).toBe("he");
    expect(storage.getItem("voice-enabled")).toBe("false");
    expect(storage.getItem("voice-speed")).toBe("1.25");
    expect(storage.getItem("voice-language")).toBe("he-IL");
  });
});
