import mysql, { type Pool } from "mysql2/promise";

export * from "./schema.js";
export * from "./affiliate-identity-schema.js";
export {
  MySqlAffiliateReferralEvidenceRepository,
  MySqlAffiliateAttributionRepository,
  MySqlAffiliateConversionRepository,
  MySqlAffiliateEntitlementRepository,
  MySqlAffiliateIdempotencyPort,
  MySqlAffiliateAuditPort,
  MySqlAffiliateOutbox,
  applyAffiliatesM154Schema,
  MySqlAffiliateMaterializationRepository,
  MySqlAffiliateAccountRepository,
  createAffiliatePersistencePorts,
  type AffiliateOutboxEvent,
  type AffiliateMaterializationRequestRecord,
  type AffiliateAccountRecord,
  type AffiliateMembershipRecord as LegacyAffiliateMembershipRecord,
  type AffiliatePersistencePorts,
} from "./mysql-affiliate-persistence.js";
export * from "./affiliate-application-service.js";
export * from "./affiliate-identity-application-service.js";
export * from "./affiliate-eligibility-gate.js";
export * from "./affiliate-protected-mutation-service.js";
export * from "./affiliate-http-transport.js";
export * from "./affiliate-adapters.js";
export * from "./affiliate-privacy-service.js";

export function createAffiliatePool(
  databaseUrl = process.env.AFFILIATES_DATABASE_URL,
): Pool {
  if (!databaseUrl) throw new Error("AFFILIATES_DATABASE_URL_REQUIRED");
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: Number(process.env.AFFILIATES_DATABASE_POOL_SIZE ?? 8),
    waitForConnections: true,
    timezone: "Z",
  });
}
