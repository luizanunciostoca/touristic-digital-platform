import fs from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url);
const source = path.join(root.pathname, "src");
const violations = [];
const rules = [
  ["legacy-package-import", /packages\/assistant/gu],
  ["current-runtime-import", /apps\/morro-digital-platform\/src\/assistant/gu],
  ["browser-window", /\bwindow\s*\./gu],
  ["browser-document", /\bdocument\s*\./gu],
  ["direct-network-call", /\bfetch\s*\(/gu],
];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile() || !full.endsWith(".ts")) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        violations.push({ rule, file: path.relative(root.pathname, full) });
      }
    }
  }
}
walk(source);

if (violations.length > 0) {
  console.error("ARCHITECTURE_VIOLATION");
  for (const item of violations) console.error(item.rule + " " + item.file);
  process.exit(1);
}
console.log("ARCHITECTURE_PASS");
