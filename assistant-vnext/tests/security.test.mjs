import test from "node:test";
import assert from "node:assert/strict";
import {
  AssistantPlanValidator,
  AssistantToolRegistry,
  AssistantPolicyEngine,
  AssistantCapabilityGateway,
  AssistantContextEnvelopeSchema,
} from "../dist/index.js";

const registry = new AssistantToolRegistry();
const validator = new AssistantPlanValidator(registry);

test("planner cannot invoke arbitrary URL or unknown tool", () => {
  const result = validator.validate({
    goal: "inject",
    steps: [
      {
        id: "1",
        tool: "https://evil.invalid/tool",
        version: "1",
        input: {},
        dependencies: [],
        effect: "read",
        status: "ready",
      },
    ],
    requiredEvidence: [],
    requiresConfirmation: false,
    fallbackStrategy: "deny",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "POLICY_DENIED");
});

test("planner cannot schedule execute directly", () => {
  registry.register({
    name: "sandbox.execute",
    version: "1",
    description: "x",
    effect: "execute",
    domain: "sandbox",
    inputSchema: { safeParse: (x) => ({ success: true, data: x }) },
    outputSchema: { safeParse: (x) => ({ success: true, data: x }) },
    permissions: [],
    timeoutMs: 100,
    retryAttempts: 0,
    idempotent: true,
    offlineAllowed: true,
    execute: async () => ({
      ok: true,
      value: { data: {}, evidence: [], observedAt: new Date().toISOString() },
    }),
  });
  const result = validator.validate({
    goal: "x",
    steps: [
      {
        id: "1",
        tool: "sandbox.execute",
        version: "1",
        input: {},
        dependencies: [],
        effect: "execute",
        status: "ready",
      },
    ],
    requiredEvidence: [],
    requiresConfirmation: true,
    fallbackStrategy: "deny",
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "POLICY_DENIED");
});

test("offline policy denies online-only capabilities", () => {
  const policy = new AssistantPolicyEngine({
    executeEnabled: false,
    memoryWritesEnabled: false,
    proactiveEnabled: false,
    disabledTools: new Set(),
    unhealthyDomains: new Set(),
  });
  const ctx = AssistantContextEnvelopeSchema.parse({
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
    environment: { online: false, timezone: "UTC" },
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
      contextFingerprint: "c".repeat(64),
    },
  });
  const result = policy.evaluateTool(
    {
      name: "weather.current",
      effect: "read",
      permissions: [],
      offlineAllowed: false,
      domain: "weather",
    },
    ctx,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "UNAVAILABLE");
});
