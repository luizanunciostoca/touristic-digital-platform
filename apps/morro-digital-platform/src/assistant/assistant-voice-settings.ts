import {
  assistantVoiceLocale,
  normalizeAssistantVoiceLanguage,
  type AssistantVoiceDescriptor,
  type AssistantVoiceLanguage,
  type AssistantVoicePreferences,
} from "@touristic/assistant";

import type { AssistantBrowserVoice } from "./assistant-voice-adapter.js";

export interface AssistantVoiceSettingsOptions {
  readonly document: Document;
  readonly voice: AssistantBrowserVoice | null;
  readonly voices?: () => readonly AssistantVoiceDescriptor[];
}

export interface AssistantVoiceSettingsController {
  refresh(): void;
  destroy(): void;
}

const LANGUAGE_LABELS: Readonly<Record<AssistantVoiceLanguage, string>> =
  Object.freeze({
    pt: "Português",
    en: "English",
    es: "Español",
    he: "עברית",
  });

function getElement<T extends HTMLElement>(
  document: Document,
  id: string,
): T | null {
  const element = document.getElementById(id);
  return element instanceof HTMLElement ? (element as T) : null;
}

function syncSelectedVoice(
  select: HTMLSelectElement,
  preferences: AssistantVoicePreferences,
): void {
  const selected = preferences.selectedVoice;
  if (!selected) {
    select.value = "";
    return;
  }
  const hasOption = Array.from(select.options).some(
    (option) => option.value === selected,
  );
  select.value = hasOption ? selected : "";
}

export function installAssistantVoiceSettings(
  options: AssistantVoiceSettingsOptions,
): AssistantVoiceSettingsController {
  const panel = getElement<HTMLElement>(
    options.document,
    "assistantVoiceSettings",
  );
  const configButton = getElement<HTMLButtonElement>(
    options.document,
    "configButton",
  );
  const closeButton = getElement<HTMLButtonElement>(
    options.document,
    "assistantVoiceSettingsClose",
  );
  const enabled = getElement<HTMLInputElement>(
    options.document,
    "assistantVoiceEnabled",
  );
  const voiceSelect = getElement<HTMLSelectElement>(
    options.document,
    "assistantVoiceSelect",
  );
  const speed = getElement<HTMLInputElement>(
    options.document,
    "assistantVoiceSpeed",
  );
  const speedValue = getElement<HTMLOutputElement>(
    options.document,
    "assistantVoiceSpeedValue",
  );
  const language = getElement<HTMLSelectElement>(
    options.document,
    "assistantVoiceLanguage",
  );

  if (
    !panel ||
    !configButton ||
    !closeButton ||
    !enabled ||
    !voiceSelect ||
    !speed ||
    !speedValue ||
    !language
  ) {
    return Object.freeze({ refresh() {}, destroy() {} });
  }

  let destroyed = false;

  const readVoices = (): readonly AssistantVoiceDescriptor[] =>
    options.voices?.() ?? [];

  const renderVoices = (preferences: AssistantVoicePreferences): void => {
    const voices = readVoices();
    voiceSelect.replaceChildren();

    const automatic = options.document.createElement("option");
    automatic.value = "";
    automatic.textContent = "Automática";
    voiceSelect.appendChild(automatic);

    for (const voice of voices) {
      const option = options.document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})${
        voice.default ? " • padrão" : ""
      }`;
      voiceSelect.appendChild(option);
    }
    syncSelectedVoice(voiceSelect, preferences);
  };

  const refresh = (): void => {
    if (destroyed) return;
    const preferences = options.voice?.getPreferences() ?? {
      enabled: false,
      volume: 0.8,
      rate: 1,
      pitch: 1,
      selectedVoice: null,
      language: normalizeAssistantVoiceLanguage(
        options.document.documentElement.lang,
      ),
    };
    enabled.checked = preferences.enabled;
    speed.value = String(preferences.rate);
    speedValue.value = `${preferences.rate.toFixed(2)}×`;
    language.value = preferences.language;
    renderVoices(preferences);

    const supported = options.voice !== null;
    enabled.disabled = !supported;
    voiceSelect.disabled = !supported;
    speed.disabled = !supported;
    language.disabled = !supported;
    panel.dataset.voiceSupported = supported ? "true" : "false";
  };

  const update = (patch: Partial<AssistantVoicePreferences>): void => {
    if (!options.voice) return;
    options.voice.updatePreferences(patch);
    refresh();
  };

  const open = (): void => {
    refresh();
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    configButton.setAttribute("aria-expanded", "true");
    closeButton.focus();
  };

  const close = (): void => {
    panel.classList.add("hidden");
    panel.setAttribute("aria-hidden", "true");
    configButton.setAttribute("aria-expanded", "false");
  };

  const onConfigClick = (): void => {
    if (panel.classList.contains("hidden")) open();
    else close();
  };
  const onCloseClick = (): void => close();
  const onEnabledChange = (): void => update({ enabled: enabled.checked });
  const onVoiceChange = (): void =>
    update({ selectedVoice: voiceSelect.value || null });
  const onSpeedInput = (): void => {
    const rate = Number(speed.value);
    speedValue.value = `${rate.toFixed(2)}×`;
    update({ rate });
  };
  const onLanguageChange = (): void => {
    const next = normalizeAssistantVoiceLanguage(language.value);
    options.document.documentElement.lang = assistantVoiceLocale(next);
    update({ language: next, selectedVoice: null });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.classList.contains("hidden")) close();
  };

  configButton.setAttribute("aria-controls", "assistantVoiceSettings");
  configButton.setAttribute("aria-expanded", "false");
  configButton.addEventListener("click", onConfigClick);
  closeButton.addEventListener("click", onCloseClick);
  enabled.addEventListener("change", onEnabledChange);
  voiceSelect.addEventListener("change", onVoiceChange);
  speed.addEventListener("input", onSpeedInput);
  language.addEventListener("change", onLanguageChange);
  options.document.addEventListener("keydown", onKeyDown);
  refresh();

  return Object.freeze({
    refresh,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      configButton.removeEventListener("click", onConfigClick);
      closeButton.removeEventListener("click", onCloseClick);
      enabled.removeEventListener("change", onEnabledChange);
      voiceSelect.removeEventListener("change", onVoiceChange);
      speed.removeEventListener("input", onSpeedInput);
      language.removeEventListener("change", onLanguageChange);
      options.document.removeEventListener("keydown", onKeyDown);
    },
  });
}

export { LANGUAGE_LABELS };
