import test from "node:test";
import assert from "node:assert/strict";
import { AssistantMemoryService, InMemoryAssistantMemoryStore } from "../dist/memory/memory.js";

test("memory applies TTL and purge", async () => {
  let time = new Date("2026-09-30T00:00:00.000Z");
  const clock = { now: () => time };
  let seq = 0;
  const ids = { next: (prefix) => prefix + "_" + String(++seq) };
  const store = new InMemoryAssistantMemoryStore(clock);
  const service = new AssistantMemoryService(store, clock, ids);
  const saved = await service.remember({
    layer: "L5",
    scope: "journey:j1",
    owner: "journey",
    source: "test",
    sensitivity: "internal",
    retentionPolicy: "ttl",
    ttlMs: 1000,
    payload: { step: "checkout" },
  });
  assert.equal(saved.ok, true);
  time = new Date("2026-09-30T00:00:02.000Z");
  const queried = await store.query({ scope: "journey:j1" });
  assert.equal(queried.ok, true);
  if (queried.ok) assert.equal(queried.value.length, 0);
});

test("memory fails closed for sensitive durable records in isolated store", async () => {
  const clock = { now: () => new Date("2026-09-30T00:00:00.000Z") };
  const ids = { next: () => "mem_1" };
  const service = new AssistantMemoryService(new InMemoryAssistantMemoryStore(clock), clock, ids);
  const result = await service.remember({
    layer: "L4",
    scope: "account:u1",
    owner: "user-consented",
    source: "test",
    sensitivity: "sensitive",
    retentionPolicy: "durable",
    payload: { value: "x" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "POLICY_DENIED");
});
