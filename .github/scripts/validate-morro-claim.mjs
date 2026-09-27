import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

function fail(message) { console.error("MORRO_CLAIM_GUARD: " + message); process.exitCode = 1; }
function git(...args) { return execFileSync("git", args, { encoding: "utf8" }).trim(); }
function escapeRegex(value) { return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"); }
function field(body, name) { return body.match(new RegExp("^\\s*" + escapeRegex(name) + "\\s*:\\s*(.+?)\\s*$", "mi"))?.[1]?.trim() || ""; }
function patternToRegex(pattern) {
  const escaped = escapeRegex(pattern).replace(/\\\*\\\*/g, "§§DOUBLESTAR§§").replace(/\\\*/g, "[^/]*").replace(/§§DOUBLESTAR§§/g, ".*");
  return new RegExp("^" + escaped + "$");
}
function covered(path, patterns) { return patterns.some((pattern) => patternToRegex(pattern).test(path)); }
function staticPrefix(pattern) { return pattern.split("*")[0].replace(/\/$/, ""); }
function overlaps(a, b) { const pa = staticPrefix(a); const pb = staticPrefix(b); return pa === pb || pa.startsWith(pb + "/") || pb.startsWith(pa + "/"); }

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;
if (!pr) { fail("pull_request payload required"); process.exit(); }
const body = pr.body || "";
const changeSet = field(body, "ChangeSet");
const owner = field(body, "Owner");
const baseSha = field(body, "Base-SHA");
const risk = field(body, "Risk");
const affectedDomains = field(body, "Affected-Domains").split(",").map((v) => v.trim()).filter(Boolean);
for (const [label, value] of [["ChangeSet",changeSet],["Owner",owner],["Base-SHA",baseSha],["Risk",risk],["Affected-Domains",affectedDomains.join(",")]]) { if (!value) fail("missing PR metadata field " + label); }

const claims = JSON.parse(readFileSync(".github/morro-control/claims.json", "utf8")).claims || {};
const claim = claims[changeSet];
if (!claim) fail("ChangeSet " + changeSet + " does not exist in claims.json");
else {
  if (claim.owner !== owner) fail("owner mismatch: PR=" + owner + " claim=" + claim.owner);
  if (claim.baseSha !== baseSha) fail("Base-SHA mismatch: PR=" + baseSha + " claim=" + claim.baseSha);
  if (claim.risk !== risk) fail("risk mismatch: PR=" + risk + " claim=" + claim.risk);
  if (claim.branch !== pr.head.ref) fail("branch mismatch: PR=" + pr.head.ref + " claim=" + claim.branch);
  if (!["CLAIMED","IMPLEMENTING","LOCAL_PROVEN","REMOTE_PROVEN","PROOF_ACCEPTED","INTEGRATION_READY"].includes(claim.status)) fail("claim is not active: " + claim.status);
  if (Number.isNaN(Date.parse(claim.expiresAt)) || Date.parse(claim.expiresAt) <= Date.now()) fail("claim expired or invalid");
  for (const domain of claim.domains || []) if (!affectedDomains.includes(domain)) fail("Affected-Domains is missing claimed domain " + domain);
}
const baseRef = pr.base.ref;
const currentBaseSha = git("rev-parse", "origin/" + baseRef);
if (baseSha && baseSha !== currentBaseSha) fail("stale base: PR Base-SHA=" + baseSha + " current origin/" + baseRef + "=" + currentBaseSha);
const changed = git("diff", "--name-only", currentBaseSha + "...HEAD").split("\n").filter(Boolean);
if (claim) {
  for (const path of changed) if (!covered(path, claim.paths || [])) fail("changed path outside claim: " + path);
  for (const [otherId, other] of Object.entries(claims)) {
    if (otherId === changeSet) continue;
    if (!["CLAIMED","IMPLEMENTING","LOCAL_PROVEN","REMOTE_PROVEN","PROOF_ACCEPTED","INTEGRATION_READY"].includes(other.status)) continue;
    if (Number.isNaN(Date.parse(other.expiresAt)) || Date.parse(other.expiresAt) <= Date.now()) continue;
    if ((claim.paths || []).some((a) => (other.paths || []).some((b) => overlaps(a,b)))) fail("dangerous active path overlap with " + otherId);
  }
}
if (!process.exitCode) console.log("MORRO_CLAIM_GUARD: PASS " + changeSet + " @ " + currentBaseSha);
