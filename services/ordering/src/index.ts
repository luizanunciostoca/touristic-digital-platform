import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlCheckoutAccessRepository } from "./mysql-checkout-access-repository.js";
import { MySqlOrderRepository } from "./mysql-order-repository.js";
import { MySqlTicketingOrderBindingRepository } from "./mysql-ticketing-order-binding-repository.js";
import { orderingM137SchemaSql, orderingM139SchemaSql } from "./schema.js";
import {
  orderingTicketingBridgeRollbackSql,
  orderingTicketingBridgeSchemaSql,
} from "./ticketing-bridge-schema.js";
import { orderingTicketingReservationSchemaSql } from "./ticketing-reservation-schema.js";

export {
  MySqlCheckoutAccessRepository,
  MySqlOrderRepository,
  MySqlTicketingOrderBindingRepository,
  orderingM137SchemaSql,
  orderingM139SchemaSql,
  orderingTicketingBridgeRollbackSql,
  orderingTicketingBridgeSchemaSql,
  orderingTicketingReservationSchemaSql,
};
export * from "./checkout-access.js";
export * from "./checkout-http-transport.js";
export * from "./checkout-rate-limit.js";
export * from "./checkout-security.js";
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

export async function applyOrderingM139Schema(pool: Pool): Promise<void> {
  await applyOrderingM137Schema(pool);
  await applySqlStatements(pool, orderingM139SchemaSql);
}

export async function applyOrderingTicketingReservationSchema(
  pool: Pool,
): Promise<void> {
  await applyOrderingM137Schema(pool);
  await applySqlStatements(pool, orderingTicketingBridgeSchemaSql);
  await applySqlStatements(pool, orderingTicketingReservationSchemaSql);
}
