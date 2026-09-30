import { execFileSync } from "node:child_process";

const repo = new URL("../../", import.meta.url);

function run(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: repo });
}

function lines(value) {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

const base =
  process.env.ASSISTANT_VNEXT_BASE_SHA || run(["merge-base", "HEAD", "origin/main"]).trim();

const tracked = lines(run(["diff", "--name-only", base, "--"]));
const staged = lines(run(["diff", "--cached", "--name-only", base, "--"]));
const untracked = lines(run(["ls-files", "--others", "--exclude-standard"]));
const changed = [...new Set([...tracked, ...staged, ...untracked])].sort();
const violations = changed.filter((item) => !item.startsWith("assistant-vnext/"));

if (violations.length) {
  console.error("ZERO_TOUCH_VIOLATION");
  for (const item of violations) console.error(item);
  process.exit(1);
}

console.log(
  "ZERO_TOUCH_PASS changed=" +
    changed.length +
    " tracked=" +
    tracked.length +
    " staged=" +
    staged.length +
    " untracked=" +
    untracked.length,
);
