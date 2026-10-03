import { runLegacyCommercialCutoverAudit } from "./legacy-commercial-cutover-audit.mjs";
import { runLegacyCommercialDescriptionBackfill } from "./legacy-commercial-description-backfill.mjs";
import { runLegacyCommercialDraftVerify } from "./legacy-commercial-draft-verify.mjs";
import { runLegacyCommercialMediaBackfill } from "./legacy-commercial-media-backfill.mjs";
import { runLegacyCommercialPlaceBackfill } from "./legacy-commercial-place-backfill.mjs";
import { runLegacyCommercialPublicationBatch } from "./legacy-commercial-publication-batch.mjs";
import { runLegacyCommercialReviewTransition } from "./legacy-commercial-review-transition.mjs";

const PRODUCTION_BOOTSTRAP_SERVICE = "morro-digital-v2-production-db-bootstrap";

export async function runProductionRuntimeDataPredeploy({
  environment = process.env,
  runners = {},
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    PRODUCTION_BOOTSTRAP_SERVICE
  ) {
    throw new Error("PRODUCTION_RUNTIME_DATA_PREDEPLOY_SERVICE_DENIED");
  }

  const scopedEnvironment = Object.freeze({
    ...environment,
    PRODUCTION_CANONICAL_PLACE_BOOTSTRAP_ENABLED: "true",
  });

  const run = {
    placeBackfill:
      runners.placeBackfill ??
      ((options) => runLegacyCommercialPlaceBackfill(options)),
    draftVerify:
      runners.draftVerify ??
      ((options) => runLegacyCommercialDraftVerify(options)),
    mediaBackfill:
      runners.mediaBackfill ??
      ((options) => runLegacyCommercialMediaBackfill(options)),
    descriptionBackfill:
      runners.descriptionBackfill ??
      ((options) => runLegacyCommercialDescriptionBackfill(options)),
    reviewTransition:
      runners.reviewTransition ??
      ((options) => runLegacyCommercialReviewTransition(options)),
    cutoverAudit:
      runners.cutoverAudit ??
      ((options) => runLegacyCommercialCutoverAudit(options)),
    publicationBatch:
      runners.publicationBatch ??
      ((options) => runLegacyCommercialPublicationBatch(options)),
  };

  const steps = [];
  const execute = async (name, fn) => {
    const result = await fn();
    steps.push(Object.freeze({ name, result }));
  };

  await execute("legacy-commercial-place-backfill-apply", () =>
    run.placeBackfill({ environment: scopedEnvironment, apply: true }),
  );
  await execute("legacy-commercial-draft-verify", () =>
    run.draftVerify({ environment: scopedEnvironment }),
  );
  await execute("legacy-commercial-media-backfill-apply", () =>
    run.mediaBackfill({
      environment: scopedEnvironment,
      argv: ["--apply"],
    }),
  );
  await execute("legacy-commercial-media-backfill-verify", () =>
    run.mediaBackfill({ environment: scopedEnvironment, argv: [] }),
  );
  await execute("legacy-commercial-description-backfill-apply", () =>
    run.descriptionBackfill({
      environment: scopedEnvironment,
      argv: ["--apply"],
    }),
  );
  await execute("legacy-commercial-description-backfill-verify", () =>
    run.descriptionBackfill({
      environment: scopedEnvironment,
      argv: ["--verify"],
    }),
  );
  await execute("legacy-commercial-review-transition-apply", () =>
    run.reviewTransition({
      environment: scopedEnvironment,
      argv: ["--apply"],
    }),
  );
  await execute("legacy-commercial-review-transition-verify", () =>
    run.reviewTransition({
      environment: scopedEnvironment,
      argv: ["--verify"],
    }),
  );
  await execute("legacy-commercial-cutover-audit-pre-publication", () =>
    run.cutoverAudit({ environment: scopedEnvironment }),
  );
  await execute("legacy-commercial-publication-batch-apply", () =>
    run.publicationBatch({
      environment: scopedEnvironment,
      argv: ["--apply"],
    }),
  );
  await execute("legacy-commercial-publication-batch-verify", () =>
    run.publicationBatch({
      environment: scopedEnvironment,
      argv: ["--verify"],
    }),
  );
  await execute("legacy-commercial-cutover-audit-post-publication", () =>
    run.cutoverAudit({ environment: scopedEnvironment }),
  );

  return Object.freeze({
    contract: "MORRO-PRODUCTION-RUNTIME-DATA-PREDEPLOY",
    contractVersion: 1,
    status: "pass",
    placeCount: 72,
    steps: Object.freeze(steps),
  });
}
