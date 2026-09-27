import mysql, { type Pool } from "mysql2/promise";

import { createAnalyticsIngestionService } from "@touristic/analytics/ingestion";

import { AnalyticsHttpTransport } from "./http-transport.js";
import { MySqlAnalyticsEventRepository } from "./mysql-analytics-repository.js";
import {
  analyticsSchemaSql,
  applyAnalyticsTenantScopeSchema,
} from "./schema.js";

export * from "./control-center-audit.js";
export * from "./http-transport.js";
export * from "./mysql-analytics-repository.js";
export * from "./schema.js";

export function createAnalyticsMySqlPool(
  databaseUrl = process.env.ANALYTICS_DATABASE_URL,
): Pool {
  if (!databaseUrl) throw new Error("ANALYTICS_DATABASE_URL_REQUIRED");
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: Number(process.env.ANALYTICS_DATABASE_POOL_SIZE ?? 8),
    waitForConnections: true,
    timezone: "Z",
  });
}

export async function applyAnalyticsSchema(pool: Pool): Promise<void> {
  await pool.query(analyticsSchemaSql);
  await applyAnalyticsTenantScopeSchema(pool);
}

export function createAnalyticsHttpTransport(input: {
  readonly pool: Pool;
  readonly retentionDays: number;
  readonly now?: () => Date;
  readonly tenantScope?: import(
    "@touristic/analytics/ingestion"
  ).AnalyticsTenantScopeResolver;
  readonly requireTenantScope?: boolean;
  readonly observer?: import(
    "@touristic/analytics/ingestion"
  ).AnalyticsIngestionObserver;
}): AnalyticsHttpTransport {
  const ingestion = createAnalyticsIngestionService({
    repository: new MySqlAnalyticsEventRepository(input.pool),
    retentionDays: input.retentionDays,
    ...(input.now ? { now: input.now } : {}),
    ...(input.tenantScope ? { tenantScope: input.tenantScope } : {}),
    ...(input.requireTenantScope !== undefined
      ? { requireTenantScope: input.requireTenantScope }
      : {}),
    ...(input.observer ? { observer: input.observer } : {}),
  });
  return new AnalyticsHttpTransport(ingestion);
}
