import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const workflow = readFileSync(
  new URL(
    "../../.github/workflows/morro-performance-budget.yml",
    import.meta.url,
  ),
  "utf8",
);

function runBlock(stepName) {
  const marker = `- name: ${stepName}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing step: ${stepName}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test("piped performance gates fail closed", () => {
  for (const name of [
    "Measure browser startup budgets",
    "Enforce Morro Digital asset budgets",
  ]) {
    const block = runBlock(name);
    assert.match(block, /set -euo pipefail/u);
    assert.match(block, /\|\s*tee/u);
  }
});

test("Bash runtime propagates producer failure through tee", () => {
  const producer = "node -e 'process.exit(17)' | tee /dev/null";
  const guarded = spawnSync("bash", ["-c", "set -euo pipefail; " + producer], {
    encoding: "utf8",
  });
  const unguarded = spawnSync("bash", ["-c", producer], { encoding: "utf8" });
  assert.equal(guarded.status, 17);
  assert.equal(unguarded.status, 0);
});
