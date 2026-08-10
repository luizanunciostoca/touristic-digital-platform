import { describe, expect, it } from "vitest";

import { installAssistantShellUi } from "./assistant-shell-ui.js";

function createClassList(initial: string[] = []) {
  const values = new Set(initial);
  return {
    add(...tokens: string[]) {
      for (const token of tokens) values.add(token);
    },
    remove(...tokens: string[]) {
      for (const token of tokens) values.delete(token);
    },
    contains(token: string) {
      return values.has(token);
    },
    toggle(token: string, force?: boolean) {
      const enabled = force ?? !values.has(token);
      if (enabled) values.add(token);
      else values.delete(token);
      return enabled;
    },
  };
}

function createElement(initialClasses: string[] = []) {
  const listeners = new Map<string, EventListener>();
  const attributes = new Map<string, string>();
  return {
    classList: createClassList(initialClasses),
    attributes,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
    dispatch(type: string, event: Event) {
      listeners.get(type)?.(event);
    },
    querySelector: (_selector: string) => null as unknown,
  };
}

function fixture() {
  const minimize = createElement();
  const assistant = createElement(["assistant-modal", "hidden"]);
  assistant.querySelector = (selector: string) =>
    selector === ".minimize-button" ? minimize : null;
  const quickAction = createElement();
  const input = createElement();
  const carousel = createElement();
  const followUp = createElement();
  const body = createElement();
  const documentListeners = new Map<string, EventListener>();

  const document = {
    body,
    defaultView: null,
    getElementById(id: string) {
      if (id === "assistant-messages") return assistant;
      if (id === "assistantInput") return input;
      return null;
    },
    querySelector(selector: string) {
      if (selector === ".quick-actions .action-button.primary") {
        return quickAction;
      }
      if (selector === ".carousel-container") return carousel;
      if (selector === ".carousel-follow-up") return followUp;
      return null;
    },
    addEventListener(type: string, listener: EventListener) {
      documentListeners.set(type, listener);
    },
    removeEventListener(type: string) {
      documentListeners.delete(type);
    },
    dispatch(type: string, event: Event) {
      documentListeners.get(type)?.(event);
    },
  } as unknown as Document;

  return {
    document,
    assistant,
    quickAction,
    minimize,
    carousel,
    followUp,
    body,
  };
}

describe("assistant shell UI", () => {
  it("starts hidden and synchronizes the quick-action accessibility state", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    expect(shell.isVisible()).toBe(false);
    expect(view.assistant.attributes.get("aria-hidden")).toBe("true");
    expect(view.quickAction.attributes.get("aria-controls")).toBe(
      "assistant-messages",
    );
    expect(view.quickAction.attributes.get("aria-expanded")).toBe("false");
  });

  it("shows and hides the modal with V1 body, button and associated-content states", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    expect(shell.show()).toBe(true);
    expect(shell.isVisible()).toBe(true);
    expect(view.body.classList.contains("assistant-modal-open")).toBe(true);
    expect(view.quickAction.classList.contains("active")).toBe(true);
    expect(view.quickAction.attributes.get("aria-expanded")).toBe("true");
    expect(view.assistant.attributes.get("aria-hidden")).toBe("false");

    expect(shell.hide()).toBe(true);
    expect(shell.isVisible()).toBe(false);
    expect(view.body.classList.contains("assistant-modal-open")).toBe(false);
    expect(view.quickAction.classList.contains("active")).toBe(false);
    expect(view.quickAction.attributes.get("aria-expanded")).toBe("false");
    expect(view.carousel.classList.contains("hidden")).toBe(true);
    expect(view.followUp.classList.contains("hidden")).toBe(true);
  });

  it("keeps the assistant visible while the tutorial is active", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });
    shell.show();
    view.body.classList.add("tour-active");

    expect(shell.hide()).toBe(false);
    expect(shell.isVisible()).toBe(true);
    expect(view.quickAction.attributes.get("aria-expanded")).toBe("true");
  });

  it("closes a visible assistant with Escape outside the tutorial", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });
    shell.show();

    view.document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape" }),
    );

    expect(shell.isVisible()).toBe(false);
  });
});
