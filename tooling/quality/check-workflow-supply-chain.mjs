import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const strict = process.argv.includes("--strict");
const workflowsDir = path.join(process.cwd(), ".github", "workflows");
const files = (await readdir(workflowsDir))
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();

const hardErrors = [];
const mutableRefs = [];
let externalUses = 0;
let pinnedUses = 0;

for (const file of files) {
  const fullPath = path.join(workflowsDir, file);
  const source = await readFile(fullPath, "utf8");

  if (/^\s*pull_request_target\s*:/m.test(source)) {
    hardErrors.push(
      `${file}: pull_request_target is forbidden for this repository`,
    );
  }

  if (/^\s*permissions\s*:\s*write-all\s*$/m.test(source)) {
    hardErrors.push(`${file}: permissions: write-all is forbidden`);
  }

  if (!/^permissions\s*:/m.test(source)) {
    hardErrors.push(
      `${file}: explicit top-level permissions block is required`,
    );
  }

  if (/^\s*secrets\s*:\s*inherit\s*$/m.test(source)) {
    hardErrors.push(
      `${file}: secrets: inherit is forbidden; pass only named secrets`,
    );
  }

  const usesPattern = /^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm;
  for (const match of source.matchAll(usesPattern)) {
    const ref = match[1];
    if (ref.startsWith("./")) continue;

    externalUses += 1;

    if (ref.startsWith("docker://")) {
      if (!/@sha256:[0-9a-f]{64}$/i.test(ref)) {
        mutableRefs.push(`${file}: ${ref}`);
      } else {
        pinnedUses += 1;
      }
      continue;
    }

    const at = ref.lastIndexOf("@");
    const revision = at >= 0 ? ref.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(revision)) {
      mutableRefs.push(`${file}: ${ref}`);
    } else {
      pinnedUses += 1;
    }
  }
}

console.log(`Workflow supply-chain audit: ${files.length} workflow files`);
console.log(
  `External action uses: ${externalUses}; immutable SHA pins: ${pinnedUses}; mutable refs: ${mutableRefs.length}`,
);

if (mutableRefs.length > 0) {
  console.log("\nMutable action references:");
  for (const entry of mutableRefs) console.log(`- ${entry}`);
}

if (hardErrors.length > 0) {
  console.error("\nUnsafe workflow configuration:");
  for (const entry of hardErrors) console.error(`- ${entry}`);
  process.exit(1);
}

if (strict && mutableRefs.length > 0) {
  console.error(
    "\nStrict supply-chain mode requires every external action to be pinned to an immutable commit SHA.",
  );
  process.exit(1);
}

if (!strict && mutableRefs.length > 0) {
  console.log(
    "\nAudit mode completed. Run `pnpm ci:supply-chain:strict` to enforce zero mutable action references.",
  );
} else {
  console.log("\nWorkflow supply-chain audit passed.");
}
