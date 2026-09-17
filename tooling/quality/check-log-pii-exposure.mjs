import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const candidates = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((file) => /^(apps|services|packages)\//u.test(file))
  .filter((file) => /\.(?:c?js|mjs|ts|tsx)$/u.test(file))
  .filter((file) => !/(^|\/)(?:test|tests|__tests__)(\/|$)/u.test(file))
  .filter((file) => !/\.(?:test|spec)\.[^.]+$/u.test(file))
  .filter((file) => !/(?:^|[-_.])e2e(?:[-_.]|$)/iu.test(file));

const rules = [
  {
    name: "raw-error-detail",
    pattern: /\berror\.(?:stack|message)\b/u,
  },
  {
    name: "raw-error-object",
    pattern: /console\.(?:log|info|warn|error|debug)\s*\(\s*error(?:\s*[,)]|\s*$)/u,
  },
  {
    name: "request-sensitive-surface",
    pattern: /\b(?:request|req)\.(?:headers|body|url)\b/u,
  },
  {
    name: "credential-or-session-field",
    pattern:
      /\b(?:authorization|cookie|set-cookie|password|clientsecret|access[_-]?token|refresh[_-]?token|session[_-]?id|x-signature|security[_-]?code|card[_-]?number)\b/iu,
  },
  {
    name: "personal-or-prompt-field",
    pattern: /\b(?:cpf|document[_-]?number|prompt)\b/iu,
  },
];

const findings = [];
for (const relativePath of candidates) {
  let source;
  try {
    source = await readFile(path.join(root, relativePath), "utf8");
  } catch {
    continue;
  }

  const sinkPattern = /console\.(?:log|info|warn|error|debug)\s*\(/gu;
  for (const match of source.matchAll(sinkPattern)) {
    const start = match.index ?? 0;
    const window = source.slice(start, start + 1200);
    const line = source.slice(0, start).split(/\r?\n/u).length;
    for (const rule of rules) {
      if (rule.pattern.test(window)) {
        findings.push(`${relativePath}:${line}:${rule.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Unsafe runtime logging patterns detected:");
  for (const finding of [...new Set(findings)].sort()) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `Runtime log/PII contract passed: ${candidates.length} production-source files inspected.`,
);
