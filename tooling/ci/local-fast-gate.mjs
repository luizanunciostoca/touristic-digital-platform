import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFiles } from "./impact-analyzer.mjs";

export function affectedPackages(files, packages) {
  const selected = new Set(
    packages
      .filter((pkg) => files.some((file) => file.startsWith(pkg.path + "/")))
      .map((pkg) => pkg.name),
  );
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const pkg of packages) {
      if (
        !selected.has(pkg.name) &&
        pkg.dependencies.some((dep) => selected.has(dep))
      ) {
        selected.add(pkg.name);
        expanded = true;
      }
    }
  }
  return [...selected].sort();
}

export function fastGatePlan(files, packages) {
  const impact = analyzeFiles(files);
  const selected = affectedPackages(files, packages);
  const packageScoped = files.every((file) =>
    packages.some((pkg) => file.startsWith(pkg.path + "/")),
  );
  return {
    impact,
    selected,
    full:
      impact.needsFullRegression ||
      (!impact.nonRuntime && (!packageScoped || selected.length === 0)),
  };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}
function execute(args) {
  console.log("pnpm " + args.join(" "));
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
function inventory() {
  const result = [];
  for (const prefix of ["apps", "packages", "services"]) {
    if (!existsSync(prefix)) continue;
    for (const dir of readdirSync(prefix, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    )) {
      const path = prefix + "/" + dir.name;
      if (!existsSync(path + "/package.json")) continue;
      const pkg = JSON.parse(readFileSync(path + "/package.json", "utf8"));
      result.push({
        name: pkg.name,
        path,
        dependencies: Object.keys({
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
          ...pkg.optionalDependencies,
        }),
      });
    }
  }
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const baseArg = process.argv.indexOf("--base");
  const base = baseArg >= 0 ? process.argv[baseArg + 1] : "origin/main";
  let files;
  try {
    files = [
      ...new Set([
        ...git("diff", "--name-only", "-z", base, "--"),
        ...git("ls-files", "--others", "--exclude-standard", "-z"),
      ]),
    ];
  } catch {
    console.error("Cannot prove the comparison base; running the full gate.");
    execute(["check"]);
    process.exit(0);
  }
  if (files.length === 0) {
    console.log("No changes relative to " + base);
    process.exit(0);
  }
  const plan = fastGatePlan(files, inventory());
  console.log(
    JSON.stringify(
      {
        base,
        files,
        selected: plan.selected,
        full: plan.full,
        risk: plan.impact.risk,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--plan")) process.exit(0);
  if (plan.full) {
    execute(["check"]);
  } else {
    const existing = files.filter((file) => existsSync(file));
    if (existing.length)
      execute(["exec", "prettier", "--check", "--ignore-unknown", ...existing]);
    execute(["secret-patterns:check"]);
    if (plan.impact.domains.includes("governance"))
      execute([
        "exec",
        "node",
        "--test",
        ...[
          "tooling/ci",
          "tooling/fabric",
          ".github/agents",
          ".github/hooks",
          "tooling/workspace",
          "tooling/control-state",
        ]
          .filter((dir) => existsSync(dir))
          .flatMap((dir) =>
            readdirSync(dir)
              .filter((file) => file.endsWith(".test.mjs"))
              .map((file) => dir + "/" + file),
          ),
      ]);
    if (!plan.impact.nonRuntime) {
      execute([
        "exec",
        "turbo",
        "run",
        "lint",
        "typecheck",
        "test",
        ...plan.selected.map((name) => "--filter=" + name),
      ]);
      execute(["exec", "vitest", "run", "tests/assistant-v1-baseline.test.ts"]);
    }
  }
}
