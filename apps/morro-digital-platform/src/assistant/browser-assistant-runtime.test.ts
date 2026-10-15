import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import {
  createAssistantContextManager,
  type AssistantActiveTourContext,
} from "@touristic/assistant";
import ts from "typescript";
import { resolveExploreLocationCount } from "./assistant-contextual-state.js";
import { describe, expect, it, vi } from "vitest";

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
