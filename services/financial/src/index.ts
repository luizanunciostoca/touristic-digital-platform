import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlLedgerTransactionRepository } from "./mysql-ledger-repository.js";
import { MySqlPaymentIdempotencyPort } from "./mysql-payment-idempotency-port.js";
import { MySqlPaymentRepository } from "./mysql-payment-repository.js";
import { MySqlRefundRequestRepository } from "./mysql-refund-request-repository.js";
import { MySqlFinancialReconciliationRepository } from "./mysql-reconciliation-repository.js";
import {
  MySqlProviderWebhookEventRepository,
  type ProviderWebhookEventClaim,
  type ProviderWebhookEventRepositoryPort,
  type ProviderWebhookReceipt,
} from "./mysql-provider-webhook-event-repository.js";
import { MySqlVerifiedPaymentResultRepository } from "./mysql-verified-payment-result-repository.js";
import {
  MySqlVerifiedPaymentResultFeed,
  type VerifiedPaymentResultCursor,
  type VerifiedPaymentResultFeedPort,
} from "./mysql-verified-payment-result-feed.js";
import {
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxReconciliationProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
} from "./sandbox-checkout-provider.js";
import { createSandboxWebhookVerifierFromEnvironment } from "./sandbox-webhook-verifier.js";
import {
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
  financialM144SchemaSql,
  financialM145SchemaSql,
} from "./schema.js";
import {
  RefundApplicationError,
  createRefundApplicationService,
  type RefundApplicationErrorCode,
  type RefundApplicationResult,
  type RefundApplicationService,
  type RefundApplicationServiceDependencies,
} from "./refund-application-service.js";
import {
  ReconciliationApplicationError,
  createReconciliationApplicationService,
  type ReconciliationApplicationErrorCode,
  type ReconciliationApplicationService,
  type ReconciliationApplicationServiceDependencies,
} from "./reconciliation-application-service.js";
import {
  ReconciliationHttpTransport,
  reconciliationHttpPrefix,
  type ReconciliationHttpAction,
  type ReconciliationHttpAuditPort,
  type ReconciliationHttpAuthorizationDecision,
  type ReconciliationHttpAuthorizationPort,
  type ReconciliationHttpRateLimitPort,
  type ReconciliationHttpRequest,
  type ReconciliationHttpResponse,
  type ReconciliationHttpTransportDependencies,
} from "./reconciliation-http-transport.js";
import {
  RefundHttpTransport,
  refundHttpPrefix,
  type RefundHttpAuditPort,
  type RefundHttpAuthorizationContext,
  type RefundHttpAuthorizationDecision,
  type RefundHttpAuthorizationDenialReason,
  type RefundHttpAuthorizationPort,
  type RefundHttpRateLimitPort,
  type RefundHttpRequest,
  type RefundHttpResponse,
  type RefundHttpTransportDependencies,
} from "./refund-http-transport.js";
import {
  createVerifiedPaymentOutcomeService,
  type VerifiedPaymentOutcome,
  type VerifiedPaymentOutcomeApplicationPort,
  type VerifiedPaymentOutcomeDisposition,
  type VerifiedPaymentOutcomeServiceDependencies,
} from "./verified-payment-outcome-service.js";
import {
  createVerifiedPaymentAccountingService,
  type VerifiedPaymentAccountingApplicationPort,
  type VerifiedPaymentAccountingDisposition,
  type VerifiedPaymentAccountingOutcome,
  type VerifiedPaymentAccountingServiceDependencies,
} from "./verified-payment-accounting-service.js";
import {
  FinancialWebhookHttpTransport,
  sandboxWebhookPath,
} from "./webhook-http-transport.js";
import {
  PaymentObservationEmitter,
  createPaymentObservation,
  type PaymentObservationInput,
  type PaymentObservationName,
  type PaymentObservationSink,
} from "./payment-observation.js";

