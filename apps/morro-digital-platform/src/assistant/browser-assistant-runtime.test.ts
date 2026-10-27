import { ensureFeatureStyles } from "../map/feature-styles.js";
import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import {
  createAssistantContextManager,
  createAssistantDialogController,
  createDefaultAssistantContext,
  type AssistantDialogResponse,
  type AssistantActiveTourContext,
} from "@touristic/assistant";
import ts from "typescript";
import { resolveExploreLocationCount } from "./assistant-contextual-state.js";
import { assistantUiStateStatus } from "./assistant-ui-state.js";
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

function failureFixture(
  language = "pt-BR",
  styleLoader: typeof ensureFeatureStyles = ensureFeatureStyles,
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
  let state = createDefaultAssistantContext(() => 1000);
  const dependencies = {
    options: {
      document: {
        documentElement: { lang: language },
        querySelector: () => null,
      },
    },
    ensureFeatureStyles: styleLoader,
    assistantUiStateStatus,
    createAssistantDialogController,
    createAssistantLlmHandler: () => async () => null,
    context: {
      getContext: () => state,
      updateContext: (value: Partial<typeof state>) => {
        state = { ...state, ...value };
      },
      addToHistory: vi.fn(),
    },
    profile: undefined,
    domainHandlers: {
      help: () => {
        throw new Error("handler failed");
      },
    },
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
    "controller",
    "processInputTurn",
    "processInput",
    "submitInput",
    "onComposerInput",
    "onCompositionStart",
    "onCompositionEnd",
    "onInputKeyDown",
    "onOptionSelected",
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
  function findVoice(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(voiceAst) === "onResult"
    )
      onResult = node.initializer.getText(voiceAst);
    ts.forEachChild(node, findVoice);
  }
  findVoice(voiceAst);
  if (!onResult) throw new Error("Actual voice result callback missing");
  const superseded = ast.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "supersededResponse",
  );
  if (!superseded) throw new Error("Actual superseded response missing");
  const compiled = ts.transpileModule(
    `
    ${superseded.getText(ast)}
    let destroyed = false, assistantUiGeneration = 0, composerRevision = 0, composerComposing = false;
    let legacyMenuRouting = false;
    let executeInputTurn = (value) => controller.processUserInput(value);
    ${declarations}
    const onVoiceResult = ${onResult};
    return { processInput, submitInput, onComposerInput, onCompositionStart, onCompositionEnd, onInputKeyDown, onOptionSelected, onVoiceResult,
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
  };
  const runtime = createRuntime(...Object.values(dependencies));
  return {
    ...runtime,
    input,
    events,
    messages,
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
function deferredTurn() {
  let resolve!: (response: AssistantDialogResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AssistantDialogResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

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
