import { afterEach, describe, expect, it, vi } from "vitest";

import {
  installAssistantVoiceSettings,
  LANGUAGE_LABELS,
} from "./assistant-voice-settings.js";

describe("assistant voice settings", () => {
  it("preserves the four supported language labels", () => {
    expect(LANGUAGE_LABELS).toEqual({
      pt: "Português",
      en: "English",
      es: "Español",
      he: "עברית",
    });
  });
});

// Minimal DOM boundary: the installed controller and all its event handlers are real.
class SettingsElement extends EventTarget {
  readonly attributes = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly children: SettingsElement[] = [];
  readonly classList = {
    add: (value: string) => this.classes.add(value),
    remove: (value: string) => this.classes.delete(value),
    contains: (value: string) => this.classes.has(value),
  };
  value = "";
  textContent = "";
  checked = false;
  disabled = false;
  isConnected = true;
  constructor(readonly owner: SettingsDocument) {
    super();
  }
  get options() {
    return this.children;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  replaceChildren() {
    this.children.length = 0;
  }
  appendChild(child: SettingsElement) {
    this.children.push(child);
    return child;
  }
  contains(node: unknown): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  focus() {
    this.owner.activeElement = this;
  }
}
class SettingsDocument extends EventTarget {
  readonly documentElement = { lang: "pt-BR" };
  readonly elements = new Map<string, SettingsElement>();
  activeElement: SettingsElement | null = null;
  createElement() {
    return new SettingsElement(this);
  }
  getElementById(id: string) {
    return this.elements.get(id) ?? null;
  }
  querySelector() {
    return null;
  }
}
function installSettings() {
  vi.stubGlobal("HTMLElement", SettingsElement);
  const document = new SettingsDocument();
  for (const id of [
    "assistantVoiceSettings",
    "configButton",
    "assistantVoiceSettingsClose",
    "assistantVoiceEnabled",
    "assistantVoiceSelect",
    "assistantVoiceSpeed",
    "assistantVoiceSpeedValue",
    "assistantVoiceLanguage",
  ]) {
    document.elements.set(id, document.createElement());
  }
  const panel = document.getElementById("assistantVoiceSettings")!;
  panel.classList.add("hidden");
  const config = document.getElementById("configButton")!;
  const close = document.getElementById("assistantVoiceSettingsClose")!;
  panel.appendChild(close);
  const controller = installAssistantVoiceSettings({
    document: document as unknown as Document,
    voice: null,
  });
  const click = (element: SettingsElement) =>
    element.dispatchEvent(new Event("click"));
  const escape = () => {
    const event = new Event("keydown");
    Object.defineProperty(event, "key", { value: "Escape" });
    document.dispatchEvent(event);
  };
  return { document, panel, config, close, controller, click, escape };
}
describe("voice settings focus lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns keyboard focus to the opener after Escape", () => {
    const c = installSettings();
    c.config.focus();
    c.click(c.config);
    expect(c.document.activeElement).toBe(c.close);
    c.escape();
    expect(c.panel.classList.contains("hidden")).toBe(true);
    expect(c.document.activeElement).toBe(c.config);
    expect(c.config.getAttribute("aria-expanded")).toBe("false");
    c.controller.destroy();
  });
  it("returns focus after the close button hides its own focused control", () => {
    const c = installSettings();
    c.click(c.config);
    c.click(c.close);
    expect(c.document.activeElement).toBe(c.config);
    c.controller.destroy();
  });
  it("does not steal focus from a control outside the panel", () => {
    const c = installSettings();
    c.click(c.config);
    const outside = c.document.createElement();
    outside.focus();
    c.escape();
    expect(c.document.activeElement).toBe(outside);
    c.controller.destroy();
  });
  it("does not refocus an unavailable opener", () => {
    const c = installSettings();
    c.click(c.config);
    c.config.isConnected = false;
    c.escape();
    expect(c.document.activeElement).not.toBe(c.config);
    c.controller.destroy();
  });
  it("does not refocus a disabled opener", () => {
    const c = installSettings();
    c.click(c.config);
    c.config.disabled = true;
    c.escape();
    expect(c.document.activeElement).not.toBe(c.config);
    c.controller.destroy();
  });
  it("ignores Escape while the panel is already closed", () => {
    const c = installSettings();
    const outside = c.document.createElement();
    outside.focus();
    c.escape();
    expect(c.document.activeElement).toBe(outside);
    c.controller.destroy();
  });
});
