import { ensureFeatureStyles } from "../map/feature-styles.js";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import {
  ASSISTANT_PROFILE_STORAGE_KEY,
  createAssistantUserProfileManager,
  createAssistantContextManager,
  createAssistantDialogController,
  createDefaultAssistantContext,
  getAssistantMainMenu,
  normalizeAssistantVoiceLanguage,
  type AssistantDialogResponse,
  type AssistantActiveTourContext,
  type AssistantDialogIntentHandler,
} from "@touristic/assistant";
import { createAssistantBrowserDomainHandlers } from "./assistant-domain-adapter.js";
import ts from "typescript";
import { resolveExploreLocationCount } from "./assistant-contextual-state.js";
import { assistantUiStateStatus } from "./assistant-ui-state.js";
import {
  getAssistantConversationOrchestrator,
  type ConversationTurn,
} from "./assistant-conversation-orchestrator.js";
import { describe, expect, it, vi } from "vitest";

function runtimeClosure(name: string): string {
  let result = "";
  function find(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      result = node.initializer?.getText(ast) ?? "";
    ts.forEachChild(node, find);
  }
  find(ast);
  if (!result) throw new Error(`Actual runtime closure missing: ${name}`);
  return result;
}

function runtimeFunction(name: string): string {
  const declaration = ast.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  if (!declaration) throw new Error(`Actual runtime function missing: ${name}`);
  return declaration.getText(ast);
}

