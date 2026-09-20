import mysql, { type Pool } from "mysql2/promise";

import { createAnalyticsIngestionService } from "@touristic/analytics/ingestion";

import { AnalyticsHttpTransport } from "./http-transport.js";
import { MySqlAnalyticsEventRepository } from "./mysql-analytics-repository.js";
import { analyticsSchemaSql } from "./schema.js";

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
}

export function createAnalyticsHttpTransport(input: {
  readonly pool: Pool;
  readonly retentionDays: number;
  readonly now?: () => Date;
}): AnalyticsHttpTransport {
  const ingestion = createAnalyticsIngestionService({
    repository: new MySqlAnalyticsEventRepository(input.pool),
    retentionDays: input.retentionDays,
    ...(input.now ? { now: input.now } : {}),
  });
  return new AnalyticsHttpTransport(ingestion);
}
