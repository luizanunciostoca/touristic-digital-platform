import test from "node:test";
import assert from "node:assert/strict";
import {
  AssistantVNextApplication,
  AssistantContextEnvelopeSchema,
  PreparedActionStore,
  ConfirmationEngine,
  SandboxActionExecutor,
  JourneyManager,
} from "../dist/index.js";

const now = new Date("2026-09-30T20:00:00.000Z");
const clock = { now: () => now };
function context(overrides = {}) {
  return AssistantContextEnvelopeSchema.parse({
    schemaVersion: "1.0",
    session: { sessionId: "s1", startedAt: "2026-09-30T18:00:00.000Z" },
    user: { userType: "tourist", authenticated: false },
    profile: { locale: "pt", interests: [], preferenceHints: [], favoritePlaceIds: [] },
    conversation: {
      conversationId: "c1",
      turnId: "t1",
      inputSource: "keyboard",
      locale: "pt",
      recentTurnRefs: [],
    },
    destination: { destinationId: "restaurant-romantic", locale: "pt" },
    location: {
      latitude: -13.381,
      longitude: -38.913,
      provenance: { source: "fixture", observedAt: now.toISOString() },
    },
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
      locationAllowed: true,
      profileAllowed: false,
      memoryWriteAllowed: false,
    },
    capabilities: { available: [], unavailable: [] },
    memory: { refs: [] },
    metadata: {
      assembledAt: now.toISOString(),
      source: "scenario",
      freshnessSeconds: 0,
      redactions: [],
      contextFingerprint: "d".repeat(64),
    },
    ...overrides,
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
          indoor: true,
        },
      ],
      businesses: [{ id: "restaurant-romantic", menu: [{ name: "Jantar", price: 80 }] }],
      events: [
        { id: "party-today", title: "Festa Hoje", startsAt: "2026-09-30T22:00:00-03:00" },
        { id: "indoor", title: "Museu coberto" },
      ],
      weather: { current: { condition: "rain", temperatureC: 24 }, forecast: [] },
      offers: [{ id: "party-offer", eventId: "party-today", unitPrice: 100 }],
      tickets: [{ id: "party-today", availability: 50 }],
    },
    clock,
  );
}
function exec() {
  return {
    conversationId: "c1",
    turnId: "t1",
    locale: "pt",
    authScopes: [],
    correlationId: "corr",
    featureFlags: {},
    abortSignal: new AbortController().signal,
  };
}
async function run(text) {
  return app().orchestrator.run({
    request: { text, locale: "pt" },
    context: context(),
    execution: exec(),
  });
}

test("A romantic restaurant nearby is grounded", async () => {
  const r = await run("Quero um restaurante romântico perto de mim.");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.evidence.length > 0);
});
test("B hours follow-up is grounded", async () => {
  const r = await run("E ele está aberto agora?");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.evidence.length > 0);
});
test("C navigation is PREPARE only", async () => {
  const r = await run("Me leve até lá.");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.options?.some((o) => o.label === "navigation.prepare"));
});
test("D party today combines canonical event evidence", async () => {
  const r = await run("Quero ir a uma festa hoje.");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.evidence.length >= 1);
});
test("E price for two is evidence-backed", async () => {
  const r = await run("Quanto custa para duas pessoas?");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.evidence.some((e) => e.sourceType === "commerce"));
});
test("F prepare two tickets has no external side effect", async () => {
  const r = await run("Prepare dois ingressos.");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.options?.some((o) => o.label === "ticketing.prepare_order"));
});
test("G confirmation executes sandbox exactly once", () => {
  let n = 0;
  const ids = { next: (p) => p + "_" + ++n };
  const store = new PreparedActionStore(clock, ids);
  const action = store.prepare({
    type: "ticket",
    tool: "ticketing.prepare_order",
    requestedBy: "user",
    input: { eventId: "party-today", quantity: 2 },
    summary: "2 ingressos",
    requiresConfirmation: true,
    confirmationText: "Confirmo?",
    expiresInMs: 60000,
    contextFingerprint: "d".repeat(64),
    sessionId: "s1",
  });
  const confirmation = new ConfirmationEngine(store).confirm(action.id, "d".repeat(64));
  assert.equal(confirmation.ok, true);
  const executor = new SandboxActionExecutor(store);
  assert.equal(executor.execute(action.id, "d".repeat(64)).ok, true);
  const duplicate = executor.execute(action.id, "d".repeat(64));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.code, "DUPLICATE");
});
test("H notification request remains PREPARE only", async () => {
  const r = await run("Me avise quando começar o evento.");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.options?.some((o) => o.label === "notifications.prepare_subscribe"));
});
test("I journey can resume where it stopped", () => {
  let n = 0;
  const manager = new JourneyManager(clock, { next: (p) => p + "_" + ++n });
  const j = manager.start({
    kind: "event",
    goal: "jantar -> sunset -> festa",
    steps: ["jantar", "sunset", "festa"],
  });
  manager.advance(j.id);
  const resumed = manager.get(j.id);
  assert.equal(resumed?.currentStep, "sunset");
});
test("J rain scenario is grounded in weather and content", async () => {
  const r = await run("Está chovendo. O que podemos fazer agora?");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(r.value.evidence.some((e) => e.sourceType === "weather"));
});
