import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const candidates = execFileSync("git", ["ls-files", "-z"], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((file) => /^(apps|services|packages|tooling)\//u.test(file))
  .filter((file) => /\.(?:c?js|mjs|ts|tsx)$/u.test(file))
  .filter(
    (file) =>
      file.startsWith("tooling/") ||
      (!/(^|\/)(?:test|tests|__tests__)(\/|$)/u.test(file) &&
        !/\.(?:test|spec)\.[^.]+$/u.test(file) &&
        !/(?:^|[-_.])e2e(?:[-_.]|$)/iu.test(file)),
  );

const rules = [
  {
    name: "raw-error-detail",
    pattern: /\berror\.(?:stack|message)\b/u,
  },
  {
    name: "raw-error-object",
    pattern: /^\s*error(?:\s*[,)]|\s*$)/u,
  },
  {
    name: "request-sensitive-surface",
    pattern: /\b(?:request|req)\.(?:headers|body|url)\b/u,
  },
  {
    name: "credential-or-session-member",
    pattern:
      /(?:\.|\[\s*["'])(?:authorization|cookie|set-cookie|password|clientsecret|access[_-]?token|refresh[_-]?token|session[_-]?id|x-signature|security[_-]?code|card[_-]?number)(?:["']\s*\])?/iu,
  },
  {
    name: "personal-or-prompt-member",
    pattern:
      /(?:\.|\[\s*["'])(?:cpf|document[_-]?number|email|phone|prompt)(?:["']\s*\])?/iu,
  },
];

function callArguments(source, match) {
  const sinkStart = match.index ?? 0;
  const openParenthesis = sinkStart + match[0].lastIndexOf("(");
  let depth = 1;
  let mode = "code";
  let escaped = false;

  for (let index = openParenthesis + 1; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === "line-comment") {
      if (char === "\n") mode = "code";
      continue;
    }
    if (mode === "block-comment") {
      if (char === "*" && next === "/") {
        mode = "code";
        index += 1;
      }
      continue;
    }
    if (mode !== "code") {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (
        (mode === "single-quote" && char === "'") ||
        (mode === "double-quote" && char === '"') ||
        (mode === "template" && char === "`")
      ) {
        mode = "code";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      mode = "line-comment";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      mode = "block-comment";
      index += 1;
      continue;
    }
    if (char === "'") {
      mode = "single-quote";
      continue;
    }
    if (char === '"') {
      mode = "double-quote";
      continue;
    }
    if (char === "`") {
      mode = "template";
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenthesis + 1, index);
      }
    }
  }

  return source.slice(openParenthesis + 1);
}

const findings = [];
for (const relativePath of candidates) {
  let source;
  try {
    source = await readFile(path.join(root, relativePath), "utf8");
  } catch {
    continue;
  }

  const sinkPattern =
    /(?:console\.(?:log|info|warn|error|debug)|process\.(?:stdout|stderr)\.write)\s*\(/gu;
  for (const match of source.matchAll(sinkPattern)) {
    const start = match.index ?? 0;
    const argumentsSource = callArguments(source, match);
    const line = source.slice(0, start).split(/\r?\n/u).length;
    for (const rule of rules) {
      if (rule.pattern.test(argumentsSource)) {
        findings.push(`${relativePath}:${line}:${rule.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Unsafe runtime/CI logging patterns detected:");
  for (const finding of [...new Set(findings)].sort()) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  `Runtime/CI log PII contract passed: ${candidates.length} source files inspected across console/stdout/stderr call arguments.`,
);
