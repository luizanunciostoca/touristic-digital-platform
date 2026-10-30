import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

test("map image permission preserves the application's privacy and security headers", () => {
  const source = readFileSync(
    new URL(
      "../../apps/morro-digital-platform/tooling/dev-server.mjs",
      import.meta.url,
    ),
    "utf8",
  );
  // Exercise the actual header writer without starting unrelated API/database runtimes.
  const start = source.indexOf("function applySecurityHeaders(response) {");
  const end = source.indexOf("\nfunction serveRuntimeConfig", start);
  assert.ok(start >= 0 && end > start, "security header writer must exist");
  const headers = new Map();
  vm.runInNewContext(
    source.slice(start, end) + "\napplySecurityHeaders(response);",
    {
      response: { setHeader: (name, value) => headers.set(name, value) },
    },
  );
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Cross-Origin-Opener-Policy"), "same-origin");
  assert.equal(
    headers.get("Permissions-Policy"),
    "camera=(), microphone=(), geolocation=(self)",
  );
  const directives = new Map(
    headers
      .get("Content-Security-Policy")
      .split("; ")
      .map((value) => {
        const [name, ...sources] = value.split(" ");
        return [name, sources];
      }),
  );
  assert.deepEqual(directives.get("img-src"), [
    "'self'",
    "data:",
    "blob:",
    "https://tile.openstreetmap.org",
    "https://unpkg.com",
    "https://api.mapbox.com",
    "https://*.tiles.mapbox.com",
  ]);
  for (const [name, sources] of directives) {
    if (name !== "img-src")
      assert.ok(
        sources.every((value) => !value.includes("openstreetmap.org")),
        name,
      );
  }
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
});
