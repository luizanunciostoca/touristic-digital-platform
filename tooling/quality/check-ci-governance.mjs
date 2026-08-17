import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");

function fail(message) {
  throw new Error(`CI governance gate: ${message}`);
}

async function text(path) {
  return readFile(resolve(root, path), "utf8");
}

function requireIncludes(source, path, needles) {
  for (const needle of needles) {
    if (!source.includes(needle)) {
      fail(`${path} is missing required contract marker: ${needle}`);
    }
  }
}

const workflowFiles = (await readdir(workflowsDir))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

if (!workflowFiles.length) fail("no versioned workflows were found");

const workflowSources = new Map(
  await Promise.all(
    workflowFiles.map(async (name) => [name, await text(`.github/workflows/${name}`)]),
  ),
);

for (const [name, source] of workflowSources) {
  if (/BuildFailed/i.test(source) || /BuildFailed/i.test(name)) {
    fail(`stale BuildFailed reference remains in ${name}`);
  }
}

const packageJson = JSON.parse(await text("package.json"));
for (const scriptName of [
  "format:check",
  "architecture:check",
  "features:check",
  "lint",
  "typecheck",
  "test",
  "build",
  "platform:contracts:check",
  "ci:governance:check",
  "check",
]) {
  if (typeof packageJson.scripts?.[scriptName] !== "string") {
    fail(`package.json is missing script ${scriptName}`);
  }
}

const quality = workflowSources.get("quality.yml");
if (!quality) fail("quality.yml is missing");
requireIncludes(quality, ".github/workflows/quality.yml", [
  "name: Quality Gate",
  "pull_request:",
  "push:",
  "branches: [main]",
  "name: quality / preflight",
  "name: quality / lint",
  "name: quality / typecheck",
  "name: quality / test",
  "name: quality / build",
  "name: quality",
  "pnpm format:check",
  "pnpm architecture:check",
  "pnpm features:check",
  "pnpm ci:governance:check",
  "pnpm lint",
  "pnpm typecheck",
  "pnpm test",
  "pnpm build",
]);
if (/\npull_request:\s*\n(?:.|\n)*?\n\s+paths(?:-ignore)?:/m.test(quality)) {
  fail("global Quality Gate must not use pull_request path filters");
}

const domainContracts = [
  {
    file: "auth-integration-contract.yml",
    markers: ["pull_request:", "push:", "packages/auth/**", "services/auth/**"],
  },
  {
    file: "business-auth-integration-contract.yml",
    markers: ["pull_request:", "push:", "packages/business/**", "services/auth/**"],
  },
  {
    file: "crm-equivalence-browser-contract.yml",
    markers: ["pull_request:", "push:", "packages/crm/src/**", "services/crm/src/**"],
  },
  {
    file: "payments-subscription-recurrence-contract.yml",
    markers: ["pull_request:", "push:", "packages/financial/**", "packages/ordering/**"],
  },
  {
    file: "ticketing-m147-contract.yml",
    markers: ["pull_request:", "push:", "packages/ticketing/**", "services/ticketing/**"],
  },
];

for (const contract of domainContracts) {
  const source = workflowSources.get(contract.file);
  if (!source) fail(`permanent domain contract ${contract.file} is missing`);
  requireIncludes(source, `.github/workflows/${contract.file}`, [
    ...contract.markers,
    "branches:",
    "main",
    "permissions:",
    "contents: read",
  ]);
}

const platformContracts = await text("tooling/quality/check-platform-contracts.mjs");
requireIncludes(platformContracts, "tooling/quality/check-platform-contracts.mjs", [
  "PLATFORM-EVENT-ENVELOPE",
  "PLATFORM-OBSERVATION",
  "PLATFORM-HEALTH-SNAPSHOT",
]);

const releaseGate = workflowSources.get("release-promotion-gate.yml");
if (!releaseGate) fail("release-promotion-gate.yml is missing");
requireIncludes(releaseGate, ".github/workflows/release-promotion-gate.yml", [
  "workflow_dispatch:",
  "expected_sha:",
  "name: release / smoke",
  "git rev-parse origin/main",
  "pnpm platform:contracts:check",
  "pnpm build",
  "runtime-config.js",
]);
if (/^\s{2}(pull_request|push):/m.test(releaseGate)) {
  fail("release promotion gate must remain explicit workflow_dispatch only");
}

const codeowners = await text(".github/CODEOWNERS");
requireIncludes(codeowners, ".github/CODEOWNERS", [
  "* @luizidebook",
  "/.github/ @luizidebook",
  "/package.json @luizidebook",
  "/pnpm-lock.yaml @luizidebook",
]);

const temporaryPattern =
  /(^|[-_])(once|one-shot|temp|temporary|formatter|format|fix|prepare|probe|reconcile|diagnose)([-_.]|$)/i;
const temporaryCandidates = workflowFiles.filter(
  (name) => temporaryPattern.test(name) || name === "placeholder-invalid.yml",
);

console.log(`CI governance valid: ${workflowFiles.length} versioned workflows inspected.`);
console.log(
  `Temporary/one-shot cleanup candidates: ${temporaryCandidates.length}.`,
);
for (const name of temporaryCandidates) console.log(`  - ${name}`);
