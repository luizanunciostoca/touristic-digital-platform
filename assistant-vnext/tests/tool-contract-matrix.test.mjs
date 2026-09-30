import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AssistantContextEnvelopeSchema,
  AssistantToolRegistry,
  AssistantPolicyEngine,
  AssistantCapabilityGateway,
  createMockDomainTools,
  AssistantVNextApplication,
} from "../dist/index.js";

const dataset = JSON.parse(
  await readFile(new URL("../fixtures/morro-digital.json", import.meta.url), "utf8"),
);
const samples = {
  "place.search": { query: "restaurante" },
  "place.get": { id: "restaurant-romantic" },
  "place.nearby": {
    latitude: -13.381,
    longitude: -38.913,
    radiusMeters: 3000,
    category: "restaurants",
  },
  "place.photos": { id: "restaurant-romantic" },
  "place.hours": { id: "restaurant-romantic" },
  "business.get": { id: "restaurant-romantic" },
  "business.menu": { id: "restaurant-romantic" },
  "business.contact": { id: "restaurant-romantic" },
  "business.products": { id: "restaurant-romantic" },
  "business.availability": { id: "restaurant-romantic" },
  "weather.current": { latitude: -13.381, longitude: -38.913 },
  "weather.forecast": { latitude: -13.381, longitude: -38.913 },
  "map.show_place": { id: "restaurant-romantic" },
  "map.show_category": { category: "restaurants" },
  "map.apply_filter": { filters: { open: true } },
  "navigation.prepare": { destinationId: "restaurant-romantic" },
  "navigation.start": { destinationId: "restaurant-romantic" },
  "navigation.stop": {},
  "navigation.status": {},
  "content.search": { query: "festa" },
  "content.destination_info": {},
  "content.events": {},
  "commerce.offers": {},
  "commerce.offer_details": { id: "party-offer" },
  "commerce.prepare_checkout": { id: "party-offer" },
  "ticketing.events": {},
  "ticketing.availability": { id: "party-today" },
  "ticketing.prepare_order": { eventId: "party-today", quantity: 2 },
  "ticketing.order_status": { reference: "order-1" },
  "payments.status": { reference: "payment-1" },
  "profile.get": {},
  "profile.preferences.get": {},
  "profile.preferences.prepare_update": { key: "language", value: "pt" },
  "favorites.list": {},
  "favorites.prepare_add": { id: "restaurant-romantic" },
  "favorites.prepare_remove": { id: "restaurant-romantic" },
  "notifications.prepare_subscribe": { id: "party-today" },
  "notifications.prepare_unsubscribe": { id: "party-today" },
  "affiliate.context": {},
  "support.context": {},
  "support.prepare_request": { query: "Preciso de ajuda" },
};

function context() {
  return AssistantContextEnvelopeSchema.parse({
    schemaVersion: "1.0",
    session: { sessionId: "s", startedAt: "2026-09-30T00:00:00.000Z" },
    user: { userType: "tourist", authenticated: false },
    profile: { locale: "pt", interests: [], preferenceHints: [], favoritePlaceIds: [] },
    conversation: {
      conversationId: "c",
      turnId: "t",
      inputSource: "keyboard",
      locale: "pt",
      recentTurnRefs: [],
    },
    destination: { destinationId: "morro", locale: "pt" },
    location: {
      latitude: -13.381,
      longitude: -38.913,
      provenance: { source: "fixture", observedAt: "2026-09-30T00:00:00.000Z" },
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
      profileAllowed: true,
      memoryWriteAllowed: false,
    },
    capabilities: { available: [], unavailable: [] },
    memory: { refs: [] },
    metadata: {
      assembledAt: "2026-09-30T00:00:00.000Z",
      source: "contract",
      freshnessSeconds: 0,
      redactions: [],
      contextFingerprint: "f".repeat(64),
    },
  });
}

test("all 41 registered tools satisfy contracts through the gateway", async () => {
  const registry = new AssistantToolRegistry();
  for (const tool of createMockDomainTools(dataset)) registry.register(tool);
  const gateway = new AssistantCapabilityGateway(
    registry,
    new AssistantPolicyEngine({
      executeEnabled: false,
      memoryWritesEnabled: false,
      proactiveEnabled: false,
      disabledTools: new Set(),
      unhealthyDomains: new Set(),
    }),
  );
  assert.equal(registry.list().length, 41);
  for (const descriptor of registry.list()) {
    const result = await gateway.invoke(
      { name: descriptor.name, version: descriptor.version, arguments: samples[descriptor.name] },
      context(),
      {
        conversationId: "c",
        turnId: "t",
        locale: "pt",
        authScopes: [],
        correlationId: "contract-" + descriptor.name,
        featureFlags: {},
        abortSignal: new AbortController().signal,
      },
    );
    assert.equal(result.ok, true, descriptor.name + " contract failed");
  }
});

test("PREPARE plan emits PreparedAction and sandbox execution requires confirmation", async () => {
  let n = 0;
  const app = new AssistantVNextApplication(
    dataset,
    { now: () => new Date("2026-09-30T20:00:00.000Z") },
    { next: (p) => p + "_" + ++n },
  );
  const ctx = context();
  const result = await app.orchestrator.run({
    request: { text: "Prepare dois ingressos.", locale: "pt" },
    context: ctx,
    execution: {
      conversationId: "c",
      turnId: "t",
      locale: "pt",
      authScopes: [],
      correlationId: "x",
      featureFlags: {},
      abortSignal: new AbortController().signal,
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.value.preparedAction);
  const action = result.value.preparedAction;
  const before = app.sandboxExecutor.execute(action.id, ctx.metadata.contextFingerprint);
  assert.equal(before.ok, false);
  assert.equal(app.confirmation.confirm(action.id, ctx.metadata.contextFingerprint).ok, true);
  assert.equal(app.sandboxExecutor.execute(action.id, ctx.metadata.contextFingerprint).ok, true);
});
