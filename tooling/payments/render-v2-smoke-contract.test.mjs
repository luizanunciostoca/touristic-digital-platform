import assert from "node:assert/strict";
import test from "node:test";

import { assertHealthyReadiness } from "./render-v2-smoke-contract.mjs";

test("accepts healthy ready runtime when every check passes", () => {
  const body = {
    readiness: "ready",
    status: "healthy",
    checks: [
      { name: "commerce-runtime", status: "pass" },
      { name: "place-platform-runtime", status: "pass" },
    ],
  };

  assert.deepEqual(assertHealthyReadiness(200, body), {
    readiness: "ready",
    status: "healthy",
    checks: body.checks,
  });
});

test("rejects degraded runtime even when readiness remains ready", () => {
  assert.throws(
    () =>
      assertHealthyReadiness(200, {
        readiness: "ready",
        status: "degraded",
        checks: [
          { name: "commerce-runtime", status: "pass" },
          {
            name: "place-platform-runtime",
            status: "fail",
            detail: "PLACE_PLATFORM_DATABASE_UNREACHABLE",
          },
        ],
      }),
    /READYZ_FAILED_200_DEGRADED_place-platform-runtime:PLACE_PLATFORM_DATABASE_UNREACHABLE/u,
  );
});

test("rejects a non-pass check even if top-level status is healthy", () => {
  assert.throws(
    () =>
      assertHealthyReadiness(200, {
        readiness: "ready",
        status: "healthy",
        checks: [
          {
            name: "database",
            status: "warn",
            detail: "DATABASE_UNAVAILABLE",
          },
        ],
      }),
    /READYZ_FAILED_200_HEALTHY_database:DATABASE_UNAVAILABLE/u,
  );
});

test("rejects missing checks so health cannot be inferred from top-level fields alone", () => {
  assert.throws(
    () =>
      assertHealthyReadiness(200, {
        readiness: "ready",
        status: "healthy",
      }),
    /READYZ_FAILED_200_HEALTHY/u,
  );
});
