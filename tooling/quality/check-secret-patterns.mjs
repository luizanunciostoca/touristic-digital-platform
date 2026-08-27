import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const trackedFiles = execFileSync(
  "git",
  ["ls-files", "-co", "--exclude-standard", "-z"],
  { cwd: root },
)
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("node_modules/"))
  .filter((file) => !file.includes("/.turbo/"))
  .filter((file) => !file.endsWith(".lock"));

const signatures = [
  {
    name: "private-key-block",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  },
  {
    name: "openai-token",
    pattern: /(^|[^A-Za-z0-9])sk-[A-Za-z0-9]{20,}/u,
  },
  {
    name: "github-token",
    pattern: /(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{20,}/u,
  },
  {
    name: "aws-access-key",
    pattern: /(^|[^A-Za-z0-9])AKIA[0-9A-Z]{16}([^A-Za-z0-9]|$)/u,
  },
  {
    name: "jwt-like-token",
    pattern: /(^|[^A-Za-z0-9])eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./u,
  },
];

const findings = [];
for (const relativePath of trackedFiles) {
  let source;
  try {
    source = await readFile(path.join(root, relativePath), "utf8");
  } catch {
    continue;
  }
  const lines = source.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const signature of signatures) {
      if (signature.pattern.test(line)) {
        findings.push(`${relativePath}:${index + 1}:${signature.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Secret-pattern scan failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Secret-pattern scan passed: ${trackedFiles.length} tracked/working files checked; no supported credential signatures found.`,
);
