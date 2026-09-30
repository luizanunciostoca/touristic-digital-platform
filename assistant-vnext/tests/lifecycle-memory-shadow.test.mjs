import test from "node:test";
import assert from "node:assert/strict";
import {
  ActionLifecycleController,
  AssistantMemoryService,
  ConfirmationEngine,
  InMemoryAssistantMemoryStore,
  InMemoryTelemetrySink,
  LayeredAssistantMemoryStore,
  PreparedActionStore,
  SandboxActionExecutor,
  ShadowComparator,
  ShadowRunner,
} from "../dist/index.js";

function ids() {
  let n = 0;
  return { next: (prefix) => prefix + "_" + ++n };
}

test("layered memory routes and queries L0-L5 stores", async () => {
  const clock = { now: () => new Date("2026-09-30T05:00:00.000Z") };
  const stores = Object.fromEntries(
    ["L0", "L1", "L2", "L3", "L4", "L5"].map((layer) => [
      layer,
      new InMemoryAssistantMemoryStore(clock),
    ]),
  );
  const layered = new LayeredAssistantMemoryStore(stores);
  const service = new AssistantMemoryService(layered, clock, ids());
  await service.remember({
    layer: "L1",
    scope: "session:s1",
    owner: "session",
    source: "test",
    sensitivity: "internal",
    retentionPolicy: "session",
    payload: { step: "one" },
  });
  await service.remember({
    layer: "L5",
    scope: "journey:j1",
    owner: "journey",
    source: "test",
    sensitivity: "internal",
    retentionPolicy: "ttl",
    ttlMs: 60000,
    payload: { step: "two" },
  });
  const result = await layered.query({ layers: ["L1", "L5"] });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.length, 2);
});

test("action lifecycle emits confirmed executed and verified telemetry", () => {
  const clock = { now: () => new Date("2026-09-30T05:00:00.000Z") };
  const store = new PreparedActionStore(clock, ids());
  const action = store.prepare({
    type: "ticket-order",
    tool: "ticketing.prepare_order",
    requestedBy: "user",
    input: { eventId: "e1", quantity: 2 },
    summary: "2 ingressos",
    requiresConfirmation: true,
    confirmationText: "Confirmar?",
    expiresInMs: 60000,
    contextFingerprint: "d".repeat(64),
    sessionId: "s1",
  });
  const telemetry = new InMemoryTelemetrySink();
  const lifecycle = new ActionLifecycleController(
    new ConfirmationEngine(store),
    new SandboxActionExecutor(store),
    telemetry,
    clock,
  );
  const trace = { conversationId: "c", turnId: "t", correlationId: "corr" };
  assert.equal(lifecycle.confirm(action.id, "d".repeat(64), trace).ok, true);
  assert.equal(lifecycle.executeSandbox(action.id, "d".repeat(64), trace).ok, true);
  assert.deepEqual(
    telemetry.snapshot().map((event) => event.name),
    ["assistant.action.confirmed", "assistant.action.executed", "assistant.action.verified"],
  );
});

test("shadow returns legacy before vnext finishes and supports drain", async () => {
  const runner = new ShadowRunner(new ShadowComparator());
  let releaseVnext;
  const gate = new Promise((resolve) => {
    releaseVnext = resolve;
  });
  const legacy = await runner.run({
    legacy: async () => ({ intent: "hours", text: "legacy" }),
    vnext: async () => {
      await gate;
      return { intent: "hours", text: "vnext" };
    },
    summarizeLegacy: (value, latencyMs) => ({ intent: value.intent, tools: [], latencyMs }),
    summarizeVNext: (value, latencyMs) => ({ intent: value.intent, tools: [], latencyMs }),
    now: () => 1,
  });
  assert.equal(legacy.text, "legacy");
  assert.equal(runner.metrics().runs, 0);
  releaseVnext();
  await runner.drain();
  assert.equal(runner.metrics().runs, 1);
});
