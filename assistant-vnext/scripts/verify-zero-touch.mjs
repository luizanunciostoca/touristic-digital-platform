import { execFileSync } from "node:child_process";
import path from "node:path";

const base = process.env.ASSISTANT_VNEXT_BASE_SHA || "9105a508bb5c211e0db6a19cde333b965fdb81d9";
const repoRoot = path.resolve(import.meta.dirname, "../..");

function git(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
}

const changed = new Set(git(["diff", "--name-only", base, "--"]).split(/\r?\n/u).filter(Boolean));

for (const line of git(["status", "--porcelain=v1", "--untracked-files=all"]).split(/\r?\n/u)) {
  if (!line) continue;
  const pathPart = line.slice(3).replace(/^"|"$/gu, "");
  const normalized = pathPart.includes(" -> ") ? pathPart.split(" -> ").at(-1) : pathPart;
  if (normalized) changed.add(normalized);
}

const violations = [...changed].filter((file) => !file.startsWith("assistant-vnext/"));
if (violations.length > 0) {
  console.error("ZERO_TOUCH_VIOLATION");
  for (const file of violations) console.error(file);
  process.exit(1);
}
console.log("ZERO_TOUCH_PASS changed=" + changed.size);
