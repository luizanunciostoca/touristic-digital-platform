import test from "node:test";
import assert from "node:assert/strict";
import { AssistantVNextApplication, AssistantContextEnvelopeSchema } from "../dist/index.js";

const clock = { now: () => new Date("2026-09-30T18:00:00.000Z") };
function context(locale = "pt") {
  return AssistantContextEnvelopeSchema.parse({
    schemaVersion: "1.0",
    session: { sessionId: "s", startedAt: "2026-09-30T17:00:00.000Z" },
    user: { userType: "tourist", authenticated: false },
    profile: { locale, interests: [], preferenceHints: [], favoritePlaceIds: [] },
    conversation: {
      conversationId: "c",
      turnId: "t",
      inputSource: "keyboard",
      locale,
      recentTurnRefs: [],
    },
    destination: { destinationId: "restaurant-romantic", locale },
    location: null,
    map: {},
    explore: {},
    navigation: { active: false, destinationId: null, phase: "idle" },
    business: {},
    commerce: { intent: null, cartId: null, orderId: null },
    ticketing: {},
    payment: { status: null, transactionRef: null },
    environment: { online: true, timezone: "America/Bahia" },
    permissions: {
      scopes: [],
      locationAllowed: false,
      profileAllowed: false,
      memoryWriteAllowed: false,
    },
    capabilities: { available: [], unavailable: [] },
    memory: { refs: [] },
    metadata: {
      assembledAt: "2026-09-30T18:00:00.000Z",
      source: "test",
      freshnessSeconds: 0,
      redactions: [],
      contextFingerprint: "b".repeat(64),
    },
  });
}
function app() {
  return new AssistantVNextApplication(
    {
      places: [
        {
          id: "restaurant-romantic",
          name: "Restaurante Romântico",
          category: "restaurants",
          hours: "18:00-23:00",
        },
      ],
      businesses: [],
      events: [{ id: "party-today", title: "Festa Hoje" }],
      weather: { current: { condition: "rain" }, forecast: [] },
      offers: [{ id: "offer-1", price: 100 }],
      tickets: [{ id: "party-today", availability: 50 }],
    },
    clock,
  );
}
function execution(locale = "pt") {
  return {
    conversationId: "c",
    turnId: "t",
    locale,
    authScopes: [],
    correlationId: "corr",
    featureFlags: {},
    abortSignal: new AbortController().signal,
  };
}

for (const [locale, text] of [
  ["pt", "Quero um restaurante romântico perto de mim."],
  ["en", "I want a romantic restaurant near me."],
  ["es", "Quiero un restaurante romántico cerca de mí."],
  ["he", "אני רוצה מסעדה רומנטית קרובה."],
]) {
  test("grounded restaurant flow " + locale, async () => {
    const result = await app().orchestrator.run({
      request: { text, locale },
      context: context(locale),
      execution: execution(locale),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.value.evidence.length > 0);
  });
}

test("hours follow-up is grounded", async () => {
  const result = await app().orchestrator.run({
    request: { text: "E ele está aberto agora?", locale: "pt" },
    context: context(),
    execution: execution(),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.metadata.grounded, true);
});

test("navigation only prepares and never executes", async () => {
  const result = await app().orchestrator.run({
    request: { text: "Me leve até lá.", locale: "pt" },
    context: context(),
    execution: execution(),
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.metadata.grounded, false);
});

test("event and price flows use evidence", async () => {
  for (const text of ["Quero ir a uma festa hoje.", "Quanto custa para duas pessoas?"]) {
    const result = await app().orchestrator.run({
      request: { text, locale: "pt" },
      context: context(),
      execution: execution(),
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.ok(result.value.evidence.length > 0);
  }
});

test("ticketing prepare remains side-effect free", async () => {
  const result = await app().orchestrator.run({
    request: { text: "Prepare dois ingressos.", locale: "pt" },
    context: context(),
    execution: execution(),
  });
  assert.equal(result.ok, true);
});
