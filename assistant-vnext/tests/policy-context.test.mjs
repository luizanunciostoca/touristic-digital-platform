import test from "node:test";
import assert from "node:assert/strict";
import { AssistantPolicyEngine, AssistantContextEnvelopeSchema } from "../dist/index.js";

function ctx({ locationAllowed = false, profileAllowed = false, withLocation = false } = {}) {
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
    destination: { destinationId: null, locale: "pt" },
    location: withLocation
      ? {
          latitude: -13.381,
          longitude: -38.913,
          provenance: { source: "fixture", observedAt: "2026-09-30T00:00:00.000Z" },
        }
      : null,
    map: {},
    explore: {},
    navigation: { active: false, destinationId: null, phase: "idle" },
    business: {},
    commerce: { intent: null, cartId: null, orderId: null },
    ticketing: {},
    payment: { status: null, transactionRef: null },
    environment: { online: true, timezone: "UTC" },
    permissions: { scopes: [], locationAllowed, profileAllowed, memoryWriteAllowed: false },
    capabilities: { available: [], unavailable: [] },
    memory: { refs: [] },
    metadata: {
      assembledAt: "2026-09-30T00:00:00.000Z",
      source: "test",
      freshnessSeconds: 0,
      redactions: [],
      contextFingerprint: "1".repeat(64),
    },
  });
}
const policy = new AssistantPolicyEngine({
  executeEnabled: false,
  memoryWritesEnabled: false,
  proactiveEnabled: false,
  disabledTools: new Set(),
  unhealthyDomains: new Set(),
});

test("location capability requires consent and actual location", () => {
  const descriptor = {
    name: "place.nearby",
    effect: "read",
    permissions: ["context:location"],
    offlineAllowed: false,
    domain: "places",
  };
  assert.equal(policy.evaluateTool(descriptor, ctx()).ok, false);
  assert.equal(
    policy.evaluateTool(descriptor, ctx({ locationAllowed: true, withLocation: false })).ok,
    false,
  );
  assert.equal(
    policy.evaluateTool(descriptor, ctx({ locationAllowed: true, withLocation: true })).ok,
    true,
  );
});

test("profile capability requires profile permission", () => {
  const descriptor = {
    name: "profile.get",
    effect: "read",
    permissions: ["context:profile"],
    offlineAllowed: false,
    domain: "profile",
  };
  assert.equal(policy.evaluateTool(descriptor, ctx()).ok, false);
  assert.equal(policy.evaluateTool(descriptor, ctx({ profileAllowed: true })).ok, true);
});
