import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const budgetPath = resolve(
  repositoryRoot,
  "tooling/performance/morro-digital-budget.json",
);
const appPublicRoot = resolve(
  repositoryRoot,
  "apps/morro-digital-platform/public",
);
const appDistRoot = resolve(repositoryRoot, "apps/morro-digital-platform/dist");
const indexPath = resolve(appPublicRoot, "index.html");

const runtimePackageRoots = Object.freeze([
  resolve(repositoryRoot, "packages/assistant/dist"),
  resolve(repositoryRoot, "packages/core/dist"),
  resolve(repositoryRoot, "packages/geospatial/dist"),
  resolve(repositoryRoot, "packages/navigation/dist"),
  resolve(repositoryRoot, "packages/search/dist"),
]);

const dynamicScriptPaths = new Set(["/runtime-config.js"]);

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function walkFiles(root, predicate) {
  if (!(await pathExists(root))) return [];

  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path, predicate)));
      continue;
    }
    if (entry.isFile() && predicate(path)) files.push(path);
  }

  return files;
}

async function fileSize(path) {
  return (await stat(path)).size;
}

function parseSameOriginAssets(html, attribute, extension) {
  const expression = new RegExp(
    `${attribute}=["']([^"']+\\.${extension}(?:\\?[^"']*)?)["']`,
    "gu",
  );
  return [...html.matchAll(expression)]
    .map((match) => match[1])
    .filter((value) => typeof value === "string" && value.startsWith("/"))
    .map((value) => value.split("?", 1)[0]);
}

async function resolvePublicUrl(url) {
  if (dynamicScriptPaths.has(url)) return null;

  const repositoryMounted =
    url.startsWith("/apps/") ||
    url.startsWith("/packages/") ||
    url.startsWith("/images/");

  const path = repositoryMounted
    ? resolve(repositoryRoot, `.${url}`)
    : resolve(appPublicRoot, `.${url}`);

  if (!(await pathExists(path))) {
    throw new Error(`PERFORMANCE_REFERENCED_ASSET_MISSING: ${url}`);
  }

  return path;
}

async function sumFiles(paths) {
  let total = 0;
  for (const path of paths) total += await fileSize(path);
  return total;
}

async function collectRuntimeJavascriptFiles() {
  const appFiles = await walkFiles(appDistRoot, (path) => path.endsWith(".js"));
  const packageFiles = [];

  for (const root of runtimePackageRoots) {
    packageFiles.push(
      ...(await walkFiles(root, (path) => path.endsWith(".js"))),
    );
  }

  return { appFiles, packageFiles };
}

function compareBudget(name, actual, limit, failures) {
  if (actual <= limit) return;
  failures.push(
    `${name} exceeded: ${actual} bytes > ${limit} bytes (${actual - limit} bytes over)`,
  );
}

const budget = JSON.parse(await readFile(budgetPath, "utf8"));
const indexHtml = await readFile(indexPath, "utf8");

const linkedCssUrls = parseSameOriginAssets(indexHtml, "href", "css");
const linkedScriptUrls = parseSameOriginAssets(indexHtml, "src", "js");

const linkedCssFiles = (
  await Promise.all(linkedCssUrls.map((url) => resolvePublicUrl(url)))
).filter(Boolean);
const linkedScriptFiles = (
  await Promise.all(linkedScriptUrls.map((url) => resolvePublicUrl(url)))
).filter(Boolean);

const { appFiles, packageFiles } = await collectRuntimeJavascriptFiles();
const allRuntimeJavascriptFiles = [
  ...new Set([...appFiles, ...packageFiles, ...linkedScriptFiles]),
];

const runtimeFileSizes = await Promise.all(
  allRuntimeJavascriptFiles.map(async (path) => ({
    path,
    bytes: await fileSize(path),
  })),
);
runtimeFileSizes.sort((left, right) => right.bytes - left.bytes);

const actual = Object.freeze({
  homeLinkedCssBytes: await sumFiles(linkedCssFiles),
  homeLinkedJsBytes: await sumFiles(linkedScriptFiles),
  appDistJsBytes: await sumFiles(appFiles),
  runtimePackageJsBytes: await sumFiles(packageFiles),
  largestRuntimeJsFileBytes: runtimeFileSizes[0]?.bytes ?? 0,
});

const failures = [];
compareBudget(
  "homeLinkedCssBytes",
  actual.homeLinkedCssBytes,
  budget.assets.homeLinkedCssBytes,
  failures,
);
compareBudget(
  "homeLinkedJsBytes",
  actual.homeLinkedJsBytes,
  budget.assets.homeLinkedJsBytes,
  failures,
);
compareBudget(
  "appDistJsBytes",
  actual.appDistJsBytes,
  budget.assets.appDistJsBytes,
  failures,
);
compareBudget(
  "runtimePackageJsBytes",
  actual.runtimePackageJsBytes,
  budget.assets.runtimePackageJsBytes,
  failures,
);
compareBudget(
  "largestRuntimeJsFileBytes",
  actual.largestRuntimeJsFileBytes,
  budget.assets.largestRuntimeJsFileBytes,
  failures,
);

const relative = (path) =>
  path.startsWith(repositoryRoot)
    ? path.slice(repositoryRoot.length + 1)
    : path;

const report = Object.freeze({
  schemaVersion: budget.schemaVersion,
  status: failures.length === 0 ? "pass" : "fail",
  webVitalsTargets: budget.webVitals,
  assetBudgets: budget.assets,
  actual,
  linkedCss: linkedCssFiles.map(relative),
  linkedScripts: linkedScriptFiles.map(relative),
  largestRuntimeJavascriptFiles: runtimeFileSizes
    .slice(0, 10)
    .map(({ path, bytes }) => ({ path: relative(path), bytes })),
  failures,
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (failures.length > 0) process.exitCode = 1;
