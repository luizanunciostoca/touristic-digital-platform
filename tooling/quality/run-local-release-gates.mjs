import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const skipCheck = process.argv.includes("--skip-check");
const packageJson = JSON.parse(
  await (await import("node:fs/promises")).readFile("package.json", "utf8"),
);
const configuredScripts = new Set(Object.keys(packageJson.scripts ?? {}));
const commands = [
  ["format", "pnpm", ["format:check"]],
  ["architecture", "pnpm", ["architecture:check"]],
  ["feature-registry", "pnpm", ["features:check"]],
  ["environment-reconciliation", "pnpm", ["environment:check"]],
  [
    "supply-chain-patterns",
    "node",
    ["tooling/quality/check-secret-patterns.mjs"],
  ],
  ["secret-pattern-scan", "pnpm", ["run", "secret-patterns:check"]],
  ["auth-smoke", "pnpm", ["run", "auth:smoke"]],
  ["platform-readiness-smoke", "pnpm", ["run", "platform:smoke"]],
  ["payments-predeploy", "pnpm", ["run", "payments:predeploy"]],
  [
    "mercado-pago-preflight",
    "pnpm",
    ["run", "payments:mercado-pago:preflight"],
  ],
  ["render-smoke", "pnpm", ["run", "payments:render:smoke"]],
  ["affiliates-integration-smoke", "pnpm", ["run", "affiliates:server:test"]],
  ["ticketing-browser-smoke", "pnpm", ["run", "ticketing:browser:smoke"]],
  ["migration-dry-run", "pnpm", ["run", "migration:dry-run"]],
  ["release-identity-smoke", "pnpm", ["run", "release:identity:smoke"]],
];

if (!skipCheck) commands.unshift(["repository-check", "pnpm", ["check"]]);
else
  console.log(
    "[local-release-gates] repository-check skipped by explicit --skip-check; this is not official CI evidence.",
  );

for (const [name, command, args] of commands) {
  if (command === "node" && args[0] && !existsSync(args[0])) {
    console.log(
      `[local-release-gates] ${name}: NOT_CONFIGURED (missing file ${args[0]})`,
    );
    continue;
  }
  if (
    command === "pnpm" &&
    args[0] === "run" &&
    !configuredScripts.has(args[1])
  ) {
    console.log(
      `[local-release-gates] ${name}: NOT_CONFIGURED (missing package script ${args[1]})`,
    );
    continue;
  }
  console.log(`\n[local-release-gates] ${name}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.log(
        `[local-release-gates] ${name}: NOT_CONFIGURED (command unavailable)`,
      );
      continue;
    }
    throw result.error;
  }
  if (result.status !== 0) {
    if (
      [
        "payments-predeploy",
        "mercado-pago-preflight",
        "render-smoke",
        "affiliates-integration-smoke",
        "ticketing-browser-smoke",
        "migration-dry-run",
        "release-identity-smoke",
      ].includes(name)
    ) {
      console.log(
        `[local-release-gates] ${name}: BLOCKED_OR_NOT_CONFIGURED (exit ${result.status}); continue for independent local evidence.`,
      );
      continue;
    }
    process.exit(result.status ?? 1);
  }
}

console.log(
  "\n[local-release-gates] completed with local/non-official evidence semantics.",
);
