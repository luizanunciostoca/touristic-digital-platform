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

export function createMySqlPool(
  databaseUrl: string | undefined,
  options: Readonly<{ connectionLimit?: number; errorPrefix?: string }> = {},
): Pool {
  const errorPrefix = options.errorPrefix ?? "DATABASE";
  if (!databaseUrl) throw new Error(`${errorPrefix}_URL_REQUIRED`);
  const connectionLimit = Number(options.connectionLimit ?? 6);
  if (
    !Number.isSafeInteger(connectionLimit) ||
    connectionLimit < 1 ||
    connectionLimit > 64
  ) {
    throw new Error(`${errorPrefix}_POOL_SIZE_INVALID`);
  }
  return mysql.createPool({
    uri: databaseUrl,
    connectionLimit,
    waitForConnections: true,
    timezone: "Z",
  });
}

export function createContentPool(
  databaseUrl = process.env.CONTENT_DATABASE_URL,
): Pool {
  return createMySqlPool(databaseUrl, {
    connectionLimit: Number(process.env.CONTENT_DATABASE_POOL_SIZE ?? 6),
    errorPrefix: "CONTENT_DATABASE",
  });
}

export { MySqlPlaceMediaRepository } from "./mysql-place-media-repository.js";
