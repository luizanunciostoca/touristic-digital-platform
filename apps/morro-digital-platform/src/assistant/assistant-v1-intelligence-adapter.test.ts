import { describe, expect, it } from "vitest";

import {
  createAssistantUserProfileManager,
  createDefaultAssistantContext,
  getAssistantMainMenu,
  type AssistantDialogIntentHandlerContext,
  type AssistantIntent,
  type AssistantLocale,
} from "@touristic/assistant";
import { morroV1SearchCatalog } from "@touristic/search";
import { createAssistantV1IntelligenceHandlers } from "./assistant-v1-intelligence-adapter.js";

function request(
  intent: AssistantIntent,
  input: string,
  overrides: Partial<AssistantDialogIntentHandlerContext["intent"]> = {},
): AssistantDialogIntentHandlerContext {
  return {
    input,
    intent: {
      intent,
      confidence: 1,
      entities: { language: "pt" },
      normalized: input.toLowerCase(),
      modifiers: [],
      ...overrides,
    },
    context: createDefaultAssistantContext(() => 1),
  };
}

describe("V1 deterministic assistant intelligence adapter", () => {
  it("ranks a compound beach recommendation from the audited local catalog", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.recommendation?.(
      request("recommendation", "quero uma praia tranquila para crianças", {
        entities: { language: "pt", category: "beaches" },
        modifiers: ["family"],
      }),
    );

    expect(response?.metadata).toMatchObject({
      domain: "recommendation",
      state: "resolved",
      category: "beaches",
      deterministic: true,
      action: "show_category:beaches",
    });
    const catalogNames = new Set(
      morroV1SearchCatalog
        .filter((place) => place.category === "beaches")
        .map((place) => place.name),
    );
    expect(response?.options?.slice(0, 3)).toHaveLength(3);
    for (const option of response?.options?.slice(0, 3) ?? []) {
      expect(catalogNames.has(option.value)).toBe(true);
    }
  });

  it("compares only factual catalog candidates and exposes both as follow-up actions", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.compare?.(
      request("compare", "Primeira Praia ou Segunda Praia?"),
    );

    expect(response?.text).toContain("Primeira Praia");
    expect(response?.text).toContain("Segunda Praia");
    expect(response?.options).toEqual(
      expect.arrayContaining([
        { label: "Primeira Praia", value: "Primeira Praia" },
        { label: "Segunda Praia", value: "Segunda Praia" },
      ]),
    );
    expect(response?.metadata).toMatchObject({
      domain: "compare",
      state: "resolved",
      deterministic: true,
    });
  });

  it("uses lastPlace as the second comparison candidate when the user names only one", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const comparison = request("compare", "e a Segunda Praia?");
    comparison.context.lastPlace = "Primeira Praia";

    const response = await handlers.compare?.(comparison);

    expect(response?.metadata).toMatchObject({
      places: ["Primeira Praia", "Segunda Praia"],
    });
  });

  it("executes a filtered category through deterministic typed Explore commands", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.category_filtered?.(
      request("category_filtered", "quero uma praia tranquila para crianças", {
        entities: { language: "pt", category: "beaches" },
        modifiers: ["family"],
      }),
    );

    expect(response?.metadata).toMatchObject({
      domain: "category_filtered",
      filter: "familiar",
      deterministic: true,
      exploreCommands: [
        { type: "open_category", category: "beaches" },
        { type: "apply_option", value: "familiar" },
      ],
    });
  });

  it("keeps V1 transport, accessibility and practical tips deterministic before LLM", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => new Date("2026-09-16T18:30:00-03:00").getTime(),
      getWeather: async () => ({ temp: 31, precipprob: 70, condition: "rain" }),
    });

    const transport = await handlers.transport?.(
      request("transport", "como chegar em Morro de São Paulo"),
    );
    const accessibility = await handlers.accessibility?.(
      request("accessibility", "acessível para cadeira de rodas"),
    );
    const tips = await handlers.practical_tips?.(
      request("practical_tips", "dicas para hoje"),
    );

    expect(transport?.metadata).toMatchObject({
      domain: "transport",
      deterministic: true,
    });
    expect(accessibility?.metadata).toMatchObject({
      domain: "accessibility",
      emphasis: "wheelchair",
      deterministic: true,
    });
    expect(tips?.metadata).toMatchObject({
      domain: "practical_tips",
      deterministic: true,
      weatherAware: true,
    });
    expect(tips?.text).toContain("chuva");
  });

  it("turns simple category intents into typed category actions", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({ profile });
    const response = await handlers.category_beaches?.(
      request("category_beaches", "praias"),
    );

    expect(response?.metadata).toMatchObject({
      domain: "category",
      category: "beaches",
      action: "show_category:beaches",
      deterministic: true,
    });
  });

  it("keeps V1 personalized greeting text while weather reprioritizes contextual options", async () => {
    const profile = createAssistantUserProfileManager({ now: () => 1_000 });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => new Date("2026-09-16T14:00:00-03:00").getTime(),
      getWeather: async () => ({ temp: 27, precipprob: 85, condition: "rain" }),
    });
    const response = await handlers.greeting?.(request("greeting", "olá"));

    expect(response?.metadata).toMatchObject({
      domain: "proactive",
      weatherAware: true,
    });
    expect(response?.text).toContain(
      "Bem-vindo a Morro de São Paulo! Sou seu guia digital.",
    );
    expect(response?.text.toLowerCase()).not.toContain("pode chover");
    expect(response?.options?.[0]).toEqual({
      label: "🌧️ Dia de chuva — o que fazer?",
      value: "🌧️ Dia de chuva — o que fazer?",
    });
  });

  it("merges contextual labels first and completes the full canonical V1 menu", async () => {
    let now = new Date("2026-09-16T16:30:00-03:00").getTime();
    const profile = createAssistantUserProfileManager({ now: () => now });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => now,
    });

    const first = await handlers.greeting?.(request("greeting", "olá"));
    const second = await handlers.greeting?.(request("greeting", "oi"));
    const canonical = getAssistantMainMenu("pt");

    expect(first?.metadata).toMatchObject({ domain: "proactive" });
    expect(first?.options?.length).toBeGreaterThanOrEqual(canonical.length);
    for (const option of canonical) {
      expect(first?.options).toContainEqual(option);
    }
    expect(first?.metadata?.suggestion).not.toBeNull();
    expect(second?.metadata).toMatchObject({
      domain: "proactive",
      suggestion: null,
    });

    now += 5 * 60 * 1000;
    const afterCooldown = await handlers.greeting?.(
      request("greeting", "boa tarde"),
    );
    expect(afterCooldown?.metadata?.suggestion).not.toBeNull();
  });

  it("renders the V1 personalized greeting in the request locale even when the profile default is Portuguese", async () => {
    const now = new Date("2026-09-16T14:00:00-03:00").getTime();
    const profile = createAssistantUserProfileManager({
      now: () => now,
      getLanguage: () => "pt",
    });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => now,
    });
    const cases: ReadonlyArray<
      Readonly<{ locale: AssistantLocale; input: string; greeting: string }>
    > = [
      {
        locale: "pt",
        input: "olá",
        greeting: "Bem-vindo a Morro de São Paulo! Sou seu guia digital.",
      },
      {
        locale: "en",
        input: "hello",
        greeting: "Welcome to Morro de São Paulo! I am your digital guide.",
      },
      {
        locale: "es",
        input: "hola",
        greeting: "Bienvenido a Morro de São Paulo. Soy tu guía digital.",
      },
      {
        locale: "he",
        input: "שלום",
        greeting: "ברוך הבא למורו דה סאו פאולו",
      },
    ];

    for (const item of cases) {
      const response = await handlers.greeting?.(
        request("greeting", item.input, {
          entities: { language: item.locale },
        }),
      );
      expect(response?.text).toContain(item.greeting);
      for (const option of getAssistantMainMenu(item.locale)) {
        expect(response?.options).toContainEqual(option);
      }
    }
  });

  it("restores V1 greeting continuation for the last place and recent category", async () => {
    const now = new Date("2026-09-16T14:00:00-03:00").getTime();
    const profile = createAssistantUserProfileManager({ now: () => now });
    const handlers = createAssistantV1IntelligenceHandlers({
      profile,
      now: () => now,
    });

    const placeRequest = request("greeting", "olá");
    placeRequest.context.lastPlace = "Primeira Praia";
    const placeResponse = await handlers.greeting?.(placeRequest);
    expect(placeResponse?.text).toContain(
      "Você estava vendo <b>Primeira Praia</b>. Deseja continuar de onde parou?",
    );

    const categoryRequest = request("greeting", "hello", {
      entities: { language: "en" },
    });
    categoryRequest.context.lastCategory = "beaches";
    categoryRequest.context.history.push({
      input: "beaches",
      response: "Beaches",
      timestamp: now - 1000,
    });
    const categoryResponse = await handlers.greeting?.(categoryRequest);
    expect(categoryResponse?.text).toContain(
      "Last time you explored <b>beaches</b>. Can I help with anything else?",
    );
  });
});
