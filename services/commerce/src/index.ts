import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlRestaurantReservationRepository } from "./mysql-restaurant-reservation-repository.js";
import {
  commerceRestaurantReservationRollbackSql,
  commerceRestaurantReservationSchemaSql,
} from "./restaurant-schema.js";

export {
  MySqlRestaurantReservationRepository,
  commerceRestaurantReservationRollbackSql,
  commerceRestaurantReservationSchemaSql,
};

export interface CommerceMySqlEnvironment {
  readonly COMMERCE_DATABASE_URL?: string;
}

export function createCommerceMySqlPoolFromEnvironment(
  environment: CommerceMySqlEnvironment,
): Pool {
  const uri = environment.COMMERCE_DATABASE_URL?.trim();
  if (!uri) throw new Error("COMMERCE_DATABASE_URL is required");
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

export async function applyCommerceRestaurantReservationSchema(
  pool: Pool,
): Promise<void> {
  await applySqlStatements(pool, commerceRestaurantReservationSchemaSql);
}