export {
  ReconciliationApplicationError,
  ReconciliationHttpTransport,
  RefundApplicationError,
  RefundHttpTransport,
  createRefundApplicationService,
  createReconciliationApplicationService,
  MySqlFinancialReconciliationRepository,
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlRefundRequestRepository,
  MySqlProviderWebhookEventRepository,
  MySqlVerifiedPaymentResultFeed,
  MySqlVerifiedPaymentResultRepository,
  FinancialWebhookHttpTransport,
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxReconciliationProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
  createSandboxWebhookVerifierFromEnvironment,
  createVerifiedPaymentOutcomeService,
  createVerifiedPaymentAccountingService,
  PaymentObservationEmitter,
  createPaymentObservation,
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
  financialM144SchemaSql,
  financialM145SchemaSql,
  reconciliationHttpPrefix,
  refundHttpPrefix,
  sandboxWebhookPath,
};
export type {
  ReconciliationApplicationErrorCode,
  ReconciliationApplicationService,
  ReconciliationApplicationServiceDependencies,
  ReconciliationHttpAction,
  ReconciliationHttpAuditPort,
  ReconciliationHttpAuthorizationDecision,
  ReconciliationHttpAuthorizationPort,
  ReconciliationHttpRateLimitPort,
  ReconciliationHttpRequest,
  ReconciliationHttpResponse,
  ReconciliationHttpTransportDependencies,
  RefundApplicationErrorCode,
  RefundApplicationResult,
  RefundApplicationService,
  RefundApplicationServiceDependencies,
  RefundHttpAuditPort,
  RefundHttpAuthorizationContext,
  RefundHttpAuthorizationDecision,
  RefundHttpAuthorizationDenialReason,
  RefundHttpAuthorizationPort,
  RefundHttpRateLimitPort,
  RefundHttpRequest,
  RefundHttpResponse,
  RefundHttpTransportDependencies,
  ProviderWebhookEventClaim,
  ProviderWebhookEventRepositoryPort,
  ProviderWebhookReceipt,
  VerifiedPaymentOutcome,
  VerifiedPaymentOutcomeApplicationPort,
  VerifiedPaymentOutcomeDisposition,
  VerifiedPaymentOutcomeServiceDependencies,
  VerifiedPaymentAccountingApplicationPort,
  VerifiedPaymentAccountingDisposition,
  VerifiedPaymentAccountingOutcome,
  VerifiedPaymentAccountingServiceDependencies,
  PaymentObservationInput,
  PaymentObservationName,
  PaymentObservationSink,
  VerifiedPaymentResultCursor,
  VerifiedPaymentResultFeedPort,
};

export interface FinancialMySqlEnvironment {
  readonly FINANCIAL_DATABASE_URL?: string;
}

export function createFinancialMySqlPoolFromEnvironment(
  environment: FinancialMySqlEnvironment,
): Pool {
  const uri = environment.FINANCIAL_DATABASE_URL?.trim();
  if (!uri) throw new Error("FINANCIAL_DATABASE_URL is required");
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

export async function applyFinancialM137Schema(pool: Pool): Promise<void> {
  await applySqlStatements(pool, financialM137SchemaSql);
}

export async function applyFinancialM141Schema(pool: Pool): Promise<void> {
  await applyFinancialM137Schema(pool);
  await applySqlStatements(pool, financialM141SchemaSql);
}

export async function applyFinancialM142Schema(pool: Pool): Promise<void> {
  await applyFinancialM141Schema(pool);
  await applySqlStatements(pool, financialM142SchemaSql);
}

export async function applyFinancialM144Schema(pool: Pool): Promise<void> {
  await applyFinancialM142Schema(pool);
  await applySqlStatements(pool, financialM144SchemaSql);
}

export async function applyFinancialM145Schema(pool: Pool): Promise<void> {
  await applyFinancialM144Schema(pool);
  await applySqlStatements(pool, financialM145SchemaSql);
}
