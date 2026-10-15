import { readFile } from "node:fs/promises";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { installAssistantShellUi } from "./assistant-shell-ui.js";
import {
  assistantListeningUiState,
  assistantUiStateStatus,
} from "./assistant-ui-state.js";

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
    getAttribute(name: string) {
      return attributes.get(name) ?? null;
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
    dataset: {} as Record<string, string>,
    parentElement: null as { id?: string } | null,
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
  const cancelledTimers = new Set<number>();
  const localeObservers: Array<{ notify(): void; connected: boolean }> = [];
  const observedLocaleOptions: MutationObserverInit[] = [];
  composer.contain(input);

  const document = {
    body,
    documentElement: { lang: "pt-BR" },
    activeElement: input,
    defaultView: {
      MutationObserver: class {
        connected = false;
        constructor(readonly notify: () => void) {
          localeObservers.push(this);
        }
        observe(_target: Node, settings: MutationObserverInit) {
          this.connected = true;
          observedLocaleOptions.push(settings);
        }
        disconnect() {
          this.connected = false;
        }
      },
      setTimeout(callback: () => void) {
        const id = scheduled.length + 1;
        scheduled.push(() => {
          if (!cancelledTimers.has(id)) callback();
        });
        return id;
      },
      clearTimeout(id: number) {
        cancelledTimers.add(id);
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
    cancelledTimers,
    localeObservers,
    observedLocaleOptions,
    changeLocale(locale: string) {
      document.documentElement.lang = locale;
      for (const observer of localeObservers)
        if (observer.connected) observer.notify();
    },
    dispatchUiState(state: string) {
      documentListeners.get("morro:assistant-ui-state")?.(
        new CustomEvent("morro:assistant-ui-state", { detail: { state } }),
      );
    },
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

  it("does not reschedule focus when an already-visible Assistant receives another open request", () => {
    const view = fixture();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.external;
    const shell = installAssistantShellUi({ document: view.document });

    shell.show();
    expect(view.scheduled).toHaveLength(1);

    shell.show();
    expect(view.scheduled).toHaveLength(1);
  });

  it("cancels a pending programmatic refocus when the user reaches the composer", () => {
    const view = fixture();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.external;
    const shell = installAssistantShellUi({ document: view.document });

    shell.show();
    expect(view.scheduled).toHaveLength(1);

    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.input;
    view.composer.dispatch("focusin");
    view.scheduled[0]?.();

    expect(view.input.focusCount).toBe(0);
    expect(view.cancelledTimers.has(1)).toBe(true);
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

  it("does not steal focus if another surface becomes active before delayed focus", () => {
    const view = fixture();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.external;
    const shell = installAssistantShellUi({ document: view.document });

    shell.show();
    (view.document as unknown as { activeElement: unknown }).activeElement =
      view.body;
    view.scheduled[0]?.();

    expect(view.input.focusCount).toBe(0);
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

  it("keeps the message region visible on Escape when the unified dock owns the Assistant", () => {
    const view = fixture();
    view.body.dataset.mdUnifiedDock = "true";
    const shell = installAssistantShellUi({ document: view.document });
    shell.show();
    shell.setState("loading");

    view.dispatchKeydown("Escape");

    expect(shell.isVisible()).toBe(true);
    expect(view.assistant.attributes.get("aria-hidden")).toBe("false");
    expect(view.assistant.attributes.get("data-assistant-state")).toBe("idle");
    expect(view.assistant.attributes.get("aria-busy")).toBe("false");
    expect(view.input.focusCount).toBe(1);
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

describe("assistant listening status", () => {
  it.each([
    ["pt-BR", "Estou ouvindo..."],
    ["en", "I’m listening..."],
    ["es", "Estoy escuchando..."],
    ["he", "אני מקשיב..."],
  ])("localizes the listening live status for %s", (locale, expected) => {
    expect(assistantUiStateStatus("listening", locale)).toBe(expected);
    const view = fixture();
    view.document.documentElement.lang = locale;
    const shell = installAssistantShellUi({ document: view.document });
    view.dispatchUiState("listening");
    expect(view.status.textContent).toBe(expected);
    expect(view.assistant.attributes.get("data-assistant-state")).toBe(
      "listening",
    );
    expect(view.assistant.attributes.get("aria-busy")).toBe("false");
    shell.destroy();
  });

  it("returns idle only when recognition ends without a newer response state", () => {
    expect(assistantListeningUiState(true, "idle")).toBe("listening");
    expect(assistantListeningUiState(false, "listening")).toBe("idle");
    for (const state of ["loading", "success", "error", "idle", null]) {
      expect(assistantListeningUiState(false, state)).toBeNull();
    }
  });
});

describe("production voice/request UI composition", () => {
  it.each(["resolve", "reject"] as const)(
    "keeps listening when an older text request %ss",
    async (outcome) => {
      const source = await readFile(
        new URL("./browser-assistant-runtime.ts", import.meta.url),
        "utf8",
      );
      const ast = ts.createSourceFile(
        "browser-assistant-runtime.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      let processExpression = "";
      let generationDeclaration = "";
      let listeningExpression = "";
      const visit = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ["assistantUiGeneration", "assistantVoiceUiGeneration"].includes(
            node.name.getText(ast),
          )
        )
          generationDeclaration += node.parent.parent.getText(ast);
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(ast) === "processInput" &&
          node.initializer
        )
          processExpression = node.initializer.getText(ast);
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(ast) === "onListeningChange"
        )
          listeningExpression = node.initializer.getText(ast);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      expect(processExpression).not.toBe("");
      expect(generationDeclaration).not.toBe("");
      expect(listeningExpression).not.toBe("");
      const compiled = ts.transpileModule(
        `${generationDeclaration} const processInput = ${processExpression}; const onListeningChange = ${listeningExpression}; return { processInput, onListeningChange };`,
        {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.None,
          },
        },
      ).outputText;
      const view = fixture();
      const shell = installAssistantShellUi({ document: view.document });
      const states: string[] = [];
      const deferred = () => {
        let resolve!: (value: unknown) => void;
        let reject!: (error: Error) => void;
        const promise = new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { promise, resolve, reject };
      };
      const oldText = deferred();
      const newVoice = deferred();
      const turns = [oldText.promise, newVoice.promise];
      const runtime = (
        compileFunction(compiled, [
          "processInputTurn",
          "dispatchAssistantUiState",
          "options",
          "assistantListeningUiState",
          "voiceButton",
          "destroyed",
        ]) as (...args: unknown[]) => unknown
      )(
        () => turns.shift(),
        (_document: Document, state: string) => {
          states.push(state);
          view.dispatchUiState(state);
        },
        { document: view.document },
        assistantListeningUiState,
        null,
        false,
      ) as {
        processInput(
          input: string,
          options?: unknown,
          preserve?: boolean,
          source?: string,
        ): Promise<unknown>;
        onListeningChange(listening: boolean): void;
      };
      const pending = runtime.processInput("old text");
      const settled = pending.then(
        () => undefined,
        () => undefined,
      );
      runtime.onListeningChange(true);
      expect(view.status.textContent).toBe("Estou ouvindo...");
      if (outcome === "resolve") oldText.resolve({ text: "old response" });
      else oldText.reject(new Error("old failure"));
      await settled;
      expect(states).toEqual(["loading", "listening"]);
      expect(view.assistant.attributes.get("data-assistant-state")).toBe(
        "listening",
      );
      const voicePending = runtime.processInput(
        "new voice",
        undefined,
        false,
        "voice",
      );
      expect(states.at(-1)).toBe("loading");
      runtime.onListeningChange(false);
      expect(states.at(-1)).toBe("loading");
      newVoice.resolve({ text: "new response" });
      await voicePending;
      expect(states.at(-1)).toBe("success");
      shell.destroy();
    },
  );
});

async function voiceErrorComposition() {
  const source = await readFile(
    new URL("./browser-assistant-runtime.ts", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "runtime.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const expressions: Record<string, string> = {};
  const declarations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node)) {
      const name = node.name.getText(ast);
      if (
        ["assistantUiGeneration", "assistantVoiceUiGeneration"].includes(name)
      )
        declarations.push(node.parent.parent.getText(ast));
      if (["processInput", "onVoiceClick"].includes(name) && node.initializer)
        expressions[name] = node.initializer.getText(ast);
    }
    if (
      ts.isPropertyAssignment(node) &&
      ["onError", "onListeningChange"].includes(node.name.getText(ast))
    ) {
      expressions[node.name.getText(ast)] = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  for (const name of [
    "processInput",
    "onError",
    "onListeningChange",
    "onVoiceClick",
  ])
    expect(expressions[name]).toBeTruthy();
  const compiled = ts.transpileModule(
    `${declarations.join("\n")} ${Object.entries(expressions)
      .map(([name, expression]) => `const ${name} = ${expression};`)
      .join(
        "\n",
      )} return { processInput, onError, onListeningChange, onVoiceClick };`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
      },
    },
  ).outputText;
  const view = fixture();
  const shell = installAssistantShellUi({ document: view.document });
  const messages: string[] = [];
  let resolveTurn!: (value: unknown) => void;
  const turn = new Promise((resolve) => {
    resolveTurn = resolve;
  });
  const runtime = (
    compileFunction(compiled, [
      "processInputTurn",
      "dispatchAssistantUiState",
      "options",
      "assistantListeningUiState",
      "voiceButton",
      "destroyed",
      "appendStandardMessage",
      "voiceInputMessage",
      "normalizeAssistantVoiceLanguage",
      "voiceLanguage",
      "voiceInput",
    ]) as (...args: unknown[]) => unknown
  )(
    () => turn,
    (_document: Document, state: string) => view.dispatchUiState(state),
    { document: view.document },
    assistantListeningUiState,
    null,
    false,
    (_role: string, message: string) => messages.push(message),
    (_locale: string, state: string) => state,
    (locale: string) => locale,
    () => "pt",
    null,
  ) as {
    processInput(value: string): Promise<unknown>;
    onError(): void;
    onListeningChange(listening: boolean): void;
    onVoiceClick(): void;
  };
  return { runtime, view, shell, messages, resolveTurn };
}

describe("late voice callbacks versus newer interaction", () => {
  it.each(["loading", "success"] as const)(
    "does not replace newer %s with an old recognition error",
    async (state) => {
      const f = await voiceErrorComposition();
      try {
        f.runtime.onListeningChange(true);
        const pending = f.runtime.processInput("newer text or transcript");
        if (state === "success") {
          f.resolveTurn({ text: "new response" });
          await pending;
        }
        f.runtime.onListeningChange(false);
        f.runtime.onError();
        expect(f.view.assistant.attributes.get("data-assistant-state")).toBe(
          state,
        );
        expect(f.messages).toEqual([]);
        if (state === "loading") {
          f.resolveTurn({ text: "new response" });
          await pending;
        }
      } finally {
        f.shell.destroy();
      }
    },
  );
  it("still reports an error belonging to the active recognition", async () => {
    const f = await voiceErrorComposition();
    try {
      f.runtime.onListeningChange(true);
      f.runtime.onListeningChange(false);
      f.runtime.onError();
      expect(f.view.assistant.attributes.get("data-assistant-state")).toBe(
        "error",
      );
      expect(f.messages).toEqual(["error"]);
    } finally {
      f.shell.destroy();
    }
  });
  it("keeps unsupported voice feedback when an older request finishes", async () => {
    const f = await voiceErrorComposition();
    try {
      const pending = f.runtime.processInput("older text");
      f.runtime.onVoiceClick();
      f.resolveTurn({ text: "old response" });
      await pending;
      expect(f.view.assistant.attributes.get("data-assistant-state")).toBe(
        "error",
      );
      expect(f.messages).toEqual(["unsupported"]);
    } finally {
      f.shell.destroy();
    }
  });
});

describe("assistant live status follows document locale", () => {
  it.each(["idle", "listening", "loading", "success", "error"] as const)(
    "translates current %s without resetting state",
    (state) => {
      const f = fixture();
      const shell = installAssistantShellUi({ document: f.document });
      shell.setState(state);
      for (const locale of ["he", "en", "es", "pt-BR"]) {
        f.changeLocale(locale);
        expect(f.status.textContent).toBe(
          assistantUiStateStatus(state, locale),
        );
        expect(f.assistant.attributes.get("data-assistant-state")).toBe(state);
        expect(f.assistant.attributes.get("aria-busy")).toBe(
          String(state === "loading"),
        );
      }
      expect(f.observedLocaleOptions).toEqual([
        { attributes: true, attributeFilter: ["lang"] },
      ]);
      shell.destroy();
      expect(f.localeObservers.every((observer) => !observer.connected)).toBe(
        true,
      );
      const prior = f.status.textContent;
      f.changeLocale("he");
      expect(f.status.textContent).toBe(prior);
    },
  );
});
