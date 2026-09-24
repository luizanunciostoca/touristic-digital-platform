import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";

const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const base = args.get("--base");
const head = args.get("--head") || "HEAD";
const out = args.get("--json");
const manifestPath = args.get("--manifest");

if (!base) {
  throw new Error("--base is required");
}

const policy = JSON.parse(await readFile(".morro/risk-policy.json", "utf8"));
const ownership = JSON.parse(await readFile(".morro/ownership.json", "utf8"));
const graph = JSON.parse(await readFile(".morro/contract-graph.json", "utf8"));

const raw = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], {
  encoding: "utf8",
}).trim();

const files = raw ? raw.split("\n").filter(Boolean) : [];
const lower = files.map((file) => file.toLowerCase());
const ownedDomains = new Set();

for (const domain of ownership.domains) {
  if (
    files.some((file) =>
      domain.pathPrefixes?.some((prefix) => file.startsWith(prefix)),
    )
  ) {
    ownedDomains.add(domain.id);
  }
}

const touchedContracts = new Set();

for (const [name, contract] of Object.entries(graph.contracts)) {
  if (contract.owners.some((owner) => ownedDomains.has(owner))) {
    touchedContracts.add(name);
  }
}

const isCriticalPath = files.some((file) =>
  policy.criticalPaths.some((path) => file.includes(path)),
);
const isHighPath = files.some((file) =>
  policy.highPaths.some((path) => file.includes(path)),
);
const semanticCritical = [...touchedContracts].some(
  (name) => policy.semanticRiskFloor[name] === "critical",
);
const semanticHigh = [...touchedContracts].some(
  (name) => policy.semanticRiskFloor[name] === "high",
);
const docsOnly =
  files.length > 0 &&
  files.every((file) =>
    policy.lowExtensions.some((extension) => file.endsWith(extension)),
  );

let risk = "medium";

const riskWeight = { low: 1, medium: 2, high: 3, critical: 4 };
let manifestRisk = null;

if (manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifestRisk = manifest.risk;
}

if (isCriticalPath || semanticCritical) {
  risk = "critical";
} else if (isHighPath || semanticHigh) {
  risk = "high";
} else if (docsOnly) {
  risk = "low";
}

if (manifestRisk && riskWeight[manifestRisk] > riskWeight[risk]) {
  risk = manifestRisk;
}

const impactedDomains = new Set(ownedDomains);

for (const name of touchedContracts) {
  for (const consumer of graph.contracts[name].consumers) {
    impactedDomains.add(consumer);
  }
}

const flags = {
  ui: lower.some((file) => file.includes("apps/morro-digital-platform")),
  auth: lower.some((file) => file.includes("/auth/") || file.includes("auth-")),
  payments: lower.some((file) => /financial|ordering|payment/u.test(file)),
  ticketing: lower.some((file) => file.includes("ticketing")),
  ci: lower.some(
    (file) =>
      file.startsWith(".github/workflows/") ||
      file.startsWith("tooling/quality/") ||
      file.startsWith("tooling/fabric/") ||
      file.startsWith(".morro/"),
  ),
};

const plan = {
  schema: 2,
  base,
  head,
  changedFiles: files,
  risk,
  flags,
  ownedDomains: [...ownedDomains].sort(),
  touchedContracts: [...touchedContracts].sort(),
  impactedDomains: [...impactedDomains].sort(),
  manifestRisk,
  requiredEvidence: policy.levels[risk].required,
};

const serialized = `${JSON.stringify(plan, null, 2)}\n`;
process.stdout.write(serialized);

if (out) {
  await writeFile(out, serialized);
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `risk=${risk}\n`);

  for (const [name, value] of Object.entries(flags)) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }

  await appendFile(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
}
