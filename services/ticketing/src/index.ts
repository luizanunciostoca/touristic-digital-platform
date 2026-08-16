import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import {
  ticketingFinancialBridgeRollbackSql,
  ticketingFinancialBridgeSchemaSql,
} from "./financial-bridge-schema.js";
import { MySqlTicketHolderProfileRepository } from "./mysql-ticket-holder-profile-repository.js";
import { MySqlTicketOfflineDeviceRegistry } from "./mysql-offline-device-registry.js";
import { MySqlTicketRepository } from "./mysql-ticket-repository.js";
import {
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
} from "./mysql-ticket-checkin-repository.js";
import { MySqlRefundedReservationCancellationRepository } from "./mysql-refunded-reservation-cancellation-repository.js";
import { MySqlTicketReservationRepository } from "./mysql-ticket-reservation-repository.js";
import { MySqlTicketingPublicReadRepository } from "./mysql-ticketing-public-read-repository.js";
import { createTicketOfflineDeviceSyncService } from "./offline-device-sync.js";
import { createOrderingFinancialReservationConfirmationAuthority } from "./ordering-financial-confirmation-authority.js";
import {
  ticketingPublicApiRollbackSql,
  ticketingPublicApiSchemaSql,
} from "./public-api-schema.js";
import {
  TicketingPublicHttpTransport,
  ticketingHttpPrefix,
  type TicketingHttpActor,
  type TicketingHttpAuditPort,
  type TicketingHttpAuthorizationDecision,
  type TicketingHttpAuthorizationPort,
  type TicketingHttpRequest,
  type TicketingHttpResponse,
  type TicketingPublicHttpTransportDependencies,
} from "./public-http-transport.js";
import {
  TicketReservationApplicationError,
  createTicketReservationApplicationService,
  type TicketReservationApplicationErrorCode,
  type TicketReservationApplicationService,
  type TicketReservationClockPort,
  type TicketReservationConfirmationAuthorityPort,
  type TicketReservationConfirmationRepositoryPort,
  type TicketReservationConfirmationResult,
  type VerifiedTicketReservationAuthority,
} from "./reservation-application-service.js";
import {
  createTicketReservationFulfillmentService,
  type TicketHolderProfilePort,
  type TicketReservationFulfillmentResult,
  type TicketReservationFulfillmentService,
} from "./reservation-fulfillment-service.js";
import { ticketingM150ReservationSchemaSql } from "./reservation-schema.js";
import {
  createVerifiedRefundTicketCancellationHandler,
  type RefundedReservationCancellationRepositoryPort,
  type VerifiedRefundCancellationResult,
  type VerifiedRefundTicketCancellationHandler,
} from "./refund-cancellation.js";
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
import {
  MySqlFinancialResultCursorRepository,
  createVerifiedFinancialResultProcessor,
  type FinancialResultCursor,
  type FinancialResultCursorRepositoryPort,
  type VerifiedFinancialResultFeedPort,
  type VerifiedFinancialResultProcessor,
} from "./verified-financial-result-processor.js";
import {
  createVerifiedPaymentTicketFulfillmentHandler,
  type VerifiedPaymentTicketFulfillmentHandler,
} from "./verified-payment-fulfillment-handler.js";

export {
  MySqlFinancialResultCursorRepository,
  MySqlRefundedReservationCancellationRepository,
  MySqlTicketHolderProfileRepository,
  MySqlTicketOfflineDeviceRegistry,
  MySqlTicketRepository,
  MySqlTicketCheckInRepository,
  MySqlTicketOfflineEnvelopeRepository,
  MySqlTicketReservationRepository,
  MySqlTicketingPublicReadRepository,
  MySqlTicketingTransactionalCommand,
  TicketReservationApplicationError,
  TicketingApplicationError,
  TicketingPublicHttpTransport,
  createOrderingFinancialReservationConfirmationAuthority,
  createTicketOfflineDeviceSyncService,
  createTicketReservationApplicationService,
  createTicketReservationFulfillmentService,
  createTicketingApplicationService,
  createVerifiedFinancialResultProcessor,
  createVerifiedPaymentTicketFulfillmentHandler,
  createVerifiedRefundTicketCancellationHandler,
  ticketingFinancialBridgeRollbackSql,
  ticketingFinancialBridgeSchemaSql,
  ticketingHttpPrefix,
  ticketingM147SchemaSql,
  ticketingM150ReservationSchemaSql,
  ticketingPublicApiRollbackSql,
  ticketingPublicApiSchemaSql,
};

export type {
  FinancialResultCursor,
  FinancialResultCursorRepositoryPort,
  RefundedReservationCancellationRepositoryPort,
  TicketHolderProfilePort,
  TicketReservationApplicationErrorCode,
  TicketReservationApplicationService,
  TicketReservationClockPort,
  TicketReservationConfirmationAuthorityPort,
  TicketReservationConfirmationRepositoryPort,
  TicketReservationConfirmationResult,
  TicketReservationFulfillmentResult,
  TicketReservationFulfillmentService,
  TicketingApplicationErrorCode,
  TicketingApplicationService,
  TicketingApplicationServiceDependencies,
  TicketingCheckInResult,
  TicketingHttpActor,
  TicketingHttpAuditPort,
  TicketingHttpAuthorizationDecision,
  TicketingHttpAuthorizationPort,
  TicketingHttpRequest,
  TicketingHttpResponse,
  TicketingIssueResult,
  TicketingOfflineTransactionalCommandResult,
  TicketingPublicHttpTransportDependencies,
  TicketingTransactionalCommandPort,
  TicketingTransactionalCommandResult,
  VerifiedFinancialResultFeedPort,
  VerifiedFinancialResultProcessor,
  VerifiedPaymentTicketFulfillmentHandler,
  VerifiedRefundCancellationResult,
  VerifiedRefundTicketCancellationHandler,
  VerifiedTicketReservationAuthority,
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

export async function applyTicketingM150ReservationSchema(
  pool: Pool,
): Promise<void> {
  await applySqlStatements(pool, ticketingM150ReservationSchemaSql);
}

export async function applyTicketingFinancialBridgeSchema(
  pool: Pool,
): Promise<void> {
  await applyTicketingM150ReservationSchema(pool);
  await applySqlStatements(pool, ticketingFinancialBridgeSchemaSql);
}

export async function applyTicketingPublicApiSchema(pool: Pool): Promise<void> {
  await applyTicketingM147Schema(pool);
  await applyTicketingFinancialBridgeSchema(pool);
  await applySqlStatements(pool, ticketingPublicApiSchemaSql);
}
