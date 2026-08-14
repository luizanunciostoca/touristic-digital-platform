import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlOrderRepository } from "./mysql-order-repository.js";
import { orderingM137SchemaSql } from "./schema.js";

export { MySqlOrderRepository, orderingM137SchemaSql };
export {
  createNodeCheckoutIdentityPort,
  systemCheckoutClock,
} from "./checkout-runtime.js";
export {
  createOrderPricingAuthorityFromEnvironment,
  type OrderingPricingEnvironment,
} from "./pricing-authority.js";

export interface OrderingMySqlEnvironment {
  readonly ORDERING_DATABASE_URL?: string;
}

export function createOrderingMySqlPoolFromEnvironment(
  environment: OrderingMySqlEnvironment,
): Pool {
  const uri = environment.ORDERING_DATABASE_URL?.trim();
  if (!uri) throw new Error("ORDERING_DATABASE_URL is required");
  const options: PoolOptions = {
    uri,
    connectionLimit: 10,
    enableKeepAlive: true,
    decimalNumbers: false,
    timezone: "Z",
  };
  return mysql.createPool(options);
}

async function applySqlStatements(pool: Pool, sql: string): Promise<void> {
  for (const statement of sql
    .split(";\n")
    .map((value) => value.trim())
    .filter(Boolean)) {
    await pool.query(statement);
  }
}

export async function applyOrderingM137Schema(pool: Pool): Promise<void> {
  await applySqlStatements(pool, orderingM137SchemaSql);
}
