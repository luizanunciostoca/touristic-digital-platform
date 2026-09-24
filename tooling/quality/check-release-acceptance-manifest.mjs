import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(
  root,
  "tooling/ci/release-acceptance-manifest.json",
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (
  manifest.version !== 1 ||
  !Array.isArray(manifest.suites) ||
  manifest.suites.length === 0
) {
  throw new Error("Invalid release acceptance manifest.");
}

const seen = new Set();
const shaSensitivePattern = /\bGITHUB_SHA\b|github\.sha|releaseSha|expected_sha/i;

for (const suite of manifest.suites) {
  if (!suite || typeof suite.workflow !== "string") {
    throw new Error(
      "Every release acceptance suite requires a workflow filename.",
    );
  }
  if (seen.has(suite.workflow)) {
    throw new Error(`Duplicate release acceptance workflow: ${suite.workflow}`);
  }
  seen.add(suite.workflow);

  const workflowPath = path.join(root, ".github/workflows", suite.workflow);
  if (!fs.existsSync(workflowPath)) {
    throw new Error(`Missing release acceptance workflow: ${suite.workflow}`);
  }

  const source = fs.readFileSync(workflowPath, "utf8");
  if (!/^\s*workflow_dispatch\s*:/m.test(source)) {
    throw new Error(`Workflow is not manually dispatchable: ${suite.workflow}`);
  }

  if (suite.reuse_tree_equivalent === true && shaSensitivePattern.test(source)) {
    throw new Error(
      `Workflow marked tree-reusable contains SHA-sensitive tokens: ${suite.workflow}`,
    );
  }
}

const reusableCount = manifest.suites.filter(
  (suite) => suite.reuse_tree_equivalent,
).length;

console.log(
  `Release acceptance manifest valid: ${manifest.suites.length} suites, ${reusableCount} tree-reusable.`,
);
