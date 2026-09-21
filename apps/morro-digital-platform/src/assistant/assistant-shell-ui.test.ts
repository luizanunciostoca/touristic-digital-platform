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
  const contained = new Set<unknown>();
  let focusCount = 0;
  return {
    classList: createClassList(initialClasses),
    attributes,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
    addEventListener(type: string, listener: EventListener) {
      listeners.set(type, listener);
    },
    removeEventListener(type: string) {
      listeners.delete(type);
    },
    dispatch(type: string) {
      listeners.get(type)?.({ type } as Event);
    },
    querySelector(selector: string) {
      void selector;
      return null as unknown;
    },
    contains(element: unknown) {
      return contained.has(element);
    },
    contain(element: unknown) {
      contained.add(element);
    },
    focus() {
      focusCount += 1;
    },
    get focusCount() {
      return focusCount;
    },
    textContent: "",
  };
}

function fixture() {
  const minimize = createElement();
  const assistant = createElement(["assistant-modal", "hidden"]);
  assistant.querySelector = (selector: string) =>
    selector === ".minimize-button" ? minimize : null;
  const composer = createElement();
  const input = createElement();
  const carousel = createElement();
  const followUp = createElement();
  const status = createElement();
  const body = createElement();
  const external = createElement();
  const documentListeners = new Map<string, EventListener>();
  const scheduled: Array<() => void> = [];
  composer.contain(input);

  const document = {
    body,
    documentElement: { lang: "pt-BR" },
    activeElement: input,
    defaultView: {
      setTimeout(callback: () => void) {
        scheduled.push(callback);
        return scheduled.length;
      },
    } as unknown as Window,
    getElementById(id: string) {
      if (id === "assistant-messages") return assistant;
      if (id === "assistantInput") return input;
      if (id === "assistant-input-area") return composer;
      if (id === "assistant-dialog-status") return status;
      return null;
    },
    querySelector(selector: string) {
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
  } as unknown as Document;

  return {
    document,
    assistant,
    composer,
    input,
    minimize,
    carousel,
    followUp,
    body,
    status,
    external,
    scheduled,
    dispatchKeydown(key: string) {
      documentListeners.get("keydown")?.({
        key,
        preventDefault() {},
        stopPropagation() {},
      } as unknown as Event);
    },
  };
}

describe("assistant shell UI", () => {
  it("starts hidden and exposes shell readiness with synchronized accessibility state", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    expect(shell.isVisible()).toBe(false);
    expect(view.assistant.attributes.get("aria-hidden")).toBe("true");
    expect(view.input.attributes.get("aria-controls")).toBe(
      "assistant-messages",
    );
    expect(view.input.attributes.get("aria-expanded")).toBe("false");
    expect(view.composer.attributes.get("data-assistant-shell-ready")).toBe(
      "true",
    );
  });

  it("shows and hides the modal with V1 body, button and associated-content states", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    expect(shell.show()).toBe(true);
    expect(shell.isVisible()).toBe(true);
    expect(view.body.classList.contains("assistant-modal-open")).toBe(true);
    expect(view.input.attributes.get("aria-expanded")).toBe("true");
    expect(view.assistant.attributes.get("aria-hidden")).toBe("false");

    expect(shell.hide()).toBe(true);
    expect(shell.isVisible()).toBe(false);
    expect(view.body.classList.contains("assistant-modal-open")).toBe(false);
    expect(view.input.attributes.get("aria-expanded")).toBe("false");
    expect(view.carousel.classList.contains("hidden")).toBe(true);
    expect(view.followUp.classList.contains("hidden")).toBe(true);
  });

  it("opens the Assistant from the canonical composer without scheduling a late refocus", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    view.composer.dispatch("focusin");

    expect(shell.isVisible()).toBe(true);
    expect(view.body.classList.contains("assistant-modal-open")).toBe(true);
    expect(view.input.attributes.get("aria-expanded")).toBe("true");
    expect(view.scheduled).toHaveLength(0);
    expect(view.input.focusCount).toBe(0);

    view.composer.dispatch("focusin");
    expect(view.scheduled).toHaveLength(0);
  });

  it("keeps delayed input focus for programmatic Assistant openings", () => {
    const view = fixture();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.external;
    const shell = installAssistantShellUi({
      document: view.document,
      focusDelayMs: 25,
    });

    expect(shell.show()).toBe(true);
    expect(view.scheduled).toHaveLength(1);
    expect(view.input.focusCount).toBe(0);

    view.scheduled[0]?.();
    expect(view.input.focusCount).toBe(1);
  });

  it("publishes loading and error state through the accessible shell contract", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    shell.setState("loading");
    expect(view.assistant.attributes.get("data-assistant-state")).toBe(
      "loading",
    );
    expect(view.assistant.attributes.get("aria-busy")).toBe("true");
    expect(view.status.textContent).toBe("Preparando resposta…");

    shell.setState("error");
    expect(view.assistant.attributes.get("aria-busy")).toBe("false");
    expect(view.status.textContent).toBe(
      "Não foi possível concluir a resposta.",
    );
  });

  it("keeps the assistant visible while the tutorial is active", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });
    shell.show();
    view.body.classList.add("tour-active");

    expect(shell.hide()).toBe(false);
    expect(shell.isVisible()).toBe(true);
    expect(view.input.attributes.get("aria-expanded")).toBe("true");
  });

  it("closes with Escape, restores prior focus and cancels any effective late refocus", () => {
    const view = fixture();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.external;
    const shell = installAssistantShellUi({ document: view.document });
    shell.show();

    expect(view.scheduled).toHaveLength(1);
    view.dispatchKeydown("Escape");

    expect(shell.isVisible()).toBe(false);
    expect(view.external.focusCount).toBe(1);
    view.scheduled[0]?.();
    expect(view.input.focusCount).toBe(0);
  });

  it("removes the readiness marker when destroyed", () => {
    const view = fixture();
    const shell = installAssistantShellUi({ document: view.document });

    shell.destroy();

    expect(view.composer.attributes.has("data-assistant-shell-ready")).toBe(
      false,
    );
  });
});
