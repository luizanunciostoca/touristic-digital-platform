import { execFileSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function pnpm(args) {
  return execFileSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
    maxBuffer: 16 * 1024 * 1024,
  });
}

test("Business Location affected tests pass", { timeout: 300_000 }, () => {
  pnpm([
    "--filter",
    "@touristic/morro-digital-platform",
    "exec",
    "vitest",
    "run",
    "src/business-location-discovery-adapter.test.ts",
    "src/business-dashboard-client.test.ts",
    "src/business-dashboard-surface.test.ts",
    "tooling/business-api.test.mjs",
  ]);

  pnpm([
    "-r",
    "--workspace-concurrency=4",
    "--filter",
    "@touristic/morro-digital-platform^...",
    "--if-present",
    "build",
  ]);
  pnpm([
    "--filter",
    "@touristic/morro-digital-platform",
    "exec",
    "vitest",
    "run",
    "--config",
    "tooling/place-platform-runtime.vitest.config.mjs",
  ]);
});

test("Morro Digital platform typecheck passes", { timeout: 180_000 }, () => {
  pnpm(["--filter", "@touristic/morro-digital-platform", "typecheck"]);
});

test("Morro Digital platform build passes", { timeout: 240_000 }, () => {
  pnpm(["--filter", "@touristic/morro-digital-platform", "build"]);
});
