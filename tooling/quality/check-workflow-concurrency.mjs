import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflowsDir = resolve(process.cwd(), ".github", "workflows");
const workflowFiles = readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

const nonInterruptible = new Set([
  "final-release-acceptance.yml",
  "production-render-promotion.yml",
  "production-oci-promotion.yml",
  "production-render-rollback.yml",
  "release-promotion-gate.yml",
  "oci-release-promotion-gate.yml",
  "release-oci-image.yml",
  "staging-render-promotion.yml",
  "staging-oci-promotion.yml",
]);

const failures = [];

for (const file of workflowFiles) {
  const text = readFileSync(resolve(workflowsDir, file), "utf8");
  const lines = text.split(/\r?\n/);
  const concurrencyIndex = lines.findIndex((line) =>
    /^concurrency:\s*$/.test(line),
  );

  if (concurrencyIndex < 0) {
    failures.push(`${file}: missing top-level concurrency block`);
    continue;
  }

  const block = [];
  for (let index = concurrencyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "" || /^\s/.test(line) || /^#/.test(line)) {
      block.push(line);
      continue;
    }
    break;
  }

  const hasGroup = block.some((line) => /^\s{2}group:\s*\S/.test(line));
  const cancelLine = block.find((line) =>
    /^\s{2}cancel-in-progress:\s*/.test(line),
  );

  if (!hasGroup) {
    failures.push(`${file}: concurrency.group is missing`);
  }

  if (!cancelLine) {
    failures.push(`${file}: concurrency.cancel-in-progress is missing`);
    continue;
  }

  if (
    nonInterruptible.has(file) &&
    !/^\s{2}cancel-in-progress:\s*false\s*$/.test(cancelLine)
  ) {
    failures.push(
      `${file}: operational release/deploy workflow must use cancel-in-progress: false`,
    );
  }
}

if (failures.length > 0) {
  console.error("Workflow concurrency policy failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Workflow concurrency policy passed for ${workflowFiles.length} workflow files.`,
);
