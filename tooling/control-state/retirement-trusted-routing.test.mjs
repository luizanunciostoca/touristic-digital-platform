import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

test("agent profile workflow routes retirement away from generic proof", async () => {
  const workflow = await read(".github/workflows/morro-agent-profiles.yml");
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(
    workflow,
    /validate-pr:[\s\S]*retirement != 'true'[\s\S]*morro-agent-profiles-trusted\.yml@/,
  );
  assert.match(
    workflow,
    /validate-retirement:[\s\S]*retirement == 'true'[\s\S]*claim-retirement-proof\.mjs trusted candidate/,
  );
});

test("claim guard bootstrap uses dedicated retirement proof", async () => {
  const workflow = await read(
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
  );
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(
    workflow,
    /orchestrator-registry-proof:[\s\S]*retirement != 'true'/,
  );
  assert.match(workflow, /independent-proof:[\s\S]*retirement != 'true'/);
  assert.match(
    workflow,
    /retirement-proof:[\s\S]*retirement == 'true'[\s\S]*claim-retirement-proof\.mjs trusted candidate/,
  );
});

test("retirement classification is exact one removal with no additions", async () => {
  for (const path of [
    ".github/workflows/morro-agent-profiles.yml",
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
  ]) {
    const workflow = await read(path);
    assert.match(workflow, /removed_count" -eq 1/);
    assert.match(workflow, /added_count" -eq 0/);
    assert.match(workflow, /retirement=false/);
  }
});
