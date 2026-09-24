import { execFileSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";

const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const base = args.get("--base");
const head = args.get("--head") || "HEAD";
const out = args.get("--json");

if (!base) {
  throw new Error("--base is required");
}

const policyText = await readFile(".morro/risk-policy.json", "utf8");
const policy = JSON.parse(policyText);
const diffArgs = ["diff", "--name-only", `${base}...${head}`];
const raw = execFileSync("git", diffArgs, { encoding: "utf8" }).trim();
const files = raw ? raw.split("\n").filter(Boolean) : [];
const lower = files.map((file) => file.toLowerCase());

const isCritical = files.some((file) =>
  policy.criticalPaths.some((path) => file.includes(path)),
);
const isHigh = files.some((file) =>
  policy.highPaths.some((path) => file.includes(path)),
);
const docsOnly =
  files.length > 0 &&
  files.every((file) =>
    policy.lowExtensions.some((extension) => file.endsWith(extension)),
  );

let risk = "medium";

if (isCritical) {
  risk = "critical";
} else if (isHigh) {
  risk = "high";
} else if (docsOnly) {
  risk = "low";
}

const flags = {
  ui: lower.some((file) => file.includes("apps/morro-digital-platform")),
  auth: lower.some(
    (file) => file.includes("/auth/") || file.includes("auth-"),
  ),
  payments: lower.some((file) => /financial|ordering|payment/.test(file)),
  ticketing: lower.some((file) => file.includes("ticketing")),
  ci: lower.some(
    (file) =>
      file.startsWith(".github/workflows/") ||
      file.startsWith("tooling/quality/") ||
      file.startsWith(".morro/"),
  ),
};

const plan = {
  schema: 1,
  base,
  head,
  changedFiles: files,
  risk,
  flags,
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

  await appendFile(
    process.env.GITHUB_OUTPUT,
    `docs_only=${docsOnly}\n`,
  );
}
