import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  AssistantInputNormalizer,
  AssistantToolRegistry,
  AssistantCapabilityGateway,
  AssistantPolicyEngine,
  AssistantContextEnvelopeSchema,
  InMemoryTelemetrySink,
  ProactiveEngine,
  AssistantEvalRunner,
  SandboxActionExecutor,
  PreparedActionStore,
} from "../dist/index.js";

function ctx() {
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
      contextFingerprint: "e".repeat(64),
    },
  });
}

test("input normalizer strips controls and enforces size", () => {
  const normalizer = new AssistantInputNormalizer();
  const good = normalizer.normalize({
    text: "  Olá" + String.fromCharCode(0) + " mundo  ",
    locale: "pt",
    source: "keyboard",
    receivedAt: "2026-09-30T00:00:00.000Z",
  });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.value.text, "Olá mundo");
  assert.equal(
    normalizer.normalize({
      text: "x".repeat(4001),
      locale: "pt",
      source: "keyboard",
      receivedAt: "2026-09-30T00:00:00.000Z",
    }).ok,
    false,
  );
});

test("capability gateway respects cancellation", async () => {
  const registry = new AssistantToolRegistry();
  registry.register({
    name: "test.slow",
    version: "1",
    description: "slow",
    effect: "read",
    domain: "test",
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ ok: z.boolean() }).strict(),
    permissions: [],
    timeoutMs: 5000,
    retryAttempts: 0,
    idempotent: true,
    offlineAllowed: true,
    execute: async (execution) =>
      await new Promise((resolve, reject) => {
        execution.abortSignal.addEventListener(
          "abort",
          () => reject(execution.abortSignal.reason),
          { once: true },
        );
        setTimeout(
          () =>
            resolve({
              ok: true,
              value: { data: { ok: true }, evidence: [], observedAt: new Date().toISOString() },
            }),
          1000,
        );
      }),
  });
  const policy = new AssistantPolicyEngine({
    executeEnabled: false,
    memoryWritesEnabled: false,
    proactiveEnabled: false,
    disabledTools: new Set(),
    unhealthyDomains: new Set(),
  });
  const gateway = new AssistantCapabilityGateway(registry, policy);
  const controller = new AbortController();
  controller.abort(new Error("cancel"));
  const result = await gateway.invoke({ name: "test.slow", arguments: {} }, ctx(), {
    conversationId: "c",
    turnId: "t",
    locale: "pt",
    authScopes: [],
    correlationId: "x",
    featureFlags: {},
    abortSignal: controller.signal,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "CANCELLED");
});

test("telemetry is structured without needing prompt text", () => {
  const sink = new InMemoryTelemetrySink();
  sink.emit({
    name: "assistant.turn.started",
    conversationId: "c",
    turnId: "t",
    correlationId: "x",
    timestamp: "2026-09-30T00:00:00.000Z",
  });
  assert.deepEqual(
    Object.keys(sink.snapshot()[0]).sort(),
    ["conversationId", "correlationId", "name", "timestamp", "turnId"].sort(),
  );
});

test("proactive engine obeys policy threshold cooldown and critical flow", () => {
  let now = 1000000;
  const policy = new AssistantPolicyEngine({
    executeEnabled: false,
    memoryWritesEnabled: false,
    proactiveEnabled: true,
    disabledTools: new Set(),
    unhealthyDomains: new Set(),
  });
  const engine = new ProactiveEngine(policy, () => now, 1000, 0.75);
  assert.equal(
    engine.consider({
      type: "weather",
      relevance: 0.5,
      criticalFlowActive: false,
      key: "rain",
      message: "Chuva",
    }),
    null,
  );
  assert.ok(
    engine.consider({
      type: "weather",
      relevance: 0.9,
      criticalFlowActive: false,
      key: "rain",
      message: "Chuva",
    }),
  );
  assert.equal(
    engine.consider({
      type: "weather",
      relevance: 0.9,
      criticalFlowActive: false,
      key: "rain",
      message: "Chuva",
    }),
    null,
  );
  now += 1001;
  assert.equal(
    engine.consider({
      type: "weather",
      relevance: 0.9,
      criticalFlowActive: true,
      key: "rain",
      message: "Chuva",
    }),
    null,
  );
});

test("eval runner reports exact pass rate", async () => {
  const runner = new AssistantEvalRunner();
  const summary = await runner.run([
    {
      id: "a",
      category: "intent",
      locale: "pt",
      input: "x",
      run: async () => 1,
      score: (v) => ({ pass: v === 1, reason: "ok" }),
    },
    {
      id: "b",
      category: "grounding",
      locale: "pt",
      input: "x",
      run: async () => 0,
      score: (v) => ({ pass: v === 1, reason: "expected evidence" }),
    },
  ]);
  assert.equal(summary.total, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.passRate, 0.5);
});

test("concurrent duplicate sandbox execution has one winner", async () => {
  let n = 0;
  const clock = { now: () => new Date("2026-09-30T00:00:00.000Z") };
  const store = new PreparedActionStore(clock, { next: (p) => p + "_" + ++n });
  const action = store.prepare({
    type: "x",
    tool: "x",
    requestedBy: "user",
    input: {},
    summary: "x",
    requiresConfirmation: false,
    expiresInMs: 60000,
    contextFingerprint: "e".repeat(64),
    sessionId: "s",
  });
  const executor = new SandboxActionExecutor(store);
  const results = await Promise.all(
    Array.from({ length: 10 }, async () => executor.execute(action.id, "e".repeat(64))),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.error.code === "DUPLICATE").length, 9);
});