function failureFixture(
  language = "pt-BR",
  styleLoader: typeof ensureFeatureStyles = ensureFeatureStyles,
  domainHandlers: Partial<Record<string, AssistantDialogIntentHandler>> = {
    help: () => {
      throw new Error("handler failed");
    },
  },
) {
  class Input {
    value = "ajuda";
  }
  const input = new Input();
  class Key {
    key = "Enter";
    shiftKey = false;
    isComposing = false;
    prevented = false;
    preventDefault() {
      this.prevented = true;
    }
  }
  class OptionEvent {
    detail = { value: "beaches" };
  }
  const events: string[] = [];
  const messages: string[] = [];
  const llm = vi.fn<AssistantDialogIntentHandler>(async () => null);
  let state = createDefaultAssistantContext(() => 1000);
  const document = {
    documentElement: { lang: language },
    querySelector: () => null,
  };
  const dependencies = {
    options: { document },
    ensureFeatureStyles: styleLoader,
    assistantUiStateStatus,
    createAssistantDialogController,
    getAssistantMainMenu,
    normalizeAssistantVoiceLanguage,
    voiceLanguage: () =>
      normalizeAssistantVoiceLanguage(document.documentElement.lang),
    createAssistantLlmHandler: () => llm,
    context: {
      getContext: () => state,
      updateContext: (value: Partial<typeof state>) => {
        state = { ...state, ...value };
      },
      addToHistory: vi.fn(),
    },
    profile: undefined,
    domainHandlers,
    intelligenceHandlers: {},
    navigationHandlers: {},
    dispatchAssistantUiState: (_: unknown, value: string) => events.push(value),
    appendStandardMessage: (_: unknown, text: string) => messages.push(text),
    input,
    HTMLInputElement: Input,
    KeyboardEvent: Key,
    CustomEvent: OptionEvent,
    readOptionOverride: () => null,
  };
  const declarations = [
    "runtimeErrorResponse",
    "isRuntimeErrorResponse",
    "withPresentationLanguage",
    "controller",
    "processInputTurn",
    "processInput",
    "submitInput",
    "onComposerInput",
    "onCompositionStart",
    "onCompositionEnd",
    "onInputKeyDown",
    "onOptionSelected",
    "onVoiceClick",
  ]
    .map((name) => `const ${name} = ${runtimeClosure(name)};`)
    .join("\n");
  const voiceAst = ts.createSourceFile(
    "voice.ts",
    `const voice = ${runtimeClosure("voiceInput")};`,
    ts.ScriptTarget.Latest,
    true,
  );
  let onResult = "";
  let onError = "";
  function findVoice(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(voiceAst) === "onResult"
    )
      onResult = node.initializer.getText(voiceAst);
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(voiceAst) === "onError"
    )
      onError = node.initializer.getText(voiceAst);
    ts.forEachChild(node, findVoice);
  }
  findVoice(voiceAst);
  if (!onResult || !onError) throw new Error("Actual voice callbacks missing");
  const runtimeFunctions = [
    "supersededResponse",
    "assistantRecoveryResponse",
    "voiceInputMessage",
  ]
    .map(runtimeFunction)
    .join("\n");
  const compiled = ts.transpileModule(
    `
    ${runtimeFunctions}
    let destroyed = false, assistantUiGeneration = 0, composerRevision = 0, composerComposing = false;
    let assistantVoiceUiGeneration = 0;
    const voiceInput = null;
    let legacyMenuRouting = false;
    let executeInputTurn = (value) => controller.processUserInput(value);
    ${declarations}
    const onVoiceResult = ${onResult};
    const onVoiceError = ${onError};
    return { processInput, submitInput, onComposerInput, onCompositionStart, onCompositionEnd, onInputKeyDown, onOptionSelected, onVoiceResult, onVoiceError, onVoiceClick,
      destroy() { destroyed = true; },
      setTurn(turn) { executeInputTurn = turn; },
      failTurn() { executeInputTurn = async () => { throw new Error("turn failed"); }; } };
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const createRuntime = compileFunction(
    compiled,
    Object.keys(dependencies),
  ) as (...values: unknown[]) => {
    processInput(value: string): Promise<AssistantDialogResponse>;
    submitInput(source: "button" | "keyboard"): void;
    failTurn(): void;
    destroy(): void;
    setTurn(turn: () => Promise<AssistantDialogResponse>): void;
    onComposerInput(): void;
    onCompositionStart(): void;
    onCompositionEnd(): void;
    onInputKeyDown(event: Key): void;
    onOptionSelected(event: OptionEvent): void;
    onVoiceResult(value: string): void;
    onVoiceError(): void;
    onVoiceClick(): void;
  };
  const runtime = createRuntime(...Object.values(dependencies));
  return {
    ...runtime,
    input,
    events,
    messages,
    llm,
    Key,
    OptionEvent,
    document: dependencies.options.document,
  };
}

const settleTurn = () => new Promise<void>((resolve) => setImmediate(resolve));
const failedResponse: AssistantDialogResponse = {
  text: "failed",
  metadata: { domain: "assistant_runtime", state: "error" },
};

describe("assistant presentation language at the real handler boundary", () => {
  it("keeps Portuguese weather text and actions for a Portuguese question with shared words", async () => {
    const fetchWeather = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            temperatureCelsius: 28,
            temperatureMaxCelsius: 31,
            temperatureMinCelsius: 24,
            humidityPercent: 78,
            windSpeedKph: 18,
            rainChancePercent: 10,
            weatherCode: 2,
            isDay: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const handlers = createAssistantBrowserDomainHandlers({
      fetch: fetchWeather,
    });
    const f = failureFixture("pt-BR", ensureFeatureStyles, handlers);

    const response = await f.processInput("Como está o tempo amanhã?");

    expect(response.metadata).toEqual(
      expect.objectContaining({ language: "pt" }),
    );
    expect(response.text).toContain(
      "Condições informadas para Morro de São Paulo",
    );
    expect(response.options?.[0]?.label).toBe("Temperatura agora");
    expect(fetchWeather).toHaveBeenCalledExactlyOnceWith(
      "/api/weather",
      expect.any(Object),
    );
  });

  it("reads the current preference for each turn without changing the submitted text", async () => {
    const handler = vi.fn<AssistantDialogIntentHandler>((request) => ({
      text: request.intent.entities.language ?? "missing",
    }));
    const f = failureFixture("es", ensureFeatureStyles, { weather: handler });
    const input = "Como está o tempo amanhã?";

    for (const [locale, expected] of [
      ["es", "es"],
      ["pt-BR", "pt"],
      ["en-US", "en"],
      ["he-IL", "he"],
      ["pt-BR", "pt"],
    ] as const) {
      f.document.documentElement.lang = locale;
      const response = await f.processInput(input);
      expect(response.text).toBe(expected);
      expect(handler).toHaveBeenLastCalledWith(
        expect.objectContaining({ input }),
      );
    }
  });
});

describe("localized recovery at the real runtime controller boundary", () => {
  it.each([
    [
      "pt-BR",
      "Não consegui responder agora. Tente reformular ou escolha uma opção.",
      "Ajuda",
      "Escolha Ajuda para ver o que posso fazer, ou uma categoria para explorar o mapa.",
    ],
    [
      "en-US",
      "I couldn’t answer just now. Try rephrasing or choose an option.",
      "Help",
      "Choose Help to see what I can do, or a category to explore the map.",
    ],
    [
      "es-ES",
      "No pude responder ahora. Prueba a reformular el mensaje o elige una opción.",
      "Ayuda",
      "Elige Ayuda para ver qué puedo hacer, o una categoría para explorar el mapa.",
    ],
    [
      "he-IL",
      "לא הצלחתי להשיב כרגע. אפשר לנסח מחדש או לבחור אפשרות.",
      "עזרה",
      "אפשר לבחור בעזרה כדי לראות במה אוכל לעזור, או בקטגוריה כדי לסייר במפה.",
    ],
  ])(
    "keeps all four unresolved turns in %s",
    async (locale, expected, help, escalated) => {
      const helpHandler = createAssistantBrowserDomainHandlers().help;
      if (!helpHandler) throw new Error("Actual help handler missing");
      const f = failureFixture(locale, ensureFeatureStyles, {
        help: helpHandler,
      });
      const responses: AssistantDialogResponse[] = [];
      for (let turn = 0; turn < 4; turn += 1) {
        responses.push(await f.processInput("xyz qwerty incompreensivel"));
      }

      expect
        .soft(responses.slice(0, 3).map((response) => response.text))
        .toEqual([expected, expected, expected]);
      expect.soft(responses[3]?.options?.[0]?.label).toBe(help);
      expect(responses[3]?.text).toBe(escalated);
      expect(responses[3]?.metadata).toEqual({
        domain: "fallback",
        state: "escalated",
      });
      const canonicalOptions = getAssistantMainMenu(
        normalizeAssistantVoiceLanguage(locale),
      ).filter((option) =>
        ["help", "beaches", "restaurants"].includes(option.value),
      );
      expect(responses[0]?.options).toEqual(canonicalOptions);
      expect(responses[0]?.options?.map((option) => option.value)).toEqual([
        "beaches",
        "restaurants",
        "help",
      ]);
      expect(responses[3]?.options?.map((option) => option.value)).toEqual([
        normalizeAssistantVoiceLanguage(locale) === "he" ? "help" : help,
        canonicalOptions.find((option) => option.value === "beaches")?.label,
        canonicalOptions.find((option) => option.value === "restaurants")
          ?.label,
      ]);
      const helpOption = responses[3]?.options?.[0];
      if (!helpOption) throw new Error("Escalated help option missing");
      expect(f.llm).toHaveBeenCalledTimes(4);
      const recovered = await f.processInput(helpOption.value);
      expect(recovered.metadata?.domain).toBe("help");
      expect(f.llm).toHaveBeenCalledTimes(4);
    },
  );

  it("reads a changed presentation language before the fourth fallback", async () => {
    const f = failureFixture("en", ensureFeatureStyles, {});
    for (let turn = 0; turn < 3; turn += 1) {
      await f.processInput("xyz qwerty incompreensivel");
    }
    f.document.documentElement.lang = "he";
    const response = await f.processInput("xyz qwerty incompreensivel");
    expect(response.options?.[0]?.label).toBe("עזרה");
    expect(response.metadata).toEqual({
      domain: "fallback",
      state: "escalated",
    });
  });

  it.each([
    [
      "pt-BR",
      "Escolha uma categoria ou digite o nome de um lugar para explorar o mapa.",
    ],
    ["en-US", "Choose a category or type a place name to explore the map."],
    [
      "es-ES",
      "Elige una categoría o escribe el nombre de un lugar para explorar el mapa.",
    ],
    ["he-IL", "כדי לסייר במפה, אפשר לבחור קטגוריה או להקליד שם של מקום."],
  ])(
    "localizes the actual empty turn in %s without starting a request",
    async (locale, expected) => {
      const syncExploreContext = vi.fn();
      const compiled = ts.transpileModule(
        `${runtimeFunction("assistantRecoveryResponse")}\nreturn ${runtimeClosure("executeInputTurn")};`,
        { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
      ).outputText;
      const createTurn = compileFunction(compiled, [
        "getAssistantMainMenu",
        "presentationLanguage",
        "syncExploreContext",
      ]) as (
        ...values: unknown[]
      ) => (input: string) => Promise<AssistantDialogResponse>;
      const turn = createTurn(
        getAssistantMainMenu,
        () => normalizeAssistantVoiceLanguage(locale),
        syncExploreContext,
      );
      expect(await turn("   ")).toEqual({ text: expected });
      expect(syncExploreContext).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "pt-BR",
      "A entrada por voz não está disponível neste navegador. Digite sua mensagem.",
      "Não foi possível usar a entrada por voz agora. Tente novamente ou digite sua mensagem.",
    ],
    [
      "en-US",
      "Voice input isn’t available in this browser. Type your message.",
      "Voice input couldn’t be used just now. Try again or type your message.",
    ],
    [
      "es-ES",
      "La entrada por voz no está disponible en este navegador. Escribe tu mensaje.",
      "No se pudo usar la entrada por voz ahora. Inténtalo de nuevo o escribe tu mensaje.",
    ],
    [
      "he-IL",
      "קלט קולי לא זמין בדפדפן הזה. אפשר להקליד את ההודעה.",
      "לא ניתן היה להשתמש בקלט הקולי כרגע. אפשר לנסות שוב או להקליד את ההודעה.",
    ],
  ])(
    "projects usable alternatives from real voice callbacks in %s",
    (locale, unsupported, error) => {
      const unavailable = failureFixture(locale);
      unavailable.onVoiceClick();
      expect(unavailable.events).toEqual(["error"]);
      expect(unavailable.messages).toEqual([unsupported]);
      expect(unavailable.input.value).toBe("ajuda");

      const failed = failureFixture(locale);
      failed.onVoiceError();
      expect(failed.events).toEqual(["error"]);
      expect(failed.messages).toEqual([error]);
      expect(failed.input.value).toBe("ajuda");
    },
  );
});

function deferredTurn() {
  let resolve!: (response: AssistantDialogResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AssistantDialogResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function pendingAssistantFixture() {
  const pending = deferredTurn();
  const handler = vi.fn<AssistantDialogIntentHandler>(() => pending.promise);
  const context = createAssistantContextManager();
  const messages: Array<{ sender: string; html: string }> = [];
  const assistantNodes: Array<{ dataset: Record<string, string> }> = [];
  const uiStates: string[] = [];
  const voice = { speak: vi.fn() };
  const events: unknown[] = [];
  let details: ConversationTurn | undefined;
  const document = {
    documentElement: { lang: "pt" },
    querySelectorAll: () => assistantNodes,
    getElementById: () => ({ textContent: "Selected place A" }),
    dispatchEvent: (event: unknown) => events.push(event),
  } as unknown as Document;
  const conversation = getAssistantConversationOrchestrator(document);
  const execute = vi.fn(async () => {
    conversation.transition({
      cause: "place_selected",
      messageKey: "place_selected",
      renderedText: "Selected place A",
      place: "Praia A",
    });
    return true;
  });
  const exploreState = () => ({
    stage: "detail",
    place: "Praia A",
    category: "beaches",
  });
  const dependencies = {
    document,
    conversation,
    options: { document, explore: { execute, getState: exploreState } },
    getAssistantConversationOrchestrator,
    createAssistantDialogController,
    getAssistantMainMenu,
    normalizeAssistantVoiceLanguage,
    assistantUiStateStatus,
    context,
    profile: { recordInteraction: vi.fn() },
    domainHandlers: { help: handler },
    intelligenceHandlers: {},
    navigationHandlers: {},
    createAssistantLlmHandler: () => async () => null,
    messages: {
      append: (message: { sender: string; html: string }) => {
        messages.push(message);
        if (message.sender === "assistant")
          assistantNodes.push({ dataset: {} });
      },
    },
    renderPlaceDetailMessage: (
      _location: unknown,
      _category: string,
      _description: string,
      turn: ConversationTurn,
    ) => {
      details = turn;
    },
    ensureFeatureStyles: () => null,
    dispatchAssistantUiState: (_document: Document, state: string) =>
      uiStates.push(state),
    currentLocale: () => "pt",
    presentationLanguage: () => "pt",
    voiceLanguage: () => "pt",
    voice,
    syncExploreContext: () => undefined,
    readExploreState: exploreState,
    commerceCheckoutUrl: () => null,
    resolveAssistantV1ResidualCommand: () => null,
    resolveAssistantV1PlaceAction: () => null,
    readVisiblePresentation: () => null,
    resolveAssistantMenuCommand: (_document: Document, value: string) =>
      value === "beaches"
        ? { type: "open_category", category: "beaches" }
        : null,
    CONTROLLER_OWNED_AWAITING_TYPES: new Set(),
    clearAssistantDomOptions: vi.fn(),
    removePhotoPresentation: vi.fn(),
    readPlaceOwnedActionValues: () => [],
    readAssistantResponseOptions: (response: AssistantDialogResponse) =>
      response.options ?? [],
    renderAssistantDomOptions: vi.fn(),
    revealLatestAssistantContent: () => undefined,
    readPhotoPresentation: () => null,
    isPhotoResponse: () => false,
    resolveAssistantRuntimeAction: () => ({
      type: "open_category",
      category: "beaches",
    }),
    CustomEvent: class {
      constructor(
        readonly type: string,
        readonly init: unknown,
      ) {}
    },
  };
  const exploreAst = ts.createSourceFile(
    "explore-locations-control.ts",
    readFileSync(
      new URL("../map/explore-locations-control.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
  );
  const detailConsumers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ["readActivePlaceDetail", "handlePlaceAction"].includes(
        node.name.getText(exploreAst),
      )
    ) {
      detailConsumers.push(`const ${node.getText(exploreAst)};`);
    }
    ts.forEachChild(node, visit);
  };
  visit(exploreAst);
  if (detailConsumers.length !== 2)
    throw new Error("Actual detail action consumers missing");
  const declarations = [
    "runtimeErrorResponse",
    "withPresentationLanguage",
    "controller",
    "dropStaleResponse",
    "appendStandardMessage",
    "executeInputTurn",
    "processInputTurn",
    "processInput",
  ]
    .map((name) => `const ${name} = ${runtimeClosure(name)};`)
    .join("\n");
  const functions = [
    "supersededResponse",
    "assistantRecoveryResponse",
    "snapshotPresentation",
    "readRuntimeAction",
    "isUnknownArray",
    "readDeterministicExploreCommands",
  ]
    .map(runtimeFunction)
    .join("\n");
  // Both production consumers share one real orchestrator and context manager.
  // Only external handlers and browser presentation boundaries are fixtures.
  const compiled = ts.transpileModule(
    `
    let destroyed=false, requestGeneration=0, assistantUiGeneration=0, currentPresentation=null, legacyMenuRouting=false;
    const activeStage="detail", activePlaceLocation={name:"Praia A",category:"beaches"};
    const activePlaceDetail={placeId:"place-a",location:activePlaceLocation,categoryLabel:"Praias",description:"Confirmed place A details",locale:"pt"};
    ${functions}
    ${declarations}
    ${detailConsumers.join("\n")}
    return {process:(value,source="programmatic")=>processInput(value,undefined,false,source),controller,showDetails:()=>handlePlaceAction("place-action:info:place-a")};
  `,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const create = compileFunction(compiled, Object.keys(dependencies)) as (
    ...values: unknown[]
  ) => {
    process(
      value: string,
      source?: "programmatic" | "voice",
    ): Promise<AssistantDialogResponse>;
    controller: {
      processUserInput(input: string): Promise<AssistantDialogResponse>;
    };
    showDetails(): void;
  };
  return {
    ...create(...Object.values(dependencies)),
    pending,
    handler,
    context,
    conversation,
    messages,
    uiStates,
    voice,
    execute,
    events,
    details: () => details,
    renderedOptions: dependencies.renderAssistantDomOptions,
  };
}

describe("pending assistant response and explicit place details", () => {
  it.each([
    [false, "response"],
    [true, "response"],
    [false, "handler failure"],
    [true, "handler failure"],
    [false, "runtime rejection"],
    [true, "runtime rejection"],
  ] as const)(
    "preserves details (already open: %s) after an old %s and accepts a later voice request",
    async (alreadyOpen, outcome) => {
      const f = pendingAssistantFixture();
      if (alreadyOpen) f.showDetails();
      if (outcome === "runtime rejection") {
        vi.spyOn(f.controller, "processUserInput").mockImplementationOnce(
          () => f.pending.promise,
        );
      }
      const old = f.process("ajuda").then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      f.showDetails();
      const details = f.details()!;
      const contextAfterDetails = f.context.getContext();
      if (outcome === "response") {
        f.pending.resolve({
          text: "Obsolete answer",
          options: [{ label: "Obsolete option", value: "old-option" }],
          metadata: { action: "show_beaches" },
        });
      } else {
        f.pending.reject(Error("Obsolete failure"));
      }
      expect(await old).toMatchObject({
        value: { metadata: { state: "superseded" } },
      });
      expect(f.conversation.snapshot().lastMeaningfulTurn).toBe(details.id);
      expect(f.conversation.recentTurns()).toHaveLength(1);
      expect(f.messages.filter(({ sender }) => sender === "assistant")).toEqual(
        [],
      );
      expect(f.context.getContext()).toEqual(contextAfterDetails);
      expect(f.voice.speak).not.toHaveBeenCalled();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.renderedOptions).not.toHaveBeenCalled();
      expect(f.uiStates).not.toContain("error");

      f.handler.mockResolvedValueOnce({ text: "A new intentional answer" });
      const current = await f.process("ajuda", "voice");
      expect(current.text).toBe("A new intentional answer");
      expect(f.conversation.recentTurns().at(-1)).toMatchObject({
        cause: "assistant_response",
        previousTurnId: details.id,
        renderedText: "A new intentional answer",
      });
      expect(f.voice.speak).toHaveBeenCalledExactlyOnceWith(
        "A new intentional answer",
        "pt",
      );
      expect(
        f.context.getContext().history.map(({ response }) => response),
      ).toEqual(["A new intentional answer"]);
    },
  );

  it("keeps the newer request context when an older request resolves afterward", async () => {
    const f = pendingAssistantFixture();
    const old = f.process("ajuda");
    f.showDetails();
    f.handler.mockResolvedValueOnce({ text: "The current answer" });
    await f.process("ajuda");
    const currentState = f.context.getContext();
    const currentTurn = f.conversation.snapshot().lastMeaningfulTurn;
    f.pending.resolve({ text: "Obsolete answer" });
    expect((await old).metadata?.state).toBe("superseded");
    expect(f.context.getContext()).toEqual(currentState);
    expect(f.conversation.snapshot().lastMeaningfulTurn).toBe(currentTurn);
    expect(f.voice.speak).toHaveBeenCalledExactlyOnceWith(
      "The current answer",
      "pt",
    );
  });

  it("keeps intentional routing and response-owned actions after details", async () => {
    const f = pendingAssistantFixture();
    f.showDetails();
    expect((await f.process("beaches")).metadata?.state).toBe("routed");
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.handler).not.toHaveBeenCalled();
    f.handler.mockResolvedValueOnce({
      text: "Current action answer",
      metadata: { action: "show_beaches" },
    });
    expect((await f.process("ajuda")).text).toBe("Current action answer");
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(f.voice.speak).toHaveBeenLastCalledWith(
      "Current action answer",
      "pt",
    );
  });
});

describe("actual runtime failure projection and composer recovery", () => {
  it.each(["pt-BR", "en", "es", "he"])(
    "projects caught handler failure in %s",
    async (language) => {
      const f = failureFixture(language);
      const response = await f.processInput("ajuda");
      expect(response.text).toBe(assistantUiStateStatus("error", language));
      expect(response.metadata).toMatchObject({
        domain: "assistant_runtime",
        state: "error",
      });
      expect(f.events).toEqual(["loading", "error"]);
    },
  );
  it("clears immediately and restores the failed submitted text", async () => {
    const f = failureFixture();
    f.submitInput("button");
    expect(f.input.value).toBe("");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(f.input.value).toBe("ajuda");
  });
  it("presents one error for a rejected turn while preserving programmatic rejection", async () => {
    const f = failureFixture("en");
    f.failTurn();
    await expect(f.processInput("beaches")).rejects.toThrow("turn failed");
    expect(f.messages).toEqual([assistantUiStateStatus("error", "en")]);
    expect(f.events).toEqual(["loading", "error"]);
  });
  it("restores rejected DOM input and retries only on a second explicit send", async () => {
    const f = failureFixture();
    const turn = vi
      .fn()
      .mockRejectedValueOnce(new Error("turn failed"))
      .mockResolvedValue({ text: "recovered" });
    f.setTurn(turn);
    f.submitInput("button");
    await settleTurn();
    expect(f.input.value).toBe("ajuda");
    expect(turn).toHaveBeenCalledTimes(1);
    expect(f.messages).toHaveLength(1);
    f.submitInput("keyboard");
    await settleTurn();
    expect(f.input.value).toBe("");
    expect(turn).toHaveBeenCalledTimes(2);
    expect(f.events).toEqual(["loading", "error", "loading", "success"]);
  });
  it.each(["new draft", ""])(
    "does not replace an edited draft, including intentional clearing: %s",
    async (draft) => {
      const f = failureFixture();
      const pending = deferredTurn();
      f.setTurn(() => pending.promise);
      f.submitInput("button");
      f.input.value = "edited";
      f.onComposerInput();
      f.input.value = draft;
      f.onComposerInput();
      pending.resolve(failedResponse);
      await settleTurn();
      expect(f.input.value).toBe(draft);
    },
  );
  it.each(["resolved", "rejected"])(
    "ignores a late %s failure after a newer successful turn",
    async (kind) => {
      const f = failureFixture();
      const pending = deferredTurn();
      f.setTurn(() => pending.promise);
      f.submitInput("button");
      f.setTurn(async () => ({ text: "current success" }));
      f.input.value = "newer input";
      f.onComposerInput();
      f.submitInput("button");
      await settleTurn();
      if (kind === "resolved") pending.resolve(failedResponse);
      else pending.reject(new Error("late failure"));
      await settleTurn();
      expect(f.input.value).toBe("");
      expect(f.events).toEqual(["loading", "loading", "success"]);
      expect(f.messages).toEqual([]);
    },
  );
  it("does not begin a programmatic turn after destroy", async () => {
    const f = failureFixture();
    const turn = vi.fn().mockResolvedValue({ text: "unexpected" });
    f.setTurn(turn);
    f.destroy();
    expect((await f.processInput("praias")).metadata?.state).toBe("superseded");
    expect(turn).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });
  it.each(["resolved", "rejected"])(
    "does not present or restore a %s failure after destroy",
    async (kind) => {
      const f = failureFixture();
      const pending = deferredTurn();
      f.setTurn(() => pending.promise);
      f.submitInput("button");
      f.destroy();
      if (kind === "resolved") pending.resolve(failedResponse);
      else pending.reject(new Error("destroyed failure"));
      await settleTurn();
      expect(f.input.value).toBe("");
      expect(f.events).toEqual(["loading"]);
      expect(f.messages).toEqual([]);
    },
  );
  it("preserves IME composition on button and Enter until composition ends", async () => {
    const f = failureFixture();
    const turn = vi.fn().mockResolvedValue({ text: "ok" });
    f.setTurn(turn);
    f.onCompositionStart();
    f.submitInput("button");
    const key = new f.Key();
    f.onInputKeyDown(key);
    expect(key.prevented).toBe(false);
    expect(f.input.value).toBe("ajuda");
    expect(turn).not.toHaveBeenCalled();
    f.onCompositionEnd();
    f.onInputKeyDown(key);
    await settleTurn();
    expect(key.prevented).toBe(true);
    expect(turn).toHaveBeenCalledTimes(1);
  });
  it.each(["shiftKey", "isComposing"] as const)(
    "preserves %s keyboard input",
    (flag) => {
      const f = failureFixture();
      const key = new f.Key();
      key[flag] = true;
      f.onInputKeyDown(key);
      expect(key.prevented).toBe(false);
      expect(f.input.value).toBe("ajuda");
      expect(f.events).toEqual([]);
    },
  );
  it("does not recover an old draft over composition that started while waiting", async () => {
    const f = failureFixture();
    const pending = deferredTurn();
    f.setTurn(() => pending.promise);
    f.submitInput("button");
    f.onCompositionStart();
    pending.resolve(failedResponse);
    await settleTurn();
    expect(f.input.value).toBe("");
  });
  it.each(["voice", "option"])(
    "consumes rejected %s callbacks after one error presentation",
    async (source) => {
      const f = failureFixture();
      f.failTurn();
      if (source === "voice") f.onVoiceResult("beaches");
      else f.onOptionSelected(new f.OptionEvent());
      await settleTurn();
      expect(f.events).toEqual(["loading", "error"]);
      expect(f.messages).toHaveLength(1);
      expect(f.input.value).toBe("ajuda");
    },
  );
  it("preserves domain unavailable responses as non-technical results", async () => {
    const f = failureFixture();
    f.setTurn(async () => ({
      text: "unavailable",
      metadata: { domain: "photos", state: "unavailable" },
    }));
    f.submitInput("button");
    await settleTurn();
    expect(f.events).toEqual(["loading", "success"]);
    expect(f.input.value).toBe("");
  });
  it("preserves whitespace-only input without a request", () => {
    const f = failureFixture();
    f.input.value = "  ";
    f.submitInput("button");
    expect(f.input.value).toBe("  ");
    expect(f.events).toEqual([]);
  });
  it("uses the current presentation language when a pending turn fails", async () => {
    const f = failureFixture("pt-BR");
    const pending = deferredTurn();
    f.setTurn(() => pending.promise);
    f.submitInput("button");
    f.document.documentElement.lang = "he";
    pending.reject(new Error("deferred failure"));
    await settleTurn();
    expect(f.messages).toEqual([assistantUiStateStatus("error", "he")]);
  });
});

const source = readFileSync(
  new URL("./browser-assistant-runtime.ts", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "browser-assistant-runtime.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
let syncExpression = "";
let categoryFunction = "";
function visit(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(ast) === "syncExploreContext"
  )
    syncExpression = node.initializer?.getText(ast) ?? "";
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "toProfileInterestCategory"
  )
    categoryFunction = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!syncExpression || !categoryFunction)
  throw new Error("Actual runtime context functions missing");
const body = ts.transpileModule(
  `${categoryFunction}\nlet profiledExploreCategory = null; let profiledExplorePlace = null; return (${syncExpression});`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const compose = compileFunction(body, [
  "readExploreState",
  "context",
  "profile",
]) as (...args: unknown[]) => (hint?: string) => void;

function fixture() {
  const stored = new Map<string, string>();
  const context = createAssistantContextManager({
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => {
        stored.set(key, value);
      },
      removeItem: (key) => {
        stored.delete(key);
      },
    },
  });
  const profile = { recordInteraction: vi.fn() };
  let state: {
    stage: string;
    place: string | null;
    category: string | null;
    tour: AssistantActiveTourContext | null;
  } = { stage: "menu", place: null, category: null, tour: null };
  const sync = compose(() => state, context, profile);
  const step = (
    stage: string,
    place: string | null,
    category: string | null,
    tour: AssistantActiveTourContext | null = null,
  ) => {
    state = { stage, place, category, tour };
    sync();
    context.flush();
    return context.getContext();
  };
  return { context, profile, stored, step };
}

describe("actual browser runtime Explore context transitions", () => {
  it.each(["search", "menu", "places"])(
    "clears selected place and category on %s while preserving navigation",
    (stage) => {
      const f = fixture();
      const navigation = {
        active: true,
        destination: "Existing destination",
        phase: "active" as const,
      };
      f.context.updateContext({ navigationState: navigation });
      expect(f.step("detail", "Canonical A", "beaches").lastPlace).toBe(
        "Canonical A",
      );
      const result = f.step(stage, null, null);
      expect(result.lastPlace).toBeNull();
      expect(result.lastCategory).toBeNull();
      expect(result.awaiting).toBeNull();
      expect(result.navigationState).toEqual(navigation);
      const persisted = JSON.parse(
        f.stored.get("assistantContext") ?? "null",
      ) as { lastPlace: string | null };
      expect(persisted.lastPlace).toBeNull();
    },
  );
  it("keeps current search category while clearing the previous detail", () => {
    const f = fixture();
    f.step("detail", "Canonical A", "restaurants");
    expect(f.step("search", null, "beaches")).toMatchObject({
      lastPlace: null,
      lastCategory: "beaches",
      awaiting: null,
    });
  });
  it("preserves valid active detail and deduplicates repeated selection recording", () => {
    const f = fixture();
    f.step("detail", "Canonical B", "beaches");
    const count = f.profile.recordInteraction.mock.calls.length;
    expect(f.step("detail", "Canonical B", "beaches").lastPlace).toBe(
      "Canonical B",
    );
    expect(f.profile.recordInteraction).toHaveBeenCalledTimes(count);
    f.step("search", null, null);
    f.step("detail", "Canonical B", "beaches");
    expect(f.profile.recordInteraction.mock.calls.length).toBeGreaterThan(
      count,
    );
  });
  it("retains category selection waiting contracts", () => {
    const f = fixture();
    f.step("detail", "A", "beaches");
    expect(f.step("filters", null, "hotels")).toMatchObject({
      lastPlace: null,
      lastCategory: "hotels",
      awaiting: { type: "selecionar_subcategoria", category: "hotels" },
    });
    expect(f.step("places", null, "hotels")).toMatchObject({
      lastPlace: null,
      lastCategory: "hotels",
      awaiting: { type: "selecionar_local", category: "hotels" },
    });
  });
  it("preserves an active tour snapshot without changing navigation", () => {
    const f = fixture();
    const tour = {
      tourId: "tour-existing",
      stage: "stop" as const,
      currentStopIndex: 1,
      totalStops: 3,
    };
    const navigation = f.context.getContext().navigationState;
    expect(f.step("tour", null, "tours", tour)).toMatchObject({
      activeTour: tour,
      navigationState: navigation,
      lastIntent: "tour",
    });
  });
});

describe("actual runtime contextual copy uses canonical location counts", () => {
  it.each([
    { markerCount: 2, locationCount: 9, expected: 9 },
    { markerCount: 8, locationCount: 0, expected: 0 },
    { markerCount: 3, expected: 3 },
    ...[null, undefined, Number.NaN, -1, 1.5].map((locationCount) => ({
      markerCount: 5,
      locationCount,
      expected: null,
    })),
  ])(
    "separates semantic count from symbols for $expected locations",
    (snapshot) => {
      let expression = "";
      function find(node: ts.Node): void {
        if (
          ts.isVariableDeclaration(node) &&
          node.name.getText(ast) === "syncExploreContextualMessage"
        )
          expression = node.initializer?.getText(ast) ?? "";
        ts.forEachChild(node, find);
      }
      find(ast);
      if (!expression)
        throw new Error("Actual runtime contextual closure missing");
      const seen: Array<number | null> = [];
      class Message {
        dataset: Record<string, string> = { messageType: "category-flow" };
        textContent = "";
      }
      const message = new Message();
      const parameters = {
        readExploreState: () => ({
          ...snapshot,
          stage: "places",
          category: "beaches",
          place: null,
        }),
        resolveExploreContextualState: () => "results_found",
        resolveExploreLocationCount,
        options: {
          document: {
            getElementById: () => message,
            documentElement: { lang: "pt-BR" },
          },
        },
        HTMLElement: Message,
        normalizeAssistantContextualLanguage: () => "pt-BR",
        resolveAssistantContextualCategoryLabel: () => "Praias",
        resolveAssistantContextualCopy: (
          _: string,
          values: { count: number | null },
        ) => {
          seen.push(values.count);
          return {
            message:
              values.count === null
                ? "Unable to confirm results"
                : `${values.count} locais`,
          };
        },
        conversation: {
          snapshot: () => ({}),
          transition: (values: { resultCount: number | null }) => {
            seen.push(values.resultCount);
            return { id: "actual-turn", priority: "normal" };
          },
        },
        evaluateConversationPolicy: () => ({
          present: true,
          priority: "normal",
        }),
        composeConversationResponse: (values: { count: number | null }) => {
          seen.push(values.count);
          return {
            message:
              values.count === null
                ? "Unable to confirm results"
                : `${values.count} locais`,
            voiceCopy: "locations",
          };
        },
        composeConversationVoice: (values: { count: number | null }) => {
          seen.push(values.count);
          return "locations";
        },
      };
      const compiled = ts.transpileModule(`return (${expression});`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const createSync = compileFunction(compiled, Object.keys(parameters)) as (
        ...values: unknown[]
      ) => () => void;
      const run = createSync(...Object.values(parameters));
      run();
      expect(seen).toEqual(Array(4).fill(snapshot.expected));
      expect(message.textContent).toBe(
        snapshot.expected === null
          ? "Unable to confirm results"
          : `${snapshot.expected} locais`,
      );
    },
  );
});

describe("manual conformance recovery isolation", () => {
  const source = readFileSync(
    new URL(
      "../../tooling/home-discover-manual-conformance.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  const sourceAst = ts.createSourceFile(
    "home-discover-manual-conformance.mjs",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const orchestration = sourceAst.statements.find(ts.isTryStatement);
  if (!orchestration)
    throw new Error("Actual conformance orchestration missing");

  function fixture(recoveryOnly: boolean, rejectRecovery = false) {
    const page = {
      on: vi.fn(),
      route: vi.fn(async () => undefined),
      goto: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => undefined),
    };
    const context = {
      addInitScript: vi.fn(async () => undefined),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
    };
    const evidence = { viewports: [] as unknown[], variants: {} };
    const written = new Map<string, string>();
    const verifyAssistantFailureRecovery = vi.fn(async () => {
      if (rejectRecovery) throw new Error("controlled recovery failure");
      return {
        kind: "ASSISTANT_RECOVERY_FIXTURE",
        providerAcceptance: "NOT_RUN",
        results: [{ result: "PASS" }],
      };
    });
    const flows = {
      waitForReady: vi.fn(async () => undefined),
      assertPureDiscover: vi.fn(async () => ({ ready: true })),
      verifyManualNavigation: vi.fn(async () => ({ result: "PASS" })),
      verifyLocales: vi.fn(async () => undefined),
      verifyProfileAndPrivacy: vi.fn(async () => undefined),
      verifyAssistantEntry: vi.fn(async () => undefined),
      verifyBoundedAssistantMessage: vi.fn(async () => undefined),
      verifyVariants: vi.fn(async () => undefined),
      verifyAppliedMapFilters: vi.fn(async () => undefined),
    };
    const parameters = {
      browser,
      evidence,
      recoveryOnly,
      verifyAssistantFailureRecovery,
      writeFileSync: (path: string, content: string) =>
        written.set(path, content),
      OUTPUT_DIR: "/isolated-evidence",
      BASE_URL: "https://morro-digital-v2-staging.onrender.com/",
      viewports: [{ name: "390x844", width: 390, height: 844 }],
      weather: { temperatureCelsius: 28 },
      console: { log: vi.fn() },
      assert: (condition: boolean, message: string) => {
        if (!condition) throw new Error(message);
      },
      ...flows,
    };
    const execute = compileFunction(
      `return (async () => { ${orchestration!.getText(sourceAst)} })();`,
      Object.keys(parameters),
    ) as (...values: unknown[]) => Promise<void>;
    return {
      run: () => execute(...Object.values(parameters)),
      browser,
      context,
      page,
      evidence,
      written,
      verifyAssistantFailureRecovery,
      flows,
    };
  }

  it("keeps remote default viewport and language flows outside the recovery fixture", async () => {
    const f = fixture(false);
    await f.run();
    expect(f.verifyAssistantFailureRecovery).not.toHaveBeenCalled();
    expect(f.browser.newContext).toHaveBeenCalledTimes(1);
    expect(f.page.goto).toHaveBeenCalledWith(
      "https://morro-digital-v2-staging.onrender.com/",
      { waitUntil: "domcontentloaded", timeout: 30000 },
    );
    for (const flow of Object.values(f.flows))
      expect(flow).toHaveBeenCalledTimes(1);
    expect(f.evidence.viewports).toHaveLength(1);
    expect(
      f.written.has("/isolated-evidence/assistant-recovery-fixture.json"),
    ).toBe(false);
    expect(
      f.written.has("/isolated-evidence/ASSISTANT_RECOVERY_FIXTURE.txt"),
    ).toBe(false);
    expect(
      f.written.get("/isolated-evidence/HOME_MANUAL_CONFORMANCE.txt"),
    ).toBe("HOME_MANUAL_CONFORMANCE = PASS\n");
    expect(f.context.close).toHaveBeenCalledTimes(1);
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });

  it("runs exactly one isolated recovery fixture without real-map or provider acceptance", async () => {
    const f = fixture(true);
    await f.run();
    expect(f.verifyAssistantFailureRecovery).toHaveBeenCalledTimes(1);
    expect(f.verifyAssistantFailureRecovery).toHaveBeenCalledWith(f.browser);
    expect(f.browser.newContext).not.toHaveBeenCalled();
    for (const flow of Object.values(f.flows))
      expect(flow).not.toHaveBeenCalled();
    expect(f.evidence.viewports).toHaveLength(0);
    expect(
      JSON.parse(
        f.written.get("/isolated-evidence/assistant-recovery-fixture.json")!,
      ),
    ).toMatchObject({ providerAcceptance: "NOT_RUN" });
    expect(
      f.written.has("/isolated-evidence/HOME_MANUAL_CONFORMANCE.txt"),
    ).toBe(false);
    expect(
      f.written.get("/isolated-evidence/ASSISTANT_RECOVERY_FIXTURE.txt"),
    ).toBe("ASSISTANT_RECOVERY_FIXTURE = PASS\n");
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });

  it("retains failure evidence and closes the browser when recovery rejects", async () => {
    const f = fixture(true, true);
    await expect(f.run()).rejects.toThrow("controlled recovery failure");
    expect(f.verifyAssistantFailureRecovery).toHaveBeenCalledTimes(1);
    expect(f.written.get("/isolated-evidence/failure.txt")).toContain(
      "controlled recovery failure",
    );
    expect(
      f.written.get("/isolated-evidence/ASSISTANT_RECOVERY_FIXTURE.txt"),
    ).toBe("ASSISTANT_RECOVERY_FIXTURE = FAIL\n");
    expect(
      f.written.has("/isolated-evidence/assistant-recovery-fixture.json"),
    ).toBe(false);
    expect(f.browser.close).toHaveBeenCalledTimes(1);
  });
});

describe("actual assistant turn waits for feature styles", () => {
  it("does not publish unstyled loading or error messages when stylesheet loading fails", async () => {
    const f = failureFixture("pt-BR", () =>
      Promise.reject(new Error("FEATURE_STYLES_UNAVAILABLE")),
    );
    const turn = vi.fn(async () => ({ text: "ready" }));
    f.setTurn(turn);
    await expect(f.processInput("beaches")).rejects.toThrow(
      "FEATURE_STYLES_UNAVAILABLE",
    );
    expect(turn).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
    expect(f.messages).toEqual([]);
  });
  it("does not execute an old turn after the controller is destroyed while styles load", async () => {
    let release!: () => void;
    const styles = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = failureFixture("pt-BR", () => styles);
    const turn = vi.fn(async () => ({ text: "ready" }));
    f.setTurn(turn);
    const pending = f.processInput("beaches");
    expect(turn).not.toHaveBeenCalled();
    f.destroy();
    release();
    expect((await pending).metadata?.state).toBe("superseded");
    expect(turn).not.toHaveBeenCalled();
    expect(f.events).toEqual([]);
  });
  it("keeps the latest turn and invokes it exactly once after shared styles finish", async () => {
    let release!: () => void;
    const styles = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = failureFixture("pt-BR", () => styles);
    const turn = vi.fn(async () => ({ text: "ready" }));
    f.setTurn(turn);
    const old = f.processInput("old");
    const current = f.processInput("current");
    release();
    expect((await old).metadata?.state).toBe("superseded");
    expect((await current).text).toBe("ready");
    expect(turn).toHaveBeenCalledOnce();
  });
});

describe("canonical saved place action", () => {
  function fixture() {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const profile = createAssistantUserProfileManager({ storage });
    const javascript = ts.transpileModule(
      runtimeFunction("saveCanonicalPlaceAction"),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
    ).outputText;
    const createSave = compileFunction(
      javascript + "; return saveCanonicalPlaceAction;",
      ["ASSISTANT_PROFILE_STORAGE_KEY"],
    ) as (
      key: string,
    ) => (
      input: string,
      state: unknown,
      profile: unknown,
      storage: unknown,
      language: string,
    ) => AssistantDialogResponse | null;
    const save = createSave(ASSISTANT_PROFILE_STORAGE_KEY);
    const state = {
      stage: "detail",
      source: "canonical",
      placeId: "place-a",
      place: "Toca do Morcego",
      category: "nightlife",
    };
    return { save, state, storage, profile, values };
  }
  it.each(["pt", "en", "es", "he"])(
    "persists through the shared profile and confirms in %s",
    (language) => {
      const f = fixture();
      const response = f.save(
        "place-action:save:place-a:add",
        f.state,
        f.profile,
        f.storage,
        language,
      );
      expect(response?.metadata?.state).toBe("saved");
      expect(response?.text).not.toContain("place-action:");
      expect(
        createAssistantUserProfileManager({
          storage: f.storage,
        }).getFavoritePlaces(),
      ).toContainEqual(
        expect.objectContaining({
          name: "Toca do Morcego",
          category: "nightlife",
        }),
      );
      f.profile.recordInteraction("next prompt");
      expect(
        JSON.parse(f.storage.getItem(ASSISTANT_PROFILE_STORAGE_KEY)!)
          .favoritePlaces,
      ).toHaveLength(1);
      f.save(
        "place-action:save:place-a:add",
        f.state,
        f.profile,
        f.storage,
        language,
      );
      expect(f.profile.getFavoritePlaces()).toHaveLength(1);
    },
  );
  it("consumes the actual runtime option before residual or search dispatch", async () => {
    const f = fixture();
    const search = vi.fn();
    const append = vi.fn();
    const parameters = {
      options: { document: {}, explore: { getState: () => f.state } },
      profile: f.profile,
      storage: f.storage,
      syncExploreContext: () => {},
      presentationLanguage: () => "pt",
      commerceCheckoutUrl: () => null,
      saveCanonicalPlaceAction: f.save,
      clearAssistantDomOptions: () => {},
      removePhotoPresentation: () => {},
      appendStandardMessage: append,
      snapshotPresentation: (text: string) => ({ text, options: [] }),
      resolveAssistantV1ResidualCommand: search,
    };
    const source = `let destroyed=false,requestGeneration=0,assistantUiGeneration=0,currentPresentation=null; const voice=undefined;const processInput=${runtimeClosure("executeInputTurn")};return processInput;`;
    const javascript = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const createProcess = compileFunction(
      javascript,
      Object.keys(parameters),
    ) as (
      ...args: unknown[]
    ) => (input: string) => Promise<AssistantDialogResponse>;
    const processInput = createProcess(...Object.values(parameters));
    const response = await processInput("place-action:save:place-a:add");
    expect(response.metadata?.state).toBe("saved");
    expect(search).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith(
      "assistant",
      "Local salvo neste dispositivo.",
    );
  });
  it("removes the selected place and preserves other favorites", () => {
    const f = fixture();
    f.profile.addFavoritePlace({ name: "Farol" });
    f.save(
      "place-action:save:place-a:add",
      f.state,
      f.profile,
      f.storage,
      "pt",
    );
    expect(
      f.save(
        "place-action:save:place-a:remove",
        f.state,
        f.profile,
        f.storage,
        "pt",
      )?.metadata?.state,
    ).toBe("removed");
    expect(f.profile.getFavoritePlaces().map((p) => p.name)).toEqual(["Farol"]);
  });
  it.each([
    { placeId: "place-b" },
    { stage: "menu" },
    { source: "legacy" },
    { placeId: null },
  ])("refuses stale or noncanonical context %j", (change) => {
    const f = fixture();
    const before = f.storage.getItem(ASSISTANT_PROFILE_STORAGE_KEY);
    expect(
      f.save(
        "place-action:save:place-a:add",
        { ...f.state, ...change },
        f.profile,
        f.storage,
        "pt",
      )?.metadata?.state,
    ).toBe("stale");
    expect(f.storage.getItem(ASSISTANT_PROFILE_STORAGE_KEY)).toBe(before);
    expect(f.profile.getFavoritePlaces()).toEqual([]);
  });
  it.each([
    "place-action:save:place-a:add:extra",
    "place-action:save:place-a:",
    "place-action:save:place-b:add",
  ])("does not turn invalid save tokens into search: %s", (value) => {
    const f = fixture();
    expect(
      f.save(value, f.state, f.profile, f.storage, "pt")?.metadata?.state,
    ).toBe("stale");
  });
  it("reports persistence failure without changing the in-memory favorites", () => {
    const f = fixture();
    const storage = {
      getItem: f.storage.getItem,
      setItem: () => {
        throw Error("quota");
      },
    };
    expect(
      f.save("place-action:save:place-a:add", f.state, f.profile, storage, "pt")
        ?.metadata?.state,
    ).toBe("unavailable");
    expect(f.profile.getFavoritePlaces()).toEqual([]);
  });
  it("requires persistent storage and rejects a silent failed write", () => {
    const f = fixture();
    for (const storage of [
      undefined,
      { getItem: f.storage.getItem, setItem: () => {} },
    ]) {
      expect(
        f.save(
          "place-action:save:place-a:add",
          f.state,
          f.profile,
          storage,
          "pt",
        )?.metadata?.state,
      ).toBe("unavailable");
    }
    expect(f.profile.getFavoritePlaces()).toEqual([]);
  });
  it("leaves ordinary prompts to their normal handler", () => {
    const f = fixture();
    expect(
      f.save("Toca do Morcego", f.state, f.profile, f.storage, "pt"),
    ).toBeNull();
  });
});
