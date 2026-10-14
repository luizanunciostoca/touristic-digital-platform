import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  ".github/workflows/staging-render-promotion.yml",
  "utf8",
);
const start = source.indexOf(
  "      - name: Trigger exact-SHA Render staging deploy",
);
const end = source.indexOf(
  "      - name: Wait for exact-SHA staging health and identity",
  start,
);
assert.ok(start > 0 && end > start, "staging hook step missing");
const trigger = source.slice(start, end);

test("Render staging hook uses supported one-shot GET with exact SHA", () => {
  assert.ok(trigger.includes("curl --request GET --silent --show-error"));
  assert.ok(!trigger.includes("curl --request POST"));
  assert.ok(!trigger.includes("--retry"));
  assert.ok(
    trigger.includes(
      'deploy_url="${RENDER_STAGING_DEPLOY_HOOK_URL}${separator}ref=${EXPECTED_SHA}"',
    ),
  );
  assert.ok(
    trigger.includes(
      "RENDER_STAGING_DEPLOY_HOOK_URL: ${{ secrets.RENDER_STAGING_DEPLOY_HOOK_URL }}",
    ),
  );
  assert.ok(trigger.includes('echo "hook_accepted=true" >> "$GITHUB_OUTPUT"'));
  assert.ok(
    trigger.includes('echo "deploy_id=$deploy_id" >> "$GITHUB_OUTPUT"'),
  );
  assert.ok(trigger.includes("200|202) ;;"));
  assert.ok(trigger.includes("exit 1"));
});

test("Render promotion keeps protected staging target and exact release proof", () => {
  assert.ok(source.includes("name: main - morro-digital-v2-staging"));
  assert.ok(source.includes("srv-da4hb6c9v7es7386ttt0"));
  assert.ok(source.includes("https://morro-digital-v2-staging.onrender.com"));
  assert.ok(source.includes("inputs.confirm_staging == 'DEPLOY'"));
  assert.ok(source.includes('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"'));
  assert.ok(
    source.includes('test "$hook_service_id" = "$EXPECTED_STAGING_SERVICE_ID"'),
  );
  assert.ok(source.includes('if [ "$release_sha" = "$EXPECTED_SHA" ]; then'));
  assert.ok(source.includes('test "$EXPECTED_SHA" = "$LIVE_SHA"'));
});
