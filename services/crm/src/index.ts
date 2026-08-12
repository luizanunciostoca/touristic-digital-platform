import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlCrmLeadRepository } from "./mysql-leads-repository.js";
import { crmM71SchemaSql } from "./schema.js";

export { MySqlCrmLeadRepository, crmM71SchemaSql };

export interface CrmMySqlEnvironment {
  readonly CRM_DATABASE_URL?: string;
}

export function createCrmMySqlPoolFromEnvironment(
  environment: CrmMySqlEnvironment,
): Pool {
  const uri = environment.CRM_DATABASE_URL?.trim();
  if (!uri) throw new Error("CRM_DATABASE_URL is required");
  const options: PoolOptions = {
    uri,
    connectionLimit: 10,
    enableKeepAlive: true,
    decimalNumbers: false,
    timezone: "Z",
  };
  return mysql.createPool(options);
}

export async function applyCrmM71Schema(pool: Pool): Promise<void> {
  for (const statement of crmM71SchemaSql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}
