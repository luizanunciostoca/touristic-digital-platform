import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";

import type { AssistantBrowserVoice } from "./assistant-voice-adapter.js";
import { installAssistantVoiceSettings } from "./assistant-voice-settings.js";

function createDocument(): Document {
  const dom = new JSDOM(`<!doctype html><html lang="pt-BR"><body>
    <button id="configButton"></button>
    <section id="assistantVoiceSettings" class="hidden" aria-hidden="true">
      <button id="assistantVoiceSettingsClose"></button>
      <input id="assistantVoiceEnabled" type="checkbox" />
      <select id="assistantVoiceSelect"></select>
      <input id="assistantVoiceSpeed" type="range" min="0.5" max="2" step="0.05" />
      <output id="assistantVoiceSpeedValue"></output>
      <select id="assistantVoiceLanguage">
        <option value="pt">Português</option>
        <option value="en">English</option>
        <option value="es">Español</option>
        <option value="he">עברית</option>
      </select>
    </section>
  </body></html>`);
  return dom.window.document;
}

function fakeVoice(): AssistantBrowserVoice {
  let preferences = {
    enabled: true,
    volume: 0.8,
    rate: 1,
    pitch: 1,
    selectedVoice: null,
    language: "pt" as const,
  };
  return {
    speak: vi.fn(() => true),
    stop: vi.fn(),
    getPreferences: () => preferences,
    updatePreferences: vi.fn((patch) => {
      preferences = { ...preferences, ...patch };
      return preferences;
    }),
    destroy: vi.fn(),
  };
}

describe("installAssistantVoiceSettings", () => {
  it("opens from configButton and renders persisted preferences", () => {
    const document = createDocument();
    const voice = fakeVoice();
    const controller = installAssistantVoiceSettings({
      document,
      voice,
      voices: () => [
        { name: "Português", lang: "pt-BR", default: true },
        { name: "English", lang: "en-US" },
      ],
    });

    document.getElementById("configButton")?.click();

    expect(document.getElementById("assistantVoiceSettings")?.classList.contains("hidden")).toBe(false);
    expect(document.getElementById("configButton")?.getAttribute("aria-expanded")).toBe("true");
    expect((document.getElementById("assistantVoiceEnabled") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("assistantVoiceSelect") as HTMLSelectElement).options).toHaveLength(3);
    expect((document.getElementById("assistantVoiceSpeedValue") as HTMLOutputElement).value).toBe("1.00×");

    controller.destroy();
  });

  it("updates enabled, rate, voice and language through the shared adapter", () => {
    const document = createDocument();
    const voice = fakeVoice();
    installAssistantVoiceSettings({
      document,
      voice,
      voices: () => [
        { name: "Português", lang: "pt-BR" },
        { name: "English", lang: "en-US" },
      ],
    });

    const enabled = document.getElementById("assistantVoiceEnabled") as HTMLInputElement;
    enabled.checked = false;
    enabled.dispatchEvent(new document.defaultView!.Event("change", { bubbles: true }));

    const speed = document.getElementById("assistantVoiceSpeed") as HTMLInputElement;
    speed.value = "1.25";
    speed.dispatchEvent(new document.defaultView!.Event("input", { bubbles: true }));

    const voiceSelect = document.getElementById("assistantVoiceSelect") as HTMLSelectElement;
    voiceSelect.value = "English";
    voiceSelect.dispatchEvent(new document.defaultView!.Event("change", { bubbles: true }));

    const language = document.getElementById("assistantVoiceLanguage") as HTMLSelectElement;
    language.value = "he";
    language.dispatchEvent(new document.defaultView!.Event("change", { bubbles: true }));

    expect(voice.updatePreferences).toHaveBeenCalledWith({ enabled: false });
    expect(voice.updatePreferences).toHaveBeenCalledWith({ rate: 1.25 });
    expect(voice.updatePreferences).toHaveBeenCalledWith({ selectedVoice: "English" });
    expect(voice.updatePreferences).toHaveBeenCalledWith({ language: "he", selectedVoice: null });
    expect(document.documentElement.lang).toBe("he-IL");
  });

  it("disables controls when speech synthesis is unavailable", () => {
    const document = createDocument();
    installAssistantVoiceSettings({ document, voice: null });

    expect((document.getElementById("assistantVoiceEnabled") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("assistantVoiceSelect") as HTMLSelectElement).disabled).toBe(true);
    expect((document.getElementById("assistantVoiceSpeed") as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById("assistantVoiceLanguage") as HTMLSelectElement).disabled).toBe(true);
    expect(document.getElementById("assistantVoiceSettings")?.dataset.voiceSupported).toBe("false");
  });
});
