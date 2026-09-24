import { execFileSync } from "node:child_process";
import { readFile, appendFile } from "node:fs/promises";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
const base = args.get("--base");
const head = args.get("--head") || "HEAD";
const out = args.get("--json");
if (!base) throw new Error("--base is required");

const policy = JSON.parse(await readFile(".morro/risk-policy.json", "utf8"));
const raw = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" }).trim();
const files = raw ? raw.split("\n").filter(Boolean) : [];

const lower = files.map((f) => f.toLowerCase());
const isCritical = files.some((f) => policy.criticalPaths.some((p) => f.includes(p)));
const isHigh = files.some((f) => policy.highPaths.some((p) => f.includes(p)));
const docsOnly = files.length > 0 && files.every((f) => policy.lowExtensions.some((ext) => f.endsWith(ext)));
const risk = isCritical ? "critical" : isHigh ? "high" : docsOnly ? "low" : "medium";

const flags = {
  ui: lower.some((f) => f.includes("apps/morro-digital-platform")),
  auth: lower.some((f) => f.includes("/auth/") || f.includes("auth-")),
  payments: lower.some((f) => /financial|ordering|payment/.test(f)),
  ticketing: lower.some((f) => f.includes("ticketing")),
  ci: lower.some((f) => f.startsWith(".github/workflows/") || f.startsWith("tooling/quality/") || f.startsWith(".morro/")),
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
const serialized = JSON.stringify(plan, null, 2) + "\n";
process.stdout.write(serialized);
if (out) await (await import("node:fs/promises")).writeFile(out, serialized);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `risk=${risk}\n`);
  for (const [name, value] of Object.entries(flags)) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  await appendFile(process.env.GITHUB_OUTPUT, `docs_only=${docsOnly}\n`);
}
