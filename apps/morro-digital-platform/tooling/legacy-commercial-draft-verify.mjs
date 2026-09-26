import { verifyLegacyCommercialDraftBackfill } from "./legacy-commercial-draft-verify-core.mjs";

const STAGING_SERVICE = "morro-digital-v2-staging";

async function loadMysqlClient() {
  const module = await import("mysql2/promise");
  return module.default ?? module;
}

export async function runLegacyCommercialDraftVerify({
  environment = process.env,
  mysqlClient,
  mysqlClientLoader = loadMysqlClient,
} = {}) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !== STAGING_SERVICE
  ) {
    throw new Error("LEGACY_COMMERCIAL_DRAFT_VERIFY_SERVICE_DENIED");
  }
  const databaseUrl = String(environment.BUSINESS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) throw new Error("BUSINESS_DATABASE_URL_REQUIRED");

  const resolvedMysqlClient = mysqlClient ?? (await mysqlClientLoader());
  const pool = resolvedMysqlClient.createPool(databaseUrl);
  try {
    return await verifyLegacyCommercialDraftBackfill({ pool });
  } finally {
    await pool.end();
  }
}

async function runCli() {
  const summary = await runLegacyCommercialDraftVerify();
  process.stdout.write(
    `${JSON.stringify({
      contract: "MORRO-STAGING-LEGACY-COMMERCIAL-DRAFT-VERIFY",
      status: "pass",
      ...summary,
    })}\n`,
  );
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  runCli().catch(() => {
    process.stderr.write("LEGACY_COMMERCIAL_DRAFT_VERIFY_FAILED\n");
    process.exitCode = 1;
  });
}
