import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

function finish(permissionDecision, permissionDecisionReason) {
  process.stdout.write(JSON.stringify(permissionDecision === "deny" ? { permissionDecision, permissionDecisionReason } : { permissionDecision }));
  process.exit(0);
}

function git(...args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}

function valuesForPathKeys(value, out = []) {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) { for (const item of value) valuesForPathKeys(item, out); return out; }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && /^(path|file|filePath|filename)$/i.test(key)) out.push(item);
    else valuesForPathKeys(item, out);
  }
  return out;
}

function escapeRegex(value) { return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"); }
function patternToRegex(pattern) {
  const escaped = escapeRegex(pattern).replace(/\\\*\\\*/g, "§§DOUBLESTAR§§").replace(/\\\*/g, "[^/]*").replace(/§§DOUBLESTAR§§/g, ".*");
  return new RegExp("^" + escaped + "$");
}
function covered(path, patterns) {
  const normalized = path.replace(/^\.\//, "").replaceAll("\\", "/");
  return patterns.some((pattern) => patternToRegex(pattern).test(normalized));
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); }
catch { finish("deny", "MORRO_SAFETY: malformed hook payload."); }

const toolName = String(payload.toolName || payload.tool_name || "");
const args = payload.toolArgs ?? payload.tool_input ?? {};
const serialized = JSON.stringify(args);
const forbidden = [
  [/git\s+push\b[^\n]*\borigin\b[^\n]*\bmain\b/i, "direct push to main"],
  [/git\s+push\b[^\n]*(--force|-f)\b/i, "force push"],
  [/gh\s+pr\s+merge\b/i, "PR merge outside Integrator"],
  [/(merge_pull_request|mergePullRequest)/i, "PR merge outside Integrator"],
  [/\bDROP\s+DATABASE\b/i, "DROP DATABASE"],
  [/\bTRUNCATE\b/i, "TRUNCATE"],
  [/\brm\s+-rf\s+(\/|~|\$HOME|\.git)\b/i, "unsafe rm -rf"],
  [/(production-oci-promotion|production-render-promotion|direct production deploy)/i, "direct production deploy"],
  [/(MERCADO[_ -]?PAGO|PAYMENTS?).{0,80}(PRODUCTION|LIVE).{0,80}(ENABLE|ACTIVATE|TRUE)/i, "financial provider production activation"],
  [/(printenv|cat\s+\.env\b|gh\s+secret\s+(list|view))/i, "secret output"]
];
for (const [pattern, reason] of forbidden) { if (pattern.test(serialized)) finish("deny", "MORRO_SAFETY: blocked " + reason + "."); }

const writeLike = /(edit|write|create|delete|patch|replace|move|rename|shell|bash|powershell|terminal|execute)/i.test(toolName);
if (!writeLike) finish("allow");

const branch = git("branch", "--show-current");
if (!branch) finish("deny", "MORRO_SAFETY: unable to determine current branch.");
if (branch === "main") finish("deny", "MORRO_SAFETY: writes on main are forbidden.");

let claims;
try { claims = JSON.parse(readFileSync(resolve(".github/morro-control/claims.json"), "utf8")).claims || {}; }
catch { finish("deny", "MORRO_SAFETY: claims.json unavailable."); }

const now = Date.now();
const active = Object.entries(claims).find(([, claim]) => {
  if (claim.branch !== branch) return false;
  if (!["CLAIMED","IMPLEMENTING","LOCAL_PROVEN","REMOTE_PROVEN","PROOF_ACCEPTED","INTEGRATION_READY"].includes(claim.status)) return false;
  return !Number.isNaN(Date.parse(claim.expiresAt)) && Date.parse(claim.expiresAt) > now;
});
if (!active) finish("deny", "MORRO_SAFETY: no active claim for branch " + branch + ".");

const [changeSet, claim] = active;
const explicitPaths = valuesForPathKeys(args);
for (const path of explicitPaths) {
  if (!covered(path, claim.paths || [])) finish("deny", "MORRO_SAFETY: path " + path + " is outside claim " + changeSet + ".");
}
finish("allow");
