import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VNEXT_FLAGS,
  JourneyManager,
  KillSwitches,
  ShadowComparator,
  ShadowRunner,
} from "../dist/index.js";

test("all vnext feature flags default off", () => {
  assert.ok(Object.values(DEFAULT_VNEXT_FLAGS).every((value) => value === false));
});

test("kill switches fail closed by scope", () => {
  const switches = new KillSwitches({
    disableAll: false,
    disableProvider: true,
    disabledTools: new Set(["weather.current"]),
    disableWriteActions: true,
    disableMemoryWrites: true,
    disableProactive: true,
  });
  assert.equal(switches.providerAllowed(), false);
  assert.equal(switches.toolAllowed("weather.current"), false);
  assert.equal(switches.writesAllowed(), false);
  assert.equal(switches.memoryWritesAllowed(), false);
  assert.equal(switches.proactiveAllowed(), false);
});

test("journey progresses and can resume", () => {
  const clock = { now: () => new Date("2026-09-30T18:00:00.000Z") };
  let n = 0;
  const manager = new JourneyManager(clock, { next: (p) => p + "_" + ++n });
  const journey = manager.start({
    kind: "event",
    goal: "jantar -> sunset -> festa",
    steps: ["jantar", "sunset", "festa"],
  });
  assert.equal(manager.advance(journey.id)?.currentStep, "sunset");
  assert.equal(manager.get(journey.id)?.goal, "jantar -> sunset -> festa");
});

test("shadow runner preserves legacy authority even if vnext fails", async () => {
  const runner = new ShadowRunner(new ShadowComparator());
  const legacy = await runner.run({
    legacy: async () => ({ text: "legacy", intent: "hours" }),
    vnext: async () => {
      throw new Error("shadow failed");
    },
    summarizeLegacy: (v, latencyMs) => ({ intent: v.intent, tools: [], latencyMs }),
    summarizeVNext: (_v, latencyMs) => ({ intent: "unknown", tools: [], latencyMs }),
    now: () => 1,
  });
  assert.equal(legacy.text, "legacy");
  assert.equal(runner.metrics().runs, 0);
});
