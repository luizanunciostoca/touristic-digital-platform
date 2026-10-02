import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(argv, timeout) {
  const result = spawnSync("pnpm", argv, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
  });
  assert.equal(
    result.status,
    0,
    [
      "command failed: pnpm " + argv.join(" "),
      result.stdout,
      result.stderr,
      result.error?.message ?? "",
    ].join("\n"),
  );
}

test("affected Business Location runtime tests pass", () => {
  run(
    [
      "--filter",
      "@touristic/morro-digital-platform",
      "exec",
      "vitest",
      "run",
      "src/business-location-discovery-adapter.test.ts",
      "src/business-dashboard-client.test.ts",
      "src/business-dashboard-surface.test.ts",
      "tooling/business-api.test.mjs",
    ],
    240_000,
  );

  run(
    [
      "-r",
      "--workspace-concurrency=4",
      "--filter",
      "@touristic/morro-digital-platform^...",
      "--if-present",
      "build",
    ],
    300_000,
  );

  run(
    [
      "--filter",
      "@touristic/morro-digital-platform",
      "exec",
      "vitest",
      "run",
      "--config",
      "tooling/place-platform-runtime.vitest.config.mjs",
    ],
    240_000,
  );
});

test("Morro Digital platform typecheck passes", () => {
  run(["--filter", "@touristic/morro-digital-platform", "typecheck"], 240_000);
});

test("Morro Digital platform build passes", () => {
  run(["--filter", "@touristic/morro-digital-platform", "build"], 300_000);
});
