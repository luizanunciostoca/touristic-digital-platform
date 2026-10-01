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

test("agent profile routes MERGED retirement away from generic proof", async () => {
  const workflow = await read(".github/workflows/morro-agent-profiles.yml");
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(workflow, /Classify exact retirement transition/);
  assert.match(workflow, /jq length <<<"\$removed"\)[^\n]*-eq 1/);
  assert.match(workflow, /jq length <<<"\$added"\)[^\n]*-eq 0/);
  assert.match(workflow, /\.state' "\$MANIFEST_PATH"\)" = "MERGED"/);
  assert.match(workflow, /\.baseSha' "\$MANIFEST_PATH"\)" = "\$BASE_SHA"/);
  assert.match(workflow, /\.branch' "\$MANIFEST_PATH"\)" = "\$HEAD_BRANCH"/);
  const generic = block(workflow, "  validate-pr:", "  validate-retirement:");
  assert.match(generic, /retirement != 'true'/);
  assert.match(generic, /agent-profile-contract-generic-skipped/);

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
  assert.match(retirement, /claim-retirement-proof\.mjs trusted candidate/);
  assert.doesNotMatch(retirement, /independent-proof-trusted\.mjs/);
});

test("trusted bootstrap uses dedicated retirement proof and keeps normal proof isolated", async () => {
  const workflow = await read(
    ".github/workflows/morro-claim-guard-trust-bootstrap.yml",
  );
  assert.match(
    workflow,
    /retirement: \$\{\{ steps\.transition\.outputs\.retirement \}\}/,
  );
  assert.match(workflow, /Classify exact retirement transition/);
  assert.match(
    workflow,
    /RETIREMENT: \$\{\{ needs\.unit\.outputs\.retirement \}\}/,
  );
  assert.match(
    workflow,
    /Canonical retirement detected; registry removal is proven by the trusted retirement step\./,
  );

  const generic = block(
    workflow,
    "  independent-proof:",
    "  retirement-independent-proof:",
  );
  assert.match(generic, /retirement != 'true'/);
  assert.match(generic, /base-controlled-independent-proof-generic-skipped/);

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
  assert.match(retirement, /claim-retirement-proof\.mjs trusted candidate/);
  assert.doesNotMatch(retirement, /independent-proof-trusted\.mjs/);
  assert.match(
    workflow,
    /id: claim-retirement-proof[\s\S]*claim-retirement-proof\.mjs trusted candidate/,
  );
});
