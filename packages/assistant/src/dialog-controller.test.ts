import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import { transpileModule } from "typescript";
import { createAssistantNavigationHandlers } from "./navigation-handlers.js";
import type { AssistantDialogResponse } from "./dialog-controller.js";
import { describe, expect, it, vi } from "vitest";

import {
  createAssistantDialogController,
  type AssistantDialogContextPort,
  type AssistantDialogIntentHandlerContext,
} from "./dialog-controller.js";
import { createDefaultAssistantContext } from "./context-manager.js";

function createContextPort(
  overrides: Partial<ReturnType<typeof createDefaultAssistantContext>> = {},
): AssistantDialogContextPort {
  let state = { ...createDefaultAssistantContext(() => 1000), ...overrides };
  return {
    getContext: () => structuredClone(state),
    updateContext: (updates) => {
      state = { ...state, ...updates };
    },
    addToHistory: (entry) => {
      state.history = [
        ...state.history,
        {
          input: entry.input ?? "",
          response: entry.response ?? "",
          timestamp: entry.timestamp ?? 1000,
        },
      ];
    },
  };
}

describe("assistant V1 dialog controller orchestration", () => {
  it.each([
    ["pt", "Ajuda"],
    ["en", "Help"],
    ["es", "Ayuda"],
    ["he", "עזרה"],
  ] as const)(
    "keeps the fourth fallback in presentation language %s",
    async (language, help) => {
      const context = createContextPort();
      const getPresentationLanguage = vi.fn(() => language);
      const requests: AssistantDialogIntentHandlerContext[] = [];
      const configuration = {
        context,
        handlers: {
          help: () => ({ text: "help response", metadata: { domain: "help" } }),
        },
        llm: async (request: AssistantDialogIntentHandlerContext) => {
          requests.push(request);
          return null;
        },
        defaultResponse: () => ({ text: `fallback-${language}` }),
        getPresentationLanguage,
      };
      const controller = createAssistantDialogController(configuration);
      const responses = [];
      const counts = [];
      for (let turn = 0; turn < 4; turn += 1) {
        responses.push(
          await controller.processUserInput("xyz qwerty incompreensivel"),
        );
        counts.push(context.getContext().fallbackCount);
      }

      expect(responses.slice(0, 3).map((response) => response.text)).toEqual([
        `fallback-${language}`,
        `fallback-${language}`,
        `fallback-${language}`,
      ]);
      expect.soft(responses[3]?.options?.[0]?.label).toBe(help);
      expect.soft(getPresentationLanguage).toHaveBeenCalledOnce();
      expect(counts).toEqual([1, 2, 3, 0]);
      expect(requests).toHaveLength(4);
      expect(
        requests.every(
          (request) => request.input === "xyz qwerty incompreensivel",
        ),
      ).toBe(true);
      expect(
        requests.map((request) => request.intent.entities.language),
      ).toEqual(["es", "es", "es", "es"]);
      expect(responses[3]?.metadata).toEqual({
        domain: "fallback",
        state: "escalated",
      });
      const helpOption = responses[3]?.options?.[0];
      if (!helpOption) throw new Error("Escalated help option missing");
      const recovered = await controller.processUserInput(helpOption.value);
      expect(recovered.metadata?.domain).toBe("help");
      expect(requests).toHaveLength(4);
    },
  );

  it("returns the default response for empty input", async () => {
    const controller = createAssistantDialogController({
      context: createContextPort(),
      defaultResponse: () => ({ text: "default" }),
    });

    await expect(controller.processUserInput("")).resolves.toEqual({
      text: "default",
    });
  });

  it("routes a local intent before considering LLM fallback", async () => {
    const local = vi.fn(() => ({ text: "local weather" }));
    const llm = vi.fn(() => ({ text: "llm" }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { weather: local },
      llm,
    });

    await expect(
      controller.processUserInput("Como está o tempo?"),
    ).resolves.toEqual({
      text: "local weather",
    });
    expect(local).toHaveBeenCalledOnce();
    expect(llm).not.toHaveBeenCalled();
    expect(context.getContext().lastIntent).toBe("weather");
    expect(context.getContext().history.at(-1)?.response).toBe("local weather");
  });

  it("uses the LLM port only after local handling yields no response", async () => {
    const local = vi.fn(() => null);
    const llm = vi.fn(() => ({ text: "llm history" }));
    const controller = createAssistantDialogController({
      context: createContextPort(),
      handlers: { cultural_history: local },
      llm,
    });

    await expect(
      controller.processUserInput("Qual é a história do Forte de Tapirandu?"),
    ).resolves.toEqual({ text: "llm history" });
    expect(local).toHaveBeenCalledOnce();
    expect(llm).toHaveBeenCalledOnce();
  });

  it("preserves awaiting context when classifying confirmations", async () => {
    let captured: AssistantDialogIntentHandlerContext | undefined;
    const confirm = vi.fn((request: AssistantDialogIntentHandlerContext) => {
      captured = request;
      return { text: "confirmed" };
    });
    const context = createContextPort({
      awaiting: { type: "confirmar_navegacao" },
      lastPlace: "Farol do Morro",
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { confirm },
    });

    await expect(controller.processUserInput("sim")).resolves.toEqual({
      text: "confirmed",
    });
    expect(captured?.intent.contextual).toBe(true);
    expect(captured?.context.lastPlace).toBe("Farol do Morro");
  });

  it("persists awaiting_place and routes the next turn to the requested intent", async () => {
    const photos = vi
      .fn<
        (request: AssistantDialogIntentHandlerContext) => {
          text: string;
          metadata?: Record<string, unknown>;
        }
      >()
      .mockImplementationOnce(() => ({
        text: "De qual local você quer ver fotos?",
        metadata: { domain: "photos", state: "awaiting_place" },
      }))
      .mockImplementationOnce((request) => ({
        text: `photos:${request.intent.entities.place}`,
      }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { photos },
    });

    await controller.processUserInput("fotos");
    expect(context.getContext().awaiting).toEqual({
      type: "awaiting_place",
      intent: "photos",
    });

    await expect(
      controller.processUserInput("Primeira Praia"),
    ).resolves.toEqual({ text: "photos:Primeira Praia" });
    expect(photos).toHaveBeenCalledTimes(2);
    const secondPhotoRequest = photos.mock.calls[1]?.[0];
    expect(secondPhotoRequest?.intent.intent).toBe("photos");
    expect(secondPhotoRequest?.intent.contextual).toBe(true);
    expect(secondPhotoRequest?.intent.entities.place).toBe("Primeira Praia");
    expect(context.getContext().lastPlace).toBe("Primeira Praia");
    expect(context.getContext().awaiting).toBeNull();
  });

  it("persists an awaiting destination and treats the next free-text turn as the destination", async () => {
    const navigate = vi
      .fn<
        (request: AssistantDialogIntentHandlerContext) => {
          text: string;
          metadata?: Record<string, unknown>;
        }
      >()
      .mockImplementationOnce(() => ({
        text: "Para onde você quer ir?",
        metadata: { navigation: "awaiting_destination" },
      }))
      .mockImplementationOnce((request) => ({
        text: `navigate:${request.intent.entities.place}`,
      }));
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: { navigate },
    });

    await controller.processUserInput("como chegar");
    expect(context.getContext().awaiting).toEqual({
      type: "awaiting_destination",
      intent: "navigate",
    });

    await expect(
      controller.processUserInput("Farol do Morro"),
    ).resolves.toEqual({ text: "navigate:Farol do Morro" });
    const secondNavigateRequest = navigate.mock.calls[1]?.[0];
    expect(secondNavigateRequest?.intent.intent).toBe("navigate");
    expect(secondNavigateRequest?.intent.contextual).toBe(true);
    expect(secondNavigateRequest?.intent.entities.place).toBe("Farol do Morro");
    expect(context.getContext().awaiting).toBeNull();
  });

  it("lets an explicit domain command interrupt an awaiting place slot", async () => {
    const photos = vi.fn(() => ({ text: "photos" }));
    const hours = vi.fn(() => ({ text: "hours" }));
    const context = createContextPort({
      awaiting: { type: "awaiting_place", intent: "photos" },
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { photos, hours },
    });

    await expect(controller.processUserInput("horário")).resolves.toEqual({
      text: "hours",
    });
    expect(hours).toHaveBeenCalledOnce();
    expect(photos).not.toHaveBeenCalled();
  });

  it("does not reinterpret a fresh navigation command as an awaited destination", async () => {
    let captured: AssistantDialogIntentHandlerContext | undefined;
    const navigate = vi.fn((request: AssistantDialogIntentHandlerContext) => {
      captured = request;
      return {
        text: "destination?",
        metadata: { navigation: "awaiting_destination" },
      };
    });
    const context = createContextPort({
      awaiting: { type: "awaiting_destination", intent: "navigate" },
    });
    const controller = createAssistantDialogController({
      context,
      handlers: { navigate },
    });

    await controller.processUserInput("como chegar");
    expect(captured?.intent.intent).toBe("navigate");
    expect(captured?.intent.entities.place).toBeUndefined();
  });

  it("updates category context and records the user profile after classification", async () => {
    const recordInteraction = vi.fn();
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      profile: { recordInteraction },
      handlers: {
        category_beaches: () => ({ text: "beaches" }),
      },
    });

    await controller.processUserInput("praias");

    expect(recordInteraction).toHaveBeenCalledWith("praias", "beaches");
    expect(context.getContext().lastCategory).toBe("beaches");
    expect(context.getContext().lastIntent).toBe("category_beaches");
  });

  it("records an explicit place in the user profile", async () => {
    const recordInteraction = vi.fn();
    const controller = createAssistantDialogController({
      context: createContextPort(),
      profile: { recordInteraction },
      handlers: {
        more_info: () => ({ text: "details" }),
      },
    });

    await controller.processUserInput("Fale sobre Primeira Praia");

    expect(recordInteraction).toHaveBeenCalledWith(
      "Fale sobre Primeira Praia",
      "beaches",
      expect.objectContaining({ name: "Primeira Praia", category: "beaches" }),
    );
  });

  it("returns the error response without corrupting history when a port fails", async () => {
    const context = createContextPort();
    const controller = createAssistantDialogController({
      context,
      handlers: {
        help: () => {
          throw new Error("boom");
        },
      },
      errorResponse: () => ({ text: "error" }),
    });

    await expect(controller.processUserInput("ajuda")).resolves.toEqual({
      text: "error",
    });
    expect(context.getContext().history).toEqual([]);
  });
});

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const routeA = {
  name: "Primeira Praia",
  latitude: -13.379,
  longitude: -38.914,
};
const routeB = { ...routeA, name: "Segunda Praia", latitude: -13.38 };
function realBrowserControllerFixture(
  start: (destination: {
    latitude: number;
    longitude: number;
  }) => Promise<unknown>,
  resolveDestination = async (query: string) =>
    query.toLowerCase().includes("primeira") ? routeA : routeB,
) {
  const context = createContextPort();
  const stop = vi.fn();
  const adapterSource = readFileSync(
    new URL(
      "../../../apps/morro-digital-platform/src/assistant/assistant-navigation-adapter.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const adapterStart = adapterSource.indexOf(
    "export function createAssistantNavigationAppHandlers",
  );
  expect(adapterStart).toBeGreaterThan(-1);
  const makeAdapter = compileFunction(
    transpileModule(
      adapterSource.slice(adapterStart).replace("export function", "function") +
        "\nreturn createAssistantNavigationAppHandlers;",
      {},
    ).outputText,
    ["createAssistantNavigationHandlers"],
  ) as (handlers: typeof createAssistantNavigationHandlers) => (options: {
    navigation: {
      start(destination: {
        latitude: number;
        longitude: number;
      }): Promise<unknown>;
      stop(): void;
    };
    resolver: { resolveDestination(query: string): Promise<typeof routeA> };
  }) => ReturnType<typeof createAssistantNavigationHandlers>;
  const navigationHandlers = makeAdapter(createAssistantNavigationHandlers)({
    navigation: {
      start: async (destination) => {
        await start(destination);
        return { type: "FeatureCollection", features: [] };
      },
      stop,
    },
    resolver: { resolveDestination },
  });
  let created = 0;
  const dependencies = {
    context,
    profile: { recordInteraction: () => undefined },
    navigationHandlers,
    domainHandlers: { help: () => ({ text: "new help" }) },
    intelligenceHandlers: {},
    options: { document: { documentElement: { lang: "pt" } } },
    withPresentationLanguage: (handler: unknown) => handler,
    createAssistantDialogController: (
      options: Parameters<typeof createAssistantDialogController>[0],
    ) => {
      created++;
      return createAssistantDialogController(options);
    },
    createAssistantLlmHandler: () => () => null,
    normalizeAssistantVoiceLanguage: () => "pt",
    assistantRecoveryResponse: () => ({ text: "recovery" }),
    runtimeErrorResponse: () => ({
      text: "runtime error",
      metadata: { domain: "assistant_runtime", state: "error" },
    }),
  };
  const source = readFileSync(
    new URL(
      "../../../apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const begin = source.indexOf("  const controller =");
  const end = source.indexOf("\n  const view =", begin);
  expect(begin).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(begin);
  const make = compileFunction(
    transpileModule(source.slice(begin, end) + "\nreturn controller;", {})
      .outputText,
    Object.keys(dependencies),
  ) as (...values: unknown[]) => {
    processUserInput(
      input: string,
      isCurrent?: () => boolean,
      generation?: number,
    ): Promise<AssistantDialogResponse>;
  };
  const controller = make(...Object.values(dependencies));
  let sequence = 0;
  return {
    context,
    stop,
    created: () => created,
    invalidate() {
      sequence++;
    },
    process(input: string) {
      const current = ++sequence;
      return controller.processUserInput(
        input,
        () => current === sequence,
        current,
      );
    },
  };
}

describe("causal navigation confirmation through the actual browser controller factory", () => {
  it("two fresh per-turn controllers produce one effect and the latest actual success acknowledgement", async () => {
    const gate = pending<void>();
    const start = vi.fn(() => gate.promise);
    const f = realBrowserControllerFixture(start);
    await f.process("me leve para Primeira Praia");
    const first = f.process("sim"),
      second = f.process("sim");
    await Promise.resolve();
    const count = start.mock.calls.length;
    gate.resolve();
    const responses = await Promise.all([first, second]);
    expect(f.created()).toBe(3);
    expect(count).toBe(1);
    expect(responses[1]?.metadata?.navigation).toBe("started");
    expect(f.context.getContext().awaiting).toBeNull();
    expect(f.context.getContext().pendingRoute).toBeNull();
    expect(f.stop).not.toHaveBeenCalled();
  });
  it("a failed shared effect returns the latest existing error and restores only its own retryable confirmation", async () => {
    const gate = pending<void>();
    const start = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(undefined);
    const f = realBrowserControllerFixture(start);
    await f.process("me leve para Primeira Praia");
    const first = f.process("sim"),
      second = f.process("sim");
    await Promise.resolve();
    gate.reject(new Error("route unavailable"));
    const responses = await Promise.all([first, second]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(responses[1]?.text).toBe("runtime error");
    expect(f.context.getContext().awaiting?.type).toBe("confirmar_navegacao");
    expect((await f.process("sim")).metadata?.navigation).toBe("started");
    expect(start).toHaveBeenCalledTimes(2);
  });
  it("a newer nonconfirmation completes without waiting for a hanging route and invalidates its late error", async () => {
    const gate = pending<void>();
    const f = realBrowserControllerFixture(() => gate.promise);
    await f.process("me leve para Primeira Praia");
    const old = f.process("sim");
    await Promise.resolve();
    expect((await f.process("ajuda")).text).toBe("new help");
    const snapshot = f.context.getContext();
    gate.reject(new Error("old route"));
    await old;
    expect(f.context.getContext()).toEqual(snapshot);
    expect(f.context.getContext().pendingRoute).toBeNull();
    expect(f.stop).not.toHaveBeenCalled();
  });
  it("an old failed confirmation cannot restore or stop a newer route", async () => {
    const gate = pending<void>();
    const active: number[] = [];
    const f = realBrowserControllerFixture(async (destination) => {
      active.push(destination.latitude);
      if (destination.latitude === routeA.latitude) await gate.promise;
    });
    await f.process("me leve para Primeira Praia");
    const old = f.process("sim");
    await Promise.resolve();
    await f.process("me leve para Segunda Praia");
    await f.process("sim");
    const snapshot = f.context.getContext();
    gate.reject(new Error("old start"));
    await old;
    expect(active).toEqual([routeA.latitude, routeB.latitude]);
    expect(f.context.getContext()).toEqual(snapshot);
    expect(f.stop).not.toHaveBeenCalled();
    expect(f.context.getContext().selectedDestination).toMatchObject({
      name: routeB.name,
    });
  });
  it("independent runtimes do not share an inflight route or block one another", async () => {
    const gate = pending<void>();
    const first = realBrowserControllerFixture(() => gate.promise),
      second = realBrowserControllerFixture(async () => undefined);
    await first.process("me leve para Primeira Praia");
    const old = first.process("sim");
    await second.process("me leve para Segunda Praia");
    expect((await second.process("sim")).metadata?.navigation).toBe("started");
    gate.resolve();
    await old;
  });
  it("the existing browser per-turn context guard already protects a newer choice from old lookup completion", async () => {
    const gate = pending<typeof routeA>();
    const f = realBrowserControllerFixture(
      async () => undefined,
      (query) =>
        query.toLowerCase().includes("primeira")
          ? gate.promise
          : Promise.resolve(routeB),
    );
    const old = f.process("me leve para Primeira Praia");
    await f.process("me leve para Segunda Praia");
    gate.resolve(routeA);
    await old;
    expect(f.context.getContext().pendingRoute).toMatchObject({
      name: routeB.name,
    });
  });
});

describe("standalone controller causal continuation and state failures", () => {
  it("an old lookup cannot replace the newest pending destination or history", async () => {
    const gate = pending<AssistantDialogResponse>();
    const c = createContextPort();
    const controller = createAssistantDialogController({
      context: c,
      handlers: {
        navigate: ({ input }) =>
          input.includes("Primeira")
            ? gate.promise
            : {
                text: "B",
                metadata: {
                  navigation: "awaiting_confirmation",
                  pendingRoute: routeB,
                },
              },
      },
    });
    const old = controller.processUserInput("me leve para Primeira Praia");
    await controller.processUserInput("me leve para Segunda Praia");
    const snapshot = c.getContext();
    gate.resolve({
      text: "A",
      metadata: { navigation: "awaiting_confirmation", pendingRoute: routeA },
    });
    const result = await old;
    expect(result.text).toBe("");
    expect(result.metadata?.state).toBe("superseded");
    expect(c.getContext()).toEqual(snapshot);
  });
  it("stale empty handler results do not invoke the LLM after a newer local response", async () => {
    const gate = pending<null>();
    const llm = vi.fn(() => ({ text: "obsolete generation" }));
    const c = createContextPort();
    const controller = createAssistantDialogController({
      context: c,
      llm,
      handlers: {
        unknown: () => gate.promise,
        place_search: () => gate.promise,
        help: () => ({ text: "new help" }),
      },
    });
    const old = controller.processUserInput("xyzzy query that is not a place");
    await controller.processUserInput("ajuda");
    gate.resolve(null);
    await old;
    expect(llm).not.toHaveBeenCalled();
  });
  it("failure to consume pending confirmation denies the effect and preserves existing error handling", async () => {
    const c = createContextPort({
      awaiting: { type: "confirmar_navegacao", intent: "navigate" },
      pendingRoute: routeA,
    });
    const start = vi.fn(() => ({
      text: "started",
      metadata: { navigation: "started" },
    }));
    const controller = createAssistantDialogController({
      context: {
        ...c,
        updateContext: () => {
          throw new Error("storage rejected");
        },
      },
      handlers: { confirm: start },
      errorResponse: () => ({ text: "existing error" }),
    });
    expect((await controller.processUserInput("sim")).text).toBe(
      "existing error",
    );
    expect(start).not.toHaveBeenCalled();
  });
  it("a context read failure cannot trigger a navigation effect or escape as an uncaught rejection", async () => {
    const start = vi.fn(() => ({ text: "started" }));
    const controller = createAssistantDialogController({
      context: {
        getContext: () => {
          throw new Error("context unreadable");
        },
        updateContext: () => undefined,
        addToHistory: () => undefined,
      },
      handlers: { confirm: start },
      errorResponse: () => ({ text: "existing error" }),
    });
    expect((await controller.processUserInput("sim")).text).toBe(
      "existing error",
    );
    expect(start).not.toHaveBeenCalled();
  });
});

describe("navigation cancellation and failed state boundaries", () => {
  it("explicit stop invalidates the old continuation without a second cancellation", async () => {
    const gate = pending<void>();
    const f = realBrowserControllerFixture(() => gate.promise);
    await f.process("me leve para Primeira Praia");
    const old = f.process("sim");
    await Promise.resolve();
    const stopped = await f.process("parar navegação");
    const snapshot = f.context.getContext();
    gate.reject(new Error("stopped"));
    await old;
    expect(stopped.metadata?.navigation).toBe("cancelled");
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.context.getContext()).toEqual(snapshot);
  });
  it("external browser invalidation before dispatch denies the pending effect", async () => {
    const start = vi.fn(async () => undefined);
    const f = realBrowserControllerFixture(start);
    await f.process("me leve para Primeira Praia");
    const old = f.process("sim");
    f.invalidate();
    expect((await old).metadata?.state).toBe("superseded");
    expect(start).not.toHaveBeenCalled();
  });
  it("a recovery-state failure returns the existing error without an uncaught rejection", async () => {
    const c = createContextPort({
      awaiting: { type: "confirmar_navegacao", intent: "navigate" },
      pendingRoute: routeA,
    });
    let writes = 0;
    const handler = vi.fn(async () => {
      throw new Error("navigation failed");
    });
    const controller = createAssistantDialogController({
      context: {
        ...c,
        updateContext: (update) => {
          if (++writes > 1) throw new Error("recovery storage unavailable");
          c.updateContext(update);
        },
      },
      handlers: { confirm: handler },
      errorResponse: () => ({ text: "existing error" }),
    });
    expect((await controller.processUserInput("sim")).text).toBe(
      "existing error",
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(c.getContext().pendingRoute).toBeNull();
  });
  it("a history write failure after an actual start never restores a consumed confirmation", async () => {
    const start = vi.fn(async () => undefined);
    const f = realBrowserControllerFixture(start);
    await f.process("me leve para Primeira Praia");
    f.context.addToHistory = () => {
      throw new Error("history unavailable");
    };
    expect((await f.process("sim")).text).toBe("runtime error");
    expect(f.context.getContext().awaiting).toBeNull();
    await f.process("sim");
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("browser generation continuity of a confirmation", () => {
  it("an external invalidation then a new yes cannot revive the old flight or restore its confirmation", async () => {
    const gate = pending<void>();
    const start = vi.fn(() => gate.promise);
    const f = realBrowserControllerFixture(start);
    await f.process("me leve para Primeira Praia");
    const old = f.process("sim");
    await Promise.resolve();
    f.invalidate();
    const current = f.process("sim");
    gate.reject(new Error("old route after external action"));
    const responses = await Promise.all([old, current]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(responses[1]?.text).toBe("recovery");
    expect(f.context.getContext().awaiting).toBeNull();
    expect(f.context.getContext().pendingRoute).toBeNull();
    expect(f.stop).not.toHaveBeenCalled();
  });
});
