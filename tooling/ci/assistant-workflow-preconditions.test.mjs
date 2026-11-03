import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (name) =>
  readFileSync(
    new URL(`../../.github/workflows/${name}.yml`, import.meta.url),
    "utf8",
  );
const continuity = read("assistant-conversation-continuity-browser-contract");
const reading = read("assistant-modal-reading-order");

for (const [name, source] of [
  ["continuity", continuity],
  ["reading order", reading],
]) {
  test(`${name} uses the supported deterministic browser runner`, () => {
    assert.match(source, /^    runs-on: ubuntu-24\.04$/m);
    assert.doesNotMatch(source, /^    runs-on: ubuntu-latest$/m);
  });
  test(`${name} preserves its Chromium version and dependency installation`, () => {
    assert.match(
      source,
      /npm install --prefix \/tmp\/pw --no-save playwright@1\.54\.2/,
    );
    assert.match(source, /playwright install --with-deps chromium/);
    assert.doesNotMatch(source, /continue-on-error:\s*true/);
  });
}

test("continuity builds once before imports from generated workspace exports", () => {
  const builds = [...continuity.matchAll(/^      - name: Build workspace$/gm)];
  const focused = continuity.indexOf(
    "      - name: Focused conversation tests",
  );
  assert.equal(builds.length, 1);
  assert.ok(focused >= 0);
  assert.ok(builds[0].index < focused, "build must precede the focused tests");
  assert.match(continuity, /name: Build workspace\n        run: pnpm -w build/);
});

test("continuity preserves the existing test command and effective inventory", () => {
  assert.match(
    continuity,
    /run: pnpm --filter @touristic\/morro-digital-platform test -- assistant-conversation-orchestrator assistant-contextual-state/,
  );
  assert.match(
    continuity,
    /name: Prove semantic continuity and single presenter metadata/,
  );
});

test("continuity retains linked-turn and single-presenter browser assertions", () => {
  for (const assertion of [
    "resultsTurn.previousTurnId !== categoryTurn.turnId",
    "placeTurn.previousTurnId !== resultsTurn.turnId",
    "onlineTurn.previousTurnId !== offlineTurn.turnId",
    "principalCount !== 1",
  ])
    assert.ok(continuity.includes(assertion), assertion);
});

test("reading order retains focus, accessibility, ordering and browser error assertions", () => {
  for (const assertion of [
    "modalV2.role !== 'region'",
    "!modalV2.focusedInput",
    "!focusRestored",
    "state.categoryIndex <= state.messageIndex",
    "state.optionCount !== 10",
    "if (pageErrors.length)",
  ])
    assert.ok(reading.includes(assertion), assertion);
});
