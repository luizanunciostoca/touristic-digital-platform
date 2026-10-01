import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

function block(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, "BLOCK_START_MISSING:" + start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, "BLOCK_END_MISSING:" + end);
  return source.slice(from, to);
}

test("agent profile retirement keeps the generic route and exact trusted check name", async () => {
  const workflow = await read(".github/workflows/morro-agent-profiles.yml");
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(workflow, /removed[\s\S]*jq length <<<"\$removed"\)[^\n]*-eq 1/);
  assert.match(workflow, /added[\s\S]*jq length <<<"\$added"\)[^\n]*-eq 0/);
  assert.match(workflow, /\.state' "\$MANIFEST_PATH"\)" = "MERGED"/);
  assert.match(workflow, /\.baseSha' "\$MANIFEST_PATH"\)" = "\$BASE_SHA"/);
  assert.match(workflow, /\.branch' "\$MANIFEST_PATH"\)" = "\$HEAD_BRANCH"/);
  assert.match(
    workflow,
    /validate-pr:[\s\S]*retirement != 'true'[\s\S]*morro-agent-profiles-trusted\.yml@/,
  );
  const retirement = block(
    workflow,
    "  validate-retirement:",
    "  validate-merge-group:",
  );
  assert.match(retirement, /retirement == 'true'/);
  assert.match(
    retirement,
    /name: agent-profile-contract \/ trusted-agent-profile-contract/,
  );
  assert.match(retirement, /agent-profile-contract-trusted\.mjs candidate/);
  assert.match(retirement, /independent-proof-trusted\.test\.mjs/);
  assert.match(retirement, /claim-retirement-proof\.mjs trusted candidate/);
  assert.doesNotMatch(
    retirement,
    /independent-proof-trusted\.mjs[\s\S]*candidate[\s\S]*MANIFEST_PATH/,
  );
});

test("claim guard bootstrap preserves the exact scheduler jobs on retirement", async () => {
  const workflow = await read(
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
  );
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(
    workflow,
    /Canonical retirement detected; registry removal is proven by the trusted retirement step\./,
  );
  assert.match(
    workflow,
    /independent-proof:[\s\S]*retirement != 'true'[\s\S]*base-controlled-independent-proof-generic-skipped/,
  );
  const retirement = block(
    workflow,
    "  retirement-independent-proof:",
    "  claim-handoff-proof:",
  );
  assert.match(retirement, /retirement == 'true'/);
  assert.match(
    retirement,
    /name: base-controlled-independent-proof \/ trusted-agent-profile-contract/,
  );
  assert.match(retirement, /agent-profile-contract-trusted\.mjs candidate/);
  assert.match(retirement, /independent-proof-trusted\.test\.mjs/);
  assert.match(retirement, /claim-retirement-proof\.mjs trusted candidate/);
  assert.match(retirement, /automated-independent-proof\.json/);

  const scheduler = await read("tooling/mdctl/scheduler-live.mjs");
  for (const name of [
    "trusted-claim-guard-bootstrap",
    "base-controlled-orchestrator-registry-proof",
    "base-controlled-independent-proof / trusted-agent-profile-contract",
  ]) {
    assert.equal(
      scheduler.includes(name),
      true,
      "SCHEDULER_JOB_NAME_MISSING:" + name,
    );
  }
});
