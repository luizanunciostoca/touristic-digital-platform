import test from "node:test";
import assert from "node:assert/strict";
import { AssistantEvidenceAggregator, PreparedActionStore } from "../dist/index.js";

test("prepared action requires confirmation and is idempotent", () => {
  let now = new Date("2026-09-30T00:00:00.000Z");
  const clock = { now: () => now };
  let sequence = 0;
  const ids = { next: (prefix) => prefix + "_" + ++sequence };
  const store = new PreparedActionStore(clock, ids);
  const action = store.prepare({
    type: "ticket-order",
    tool: "ticketing.prepare_order",
    requestedBy: "user",
    input: { eventId: "e1", quantity: 2 },
    summary: "2 ingressos",
    requiresConfirmation: true,
    confirmationText: "Confirmar dois ingressos?",
    expiresInMs: 60000,
    contextFingerprint: "a".repeat(64),
    sessionId: "s",
  });
  const denied = store.claimForSandboxExecution(action.id, "a".repeat(64));
  assert.equal(denied.ok, false);
  const confirmed = store.confirm(action.id, "a".repeat(64));
  assert.equal(confirmed.ok, true);
  const first = store.claimForSandboxExecution(action.id, "a".repeat(64));
  assert.equal(first.ok, true);
  const duplicate = store.claimForSandboxExecution(action.id, "a".repeat(64));
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error.code, "DUPLICATE");
});

test("prepared action expires fail closed", () => {
  let now = new Date("2026-09-30T00:00:00.000Z");
  const clock = { now: () => now };
  const ids = { next: (prefix) => prefix + "_1" };
  const store = new PreparedActionStore(clock, ids);
  const action = store.prepare({
    type: "x",
    tool: "x",
    requestedBy: "user",
    input: {},
    summary: "x",
    requiresConfirmation: false,
    expiresInMs: 1,
    contextFingerprint: "a".repeat(64),
    sessionId: "s",
  });
  now = new Date("2026-09-30T00:00:01.000Z");
  const result = store.claimForSandboxExecution(action.id, "a".repeat(64));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "EXPIRED");
});

test("evidence aggregator drops stale evidence and reports missing facts", () => {
  const aggregator = new AssistantEvidenceAggregator();
  const pack = aggregator.build({
    question: "Está aberto?",
    now: new Date("2026-09-30T10:00:00.000Z"),
    requiredFacts: ["hours"],
    items: [
      {
        id: "e1",
        source: "fixture",
        sourceType: "business",
        factType: "hours",
        retrievedAt: "2026-09-30T08:00:00.000Z",
        validUntil: "2026-09-30T09:00:00.000Z",
        data: "18:00-23:00",
      },
    ],
  });
  assert.deepEqual(pack.items, []);
  assert.deepEqual(pack.missingFacts, ["hours"]);
  const required = aggregator.require(pack, ["hours"]);
  assert.equal(required.ok, false);
  if (!required.ok) assert.equal(required.error.code, "INSUFFICIENT_EVIDENCE");
});
