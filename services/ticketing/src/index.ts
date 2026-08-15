import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlTicketRepository } from "./mysql-ticket-repository.js";
import {
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
} from "./mysql-ticket-checkin-repository.js";
import type {
  TicketingOfflineTransactionalCommandResult,
  TicketingTransactionalCommandPort,
  TicketingTransactionalCommandResult,
} from "./mysql-ticketing-transaction.js";
import { ticketingM147SchemaSql } from "./schema.js";
import {
  TicketingApplicationError,
  createTicketingApplicationService,
  type TicketingApplicationErrorCode,
  type TicketingApplicationService,
  type TicketingApplicationServiceDependencies,
  type TicketingCheckInResult,
  type TicketingIssueResult,
} from "./ticketing-application-service.js";
import { MySqlTicketingTransactionalCommand } from "./validated-ticketing-transaction.js";

export {
  MySqlTicketRepository,
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
  MySqlTicketingTransactionalCommand,
  TicketingApplicationError,
  createTicketingApplicationService,
  ticketingM147SchemaSql,
};

export type {
  TicketingApplicationErrorCode,
  TicketingApplicationService,
  TicketingApplicationServiceDependencies,
  TicketingCheckInResult,
  TicketingIssueResult,
  TicketingOfflineTransactionalCommandResult,
  TicketingTransactionalCommandPort,
  TicketingTransactionalCommandResult,
};

export interface TicketingMySqlEnvironment {
  readonly TICKETING_DATABASE_URL?: string;
}

export function createTicketingMySqlPoolFromEnvironment(
  environment: TicketingMySqlEnvironment,
): Pool {
  const uri = environment.TICKETING_DATABASE_URL?.trim();
  if (!uri) throw new Error("TICKETING_DATABASE_URL is required");
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

export async function applyTicketingM147Schema(pool: Pool): Promise<void> {
  await applySqlStatements(pool, ticketingM147SchemaSql);
}
