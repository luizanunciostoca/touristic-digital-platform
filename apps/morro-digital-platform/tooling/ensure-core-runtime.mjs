import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const coreSourceRoot = resolve(repositoryRoot, "packages/core/src");
const coreRuntimeEntry = resolve(repositoryRoot, "packages/core/dist/index.js");

async function latestSourceModifiedAt(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  let latest = 0;

  for (const entry of entries) {
    const candidate = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      latest = Math.max(latest, await latestSourceModifiedAt(candidate));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    latest = Math.max(latest, (await stat(candidate)).mtimeMs);
  }

  return latest;
}

async function runtimeModifiedAt() {
  try {
    return (await stat(coreRuntimeEntry)).mtimeMs;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

const [sourceModifiedAt, builtModifiedAt] = await Promise.all([
  latestSourceModifiedAt(coreSourceRoot),
  runtimeModifiedAt(),
]);

if (builtModifiedAt >= sourceModifiedAt && builtModifiedAt > 0) {
  process.exit(0);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["--filter", "@touristic/core", "build"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`CORE_RUNTIME_BUILD_FAILED:${result.status ?? "unknown"}`);
}
