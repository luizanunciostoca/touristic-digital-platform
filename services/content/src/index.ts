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
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit: Number(process.env.CONTENT_DATABASE_POOL_SIZE ?? 6),
    waitForConnections: true,
    timezone: "Z",
  });
}
