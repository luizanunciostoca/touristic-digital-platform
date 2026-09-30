import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  AssistantToolRegistry,
  AssistantCapabilityGateway,
  AssistantPolicyEngine,
  AssistantContextEnvelopeSchema,
} from "../dist/index.js";

function context() {
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
    location: null,
    map: {},
    explore: {},
    navigation: { active: false, destinationId: null, phase: "idle" },
    business: {},
    commerce: { intent: null, cartId: null, orderId: null },
    ticketing: {},
    payment: { status: null, transactionRef: null },
    environment: { online: true, timezone: "UTC" },
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
      contextFingerprint: "2".repeat(64),
    },
  });
}
const execution = {
  conversationId: "c",
  turnId: "t",
  locale: "pt",
  authScopes: [],
  correlationId: "r",
  featureFlags: {},
  abortSignal: new AbortController().signal,
};

test("gateway applies bounded retry policy only to retryable failures", async () => {
  let attempts = 0;
  const registry = new AssistantToolRegistry();
  registry.register({
    name: "test.retry",
    version: "1",
    description: "retry",
    effect: "read",
    domain: "test",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ value: z.number() }).strict(),
    permissions: [],
    timeoutMs: 1000,
    retryAttempts: 2,
    idempotent: true,
    offlineAllowed: true,
    execute: async () => {
      attempts += 1;
      if (attempts < 3)
        return { ok: false, error: { code: "UNAVAILABLE", message: "temporary", retryable: true } };
      return {
        ok: true,
        value: { data: { value: 3 }, evidence: [], observedAt: "2026-09-30T00:00:00.000Z" },
      };
    },
  });
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
  const result = await gateway.invoke({ name: "test.retry", arguments: {} }, context(), execution);
  assert.equal(result.ok, true);
  assert.equal(attempts, 3);
});

test("registry freezes security-critical descriptors after registration", () => {
  const registry = new AssistantToolRegistry();
  const definition = {
    name: "test.freeze",
    version: "1",
    description: "freeze",
    effect: "read",
    domain: "test",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({}).strict(),
    permissions: [],
    timeoutMs: 100,
    retryAttempts: 0,
    idempotent: true,
    offlineAllowed: true,
    execute: async () => ({
      ok: true,
      value: { data: {}, evidence: [], observedAt: "2026-09-30T00:00:00.000Z" },
    }),
  };
  registry.register(definition);
  const resolved = registry.resolve("test.freeze");
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(Object.isFrozen(resolved.value), true);
  assert.equal(Object.isFrozen(resolved.value.permissions), true);
});
