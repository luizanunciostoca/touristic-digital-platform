import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL(
    "../../apps/morro-digital-platform/tooling/production-runtime-data-predeploy.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("production data predeploy remains fail-closed and ordered", () => {
  assert.match(source, /const PRODUCTION_SERVICE = "morro-digital-v2";/u);
  assert.match(
    source,
    /RENDER_SERVICE_NAME[\s\S]*PRODUCTION_SERVICE[\s\S]*PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED/u,
  );

  const steps = [
    "legacy-commercial-place-backfill-apply",
    "legacy-commercial-draft-verify",
    "legacy-commercial-media-backfill-apply",
    "legacy-commercial-media-backfill-verify",
    "legacy-commercial-description-backfill-apply",
    "legacy-commercial-description-backfill-verify",
    "legacy-commercial-review-transition-apply",
    "legacy-commercial-review-transition-verify",
    "legacy-commercial-cutover-audit-pre-publication",
    "legacy-commercial-publication-batch-apply",
    "legacy-commercial-publication-batch-verify",
    "legacy-commercial-cutover-audit-post-publication",
  ];

  let cursor = -1;
  for (const step of steps) {
    const next = source.indexOf(`name: "${step}"`);
    assert.ok(next > cursor, `missing or unordered production step: ${step}`);
    cursor = next;
  }
});
