import { spawn } from "node:child_process";

const STEPS = Object.freeze([
  Object.freeze({
    name: "payments-migrate",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/payments-migrate.mjs",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-draft-backfill",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-place-backfill.mjs",
      "--apply",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-draft-verify",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-draft-verify.mjs",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-media-backfill-apply",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-media-backfill.mjs",
      "--apply",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-media-backfill-verify",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-media-backfill.mjs",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-publication-readiness-audit",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-publication-readiness.mjs",
    ]),
  }),
  Object.freeze({
    name: "legacy-commercial-description-backfill-dry-run",
    command: process.execPath,
    args: Object.freeze([
      "apps/morro-digital-platform/tooling/legacy-commercial-description-backfill.mjs",
    ]),
  }),
]);

function runStep(step, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(step.command, [...step.args], {
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", () => {
      reject(new Error("STAGING_PREDEPLOY_STEP_START_FAILED"));
    });
    child.once("exit", (code, signal) => {
      if (code === 0 && signal == null) {
        resolve();
        return;
      }
      reject(new Error("STAGING_PREDEPLOY_STEP_FAILED"));
    });
  });
}

export async function runStagingPredeploy({
  environment = process.env,
  spawnImpl = spawn,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    "morro-digital-v2-staging"
  ) {
    throw new Error("STAGING_PREDEPLOY_SERVICE_DENIED");
  }

  for (const step of STEPS) {
    await runStep(step, spawnImpl);
  }

  return Object.freeze({
    contract: "MORRO-STAGING-PREDEPLOY",
    status: "pass",
    steps: Object.freeze(STEPS.map((step) => step.name)),
  });
}

async function runCli() {
  const result = await runStagingPredeploy();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("STAGING_PREDEPLOY_FAILED\n");
    process.exitCode = 1;
  });
}
