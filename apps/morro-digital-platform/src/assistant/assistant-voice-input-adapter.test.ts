import { describe, expect, it, vi } from "vitest";
import {
  createAssistantBrowserVoiceInput,
  type AssistantSpeechRecognitionInstance,
} from "./assistant-voice-input-adapter.js";

class FakeRecognition implements AssistantSpeechRecognitionInstance {
  static latest: FakeRecognition | null = null;
  continuous = true;
  interimResults = true;
  lang = "";
  onresult: AssistantSpeechRecognitionInstance["onresult"] = null;
  onerror: AssistantSpeechRecognitionInstance["onerror"] = null;
  onend: AssistantSpeechRecognitionInstance["onend"] = null;
  readonly start = vi.fn();
  readonly stop = vi.fn();

  constructor() {
    FakeRecognition.latest = this;
  }
}

describe("createAssistantBrowserVoiceInput", () => {
  it("configures one-shot recognition for the selected assistant locale", () => {
    const input = createAssistantBrowserVoiceInput({
      Recognition: FakeRecognition,
      language: "he",
      onResult: vi.fn(),
    });
    const recognition = FakeRecognition.latest;
    expect(recognition).not.toBeNull();
    expect(recognition?.continuous).toBe(false);
    expect(recognition?.interimResults).toBe(false);
    expect(recognition?.lang).toBe("he-IL");
    expect(input.start()).toBe(true);
    expect(recognition?.start).toHaveBeenCalledOnce();
  });

  it("forwards trimmed transcript, confidence and listening lifecycle", () => {
    const onResult = vi.fn();
    const onListeningChange = vi.fn();
    const input = createAssistantBrowserVoiceInput({
      Recognition: FakeRecognition,
      language: "pt",
      onResult,
      onListeningChange,
    });
    const recognition = FakeRecognition.latest;
    input.start();
    recognition?.onresult?.({
      results: {
        length: 1,
        0: { 0: { transcript: "  onde fica o Farol?  ", confidence: 0.82 } },
      },
    });
    recognition?.onend?.();

    expect(onResult).toHaveBeenCalledWith("onde fica o Farol?", 0.82);
    expect(onListeningChange).toHaveBeenNthCalledWith(1, true);
    expect(onListeningChange).toHaveBeenNthCalledWith(2, false);
    expect(input.isListening()).toBe(false);
  });

  it("fails safely and reports recognition errors", () => {
    const onError = vi.fn();
    const input = createAssistantBrowserVoiceInput({
      Recognition: FakeRecognition,
      language: "en",
      onResult: vi.fn(),
      onError,
    });
    const recognition = FakeRecognition.latest;
    input.start();
    recognition?.onerror?.({ error: "not-allowed" });

    expect(onError).toHaveBeenCalledWith("not-allowed");
    expect(input.isListening()).toBe(false);
  });

  it("updates recognition locale and stops listening on destroy", () => {
    const input = createAssistantBrowserVoiceInput({
      Recognition: FakeRecognition,
      language: "pt",
      onResult: vi.fn(),
    });
    const recognition = FakeRecognition.latest;
    input.setLanguage("es");
    expect(recognition?.lang).toBe("es-ES");

    input.start();
    input.destroy();
    expect(recognition?.stop).toHaveBeenCalledOnce();
    expect(input.isListening()).toBe(false);
    expect(input.start()).toBe(false);
  });
});
