import mysql, { type Pool } from "mysql2/promise";

export * from "./schema.js";
export * from "./mysql-affiliate-persistence.js";
export * from "./affiliate-application-service.js";
export * from "./affiliate-commercial-application-service.js";
export * from "./affiliate-http-transport.js";
export * from "./affiliate-adapters.js";

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
