import { createHmac } from "node:crypto";

export const stagingCrmIdentity = Object.freeze({
  service: "morro-digital-v2-staging",
  domain: "CRM",
  database: "morro_crm_staging",
  user: "morro_crm",
});

export function deriveStagingCrmDatabaseIdentity(environment = process.env) {
  if (
    String(environment.RENDER_SERVICE_NAME ?? "").trim() !==
    stagingCrmIdentity.service
  ) {
    throw new Error("STAGING_CRM_SERVICE_DENIED");
  }
  const rootSecret = String(
    environment.STAGING_MYSQL_ROOT_PASSWORD ?? "",
  ).trim();
  if (rootSecret.length < 16) {
    throw new Error("STAGING_CRM_ROOT_SECRET_INVALID");
  }
  // Keep the generated provider root secret outside code and logs; derive a
  // stable, independent schema user for CRM without creating new Render env
  // mutations. Only the staging web service has access to this root secret.
  const password = createHmac("sha256", rootSecret)
    .update("morro-digital-v2-staging/crm-user/v1")
    .digest("hex");
  return Object.freeze({
    domain: stagingCrmIdentity.domain,
    database: stagingCrmIdentity.database,
    user: stagingCrmIdentity.user,
    password,
  });
}
