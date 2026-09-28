import assert from "node:assert/strict";
import test from "node:test";

const RELEASE_SHA = "a".repeat(40);
const headers = {
  "x-release-sha": RELEASE_SHA,
  "x-release-version": "main",
  "x-deployment-id": "dep-test",
  "x-correlation-id": "correlation-test",
  "strict-transport-security": "max-age=31536000",
};

function response(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...headers,
      "content-type": "application/json",
    },
  });
}

async function importSmoke(readyBody, suffix) {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.MORRO_V2_BASE_URL;
  process.env.MORRO_V2_BASE_URL = "https://runtime.example.test";
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/healthz") {
      return response({ status: "live" });
    }
    if (url.pathname === "/readyz") {
      return response(readyBody);
    }
    throw new Error(`UNEXPECTED_PATH:${url.pathname}`);
  };
  try {
    return await import(`../payments/render-v2-smoke.mjs?${suffix}`);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) {
      delete process.env.MORRO_V2_BASE_URL;
    } else {
      process.env.MORRO_V2_BASE_URL = previousBaseUrl;
    }
  }
}

test("Render smoke accepts healthy ready runtime", { concurrency: false }, async () => {
  await importSmoke(
    {
      readiness: "ready",
      status: "healthy",
      checks: [{ name: "place-platform-runtime", status: "pass" }],
    },
    "healthy",
  );
});

test("Render smoke fails closed when runtime is degraded", { concurrency: false }, async () => {
  await assert.rejects(
    () =>
      importSmoke(
        {
          readiness: "ready",
          status: "degraded",
          checks: [
            {
              name: "place-platform-runtime",
              status: "fail",
              critical: false,
            },
          ],
        },
        "degraded",
      ),
    /READYZ_FAILED_200_place-platform-runtime/u,
  );
});

test("Render smoke rejects degraded status even without an explicit failed check", { concurrency: false }, async () => {
  await assert.rejects(
    () =>
      importSmoke(
        {
          readiness: "ready",
          status: "degraded",
          checks: [],
        },
        "degraded-without-failed-check",
      ),
    /READYZ_FAILED_200/u,
  );
});
