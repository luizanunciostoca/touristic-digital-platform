import { runLegacyCommercialCutoverAudit } from "./legacy-commercial-cutover-audit.mjs";
import { runLegacyCommercialDescriptionBackfill } from "./legacy-commercial-description-backfill.mjs";
import { runLegacyCommercialDraftVerify } from "./legacy-commercial-draft-verify.mjs";
import { runLegacyCommercialMediaBackfill } from "./legacy-commercial-media-backfill.mjs";
import { runLegacyCommercialPlaceBackfill } from "./legacy-commercial-place-backfill.mjs";
import { runLegacyCommercialPublicationBatch } from "./legacy-commercial-publication-batch.mjs";
import { runLegacyCommercialReviewTransition } from "./legacy-commercial-review-transition.mjs";

const PRODUCTION_SERVICE = "morro-digital-v2";

const defaultSteps = Object.freeze([
  Object.freeze({
    name: "legacy-commercial-place-backfill-apply",
    run: (environment) =>
      runLegacyCommercialPlaceBackfill({ environment, apply: true }),
  }),
  Object.freeze({
    name: "legacy-commercial-draft-verify",
    run: (environment) => runLegacyCommercialDraftVerify({ environment }),
  }),
  Object.freeze({
    name: "legacy-commercial-media-backfill-apply",
    run: (environment) =>
      runLegacyCommercialMediaBackfill({ environment, argv: ["--apply"] }),
  }),
  Object.freeze({
    name: "legacy-commercial-media-backfill-verify",
    run: (environment) =>
      runLegacyCommercialMediaBackfill({ environment, argv: [] }),
  }),
  Object.freeze({
    name: "legacy-commercial-description-backfill-apply",
    run: (environment) =>
      runLegacyCommercialDescriptionBackfill({
        environment,
        argv: ["--apply"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-description-backfill-verify",
    run: (environment) =>
      runLegacyCommercialDescriptionBackfill({
        environment,
        argv: ["--verify"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-review-transition-apply",
    run: (environment) =>
      runLegacyCommercialReviewTransition({
        environment,
        argv: ["--apply"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-review-transition-verify",
    run: (environment) =>
      runLegacyCommercialReviewTransition({
        environment,
        argv: ["--verify"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-cutover-audit-pre-publication",
    run: (environment) => runLegacyCommercialCutoverAudit({ environment }),
  }),
  Object.freeze({
    name: "legacy-commercial-publication-batch-apply",
    run: (environment) =>
      runLegacyCommercialPublicationBatch({
        environment,
        argv: ["--apply"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-publication-batch-verify",
    run: (environment) =>
      runLegacyCommercialPublicationBatch({
        environment,
        argv: ["--verify"],
      }),
  }),
  Object.freeze({
    name: "legacy-commercial-cutover-audit-post-publication",
    run: (environment) => runLegacyCommercialCutoverAudit({ environment }),
  }),
]);

export async function runProductionRuntimeDataPredeploy({
  environment = process.env,
  steps = defaultSteps,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== PRODUCTION_SERVICE
  ) {
    throw new Error("PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED");
  }

  const completed = [];
  for (const step of steps) {
    await step.run(environment);
    completed.push(step.name);
  }

  return Object.freeze({
    contract: "MORRO-PRODUCTION-RUNTIME-DATA-PREDEPLOY",
    contractVersion: 1,
    status: "pass",
    steps: Object.freeze(completed),
  });
}

function safeFailureCode(error) {
  const message = error instanceof Error ? String(error.message).trim() : "";
  return /^[A-Z][A-Z0-9_:-]{2,180}$/u.test(message)
    ? message
    : "PRODUCTION_RUNTIME_DATA_PREDEPLOY_FAILED";
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  runProductionRuntimeDataPredeploy()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(
        `${JSON.stringify({
          contract: "MORRO-PRODUCTION-RUNTIME-DATA-PREDEPLOY",
          status: "fail",
          reason: safeFailureCode(error),
        })}\n`,
      );
      process.exitCode = 1;
    });
}
