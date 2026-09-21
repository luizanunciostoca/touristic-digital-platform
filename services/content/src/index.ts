import mysql, { type Pool } from "mysql2/promise";

export { ContentAdminApplicationService } from "./content-admin-service.js";
export type {
  ContentCreateInput,
  ContentTransitionCommand,
} from "./content-admin-service.js";
export {
  MySqlContentRepository,
  type ContentAdminListInput,
} from "./mysql-content-repository.js";
export { applyContentM156Schema } from "./schema.js";

export function createContentPool(
  databaseUrl = process.env.CONTENT_DATABASE_URL,
): Pool {
  if (!databaseUrl) throw new Error("CONTENT_DATABASE_URL_REQUIRED");
  const connectionLimit = Number(process.env.CONTENT_DATABASE_POOL_SIZE ?? 6);
  if (
    !Number.isSafeInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 64
  ) {
    throw new Error("CONTENT_DATABASE_POOL_SIZE_INVALID");
  }
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit,
    waitForConnections: true,
    timezone: "Z",
  });
}
