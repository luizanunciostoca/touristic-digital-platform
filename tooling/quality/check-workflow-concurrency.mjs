import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Coordinate writers of each canonical web service in this repository.
// These groups must not depend on workflow, candidate or request identity.
export const renderMutationGroups = Object.freeze({
  staging: "render-staging-srv-da4hb6c9v7es7386ttt0",
  production: "render-production-srv-daqgk83ncjis739tghig",
});

const registeredRenderWriters = new Map([
  ["staging-render-promotion.yml", "staging"],
  ["staging-oci-promotion.yml", "staging"],
  ["production-render-promotion.yml", "production"],
  ["production-oci-promotion.yml", "production"],
  ["production-render-rollback.yml", "production"],
]);

const nonInterruptible = new Set([
  "final-release-acceptance.yml",
  ...registeredRenderWriters.keys(),
  "release-promotion-gate.yml",
  "oci-release-promotion-gate.yml",
  "release-oci-image.yml",
]);

function referencesSecret(source, name) {
  return new RegExp(
    String.raw`\bsecrets\s*(?:\.\s*${name}\b|\[\s*(['"])${name}\1\s*\])`,
    "iu",
  ).test(source);
}

function mutationTargets(file, source) {
  const targets = new Set();
  if (registeredRenderWriters.has(file)) {
    targets.add(registeredRenderWriters.get(file));
  }
  // Renamed/new writers using the same target credentials also need the lock.
  // This classification does not substitute for provider target readback.
  if (
    [
      "RENDER_STAGING_DEPLOY_HOOK_URL",
      "RENDER_STAGING_IMAGE_DEPLOY_HOOK_URL",
    ].some((name) => referencesSecret(source, name))
  ) {
    targets.add("staging");
  }
  if (
    ["RENDER_PRODUCTION_DEPLOY_HOOK_URL", "RENDER_PRODUCTION_SERVICE_ID"].some(
      (name) => referencesSecret(source, name),
    ) ||
    /node\s+tooling\/render\/production-canonical-db-cutover\.mjs\s+(?:cutover|rollback)\b/u.test(
      source,
    )
  ) {
    targets.add("production");
  }
  return [...targets];
}

function literal(value) {
  return value?.trim().replace(/^(?:"([^"]*)"|'([^']*)')$/u, "$1$2");
}

export function checkWorkflowConcurrency(workflows) {
  const failures = [];
  for (const [file, source] of workflows) {
    const lines = source.split(/\r?\n/u);
    const indices = lines.flatMap((line, index) =>
      /^concurrency:\s*$/u.test(line) ? [index] : [],
    );
    if (indices.length !== 1) {
      failures.push(
        `${file}: exactly one top-level concurrency block is required`,
      );
      continue;
    }
    const block = [];
    for (const line of lines.slice(indices[0] + 1)) {
      if (line.trim() === "" || /^\s|^#/u.test(line)) block.push(line);
      else break;
    }
    const field = (name) => {
      const entries = block.flatMap((line) => {
        const match = line.match(
          new RegExp(`^ {2}${name}:\\s*(\\S.*?)\\s*$`, "u"),
        );
        return match ? [literal(match[1])] : [];
      });
      if (entries.length !== 1) {
        failures.push(`${file}: concurrency.${name} must occur exactly once`);
        return null;
      }
      return entries[0];
    };
    const group = field("group"),
      cancel = field("cancel-in-progress");
    const targets = mutationTargets(file, source);
    if (targets.length > 1) {
      failures.push(
        `${file}: multiple Render mutation targets require separate writers`,
      );
    }
    if ((nonInterruptible.has(file) || targets.length) && cancel !== "false") {
      failures.push(
        `${file}: operational release/deploy workflow must use cancel-in-progress: false`,
      );
    }
    if (targets.length === 1) {
      const target = targets[0],
        expected = renderMutationGroups[target];
      if (group !== expected) {
        failures.push(
          `${file}: ${target} service writers must share concurrency.group ${expected}`,
        );
      }
      // Without queue:max GitHub replaces an already pending request even with
      // cancel-in-progress:false. Retain pending deploy and rollback requests.
      if (field("queue") !== "max") {
        failures.push(
          `${file}: Render mutation writers must use concurrency.queue: max`,
        );
      }
    }
  }
  return failures;
}

export function readWorkflowSources(root = process.cwd()) {
  const dir = resolve(root, ".github", "workflows");
  return new Map(
    readdirSync(dir)
      .filter((name) => /\.ya?ml$/iu.test(name))
      .sort()
      .map((name) => [name, readFileSync(resolve(dir, name), "utf8")]),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const workflows = readWorkflowSources();
  const failures = checkWorkflowConcurrency(workflows);
  if (failures.length) {
    console.error("Workflow concurrency policy failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Workflow concurrency policy passed for ${workflows.size} workflow files.`,
    );
  }
}
