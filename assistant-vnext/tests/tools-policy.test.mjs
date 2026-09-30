import test from "node:test";
import assert from "node:assert/strict";
import {
  AssistantContextEnvelopeSchema,
  AssistantPolicyEngine,
  AssistantToolRegistry,
  AssistantCapabilityGateway,
  createMockDomainTools,
} from "../dist/index.js";

function context(overrides = {}) {
  return AssistantContextEnvelopeSchema.parse({
    schemaVersion: "1.0",
    session: { sessionId: "s", startedAt: "2026-09-30T00:00:00.000Z" },
    user: { userType: "unknown", authenticated: false },
    profile: { locale: "pt", interests: [], preferenceHints: [], favoritePlaceIds: [] },
    conversation: {
      conversationId: "c",
      turnId: "t",
      inputSource: "keyboard",
      locale: "pt",
      recentTurnRefs: [],
    },
    destination: { destinationId: "morro", locale: "pt" },
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
      assembledAt: "2026-09-30T00:00:00.000Z",
      source: "test",
      freshnessSeconds: 0,
      redactions: [],
      contextFingerprint: "a".repeat(64),
    },
    ...overrides,
  });
}

function setup() {
  const registry = new AssistantToolRegistry();
  for (const tool of createMockDomainTools({
    places: [{ id: "r1", name: "Restaurante Azul", category: "restaurants", hours: "18:00-23:00" }],
    businesses: [],
    events: [],
    weather: { current: { condition: "rain" } },
    offers: [],
    tickets: [],
  }))
    registry.register(tool);
  const policy = new AssistantPolicyEngine({
    executeEnabled: false,
    memoryWritesEnabled: false,
    proactiveEnabled: false,
    disabledTools: new Set(),
    unhealthyDomains: new Set(),
  });
  return { registry, gateway: new AssistantCapabilityGateway(registry, policy) };
}

test("registry contains the required initial tool catalog", () => {
  const { registry } = setup();
  assert.equal(registry.list().length, 41);
  assert.ok(registry.resolve("place.search").ok);
  assert.ok(registry.resolve("support.prepare_request").ok);
});

test("gateway denies unregistered tools", async () => {
  const { gateway } = setup();
  const result = await gateway.invoke({ name: "crm.raw_query", arguments: {} }, context(), {
    conversationId: "c",
    turnId: "t",
    locale: "pt",
    authScopes: [],
    correlationId: "x",
    featureFlags: {},
    abortSignal: new AbortController().signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "POLICY_DENIED");
});

test("gateway rejects invalid tool arguments before execution", async () => {
  const { gateway } = setup();
  const result = await gateway.invoke({ name: "place.get", arguments: { id: "" } }, context(), {
    conversationId: "c",
    turnId: "t",
    locale: "pt",
    authScopes: [],
    correlationId: "x",
    featureFlags: {},
    abortSignal: new AbortController().signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "VALIDATION_FAILED");
});

test("read tool returns evidence through gateway", async () => {
  const { gateway } = setup();
  const result = await gateway.invoke({ name: "place.get", arguments: { id: "r1" } }, context(), {
    conversationId: "c",
    turnId: "t",
    locale: "pt",
    authScopes: [],
    correlationId: "x",
    featureFlags: {},
    abortSignal: new AbortController().signal,
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.evidence.length, 1);
});
