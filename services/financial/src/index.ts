import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlLedgerTransactionRepository } from "./mysql-ledger-repository.js";
import { MySqlPaymentIdempotencyPort } from "./mysql-payment-idempotency-port.js";
import { MySqlPaymentRepository } from "./mysql-payment-repository.js";
import { MySqlRefundRequestRepository } from "./mysql-refund-request-repository.js";
import {
  MySqlProviderWebhookEventRepository,
  type ProviderWebhookEventClaim,
  type ProviderWebhookEventRepositoryPort,
  type ProviderWebhookReceipt,
} from "./mysql-provider-webhook-event-repository.js";
import { MySqlVerifiedPaymentResultRepository } from "./mysql-verified-payment-result-repository.js";
import {
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
} from "./sandbox-checkout-provider.js";
import { createSandboxWebhookVerifierFromEnvironment } from "./sandbox-webhook-verifier.js";
import {
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
  financialM144SchemaSql,
} from "./schema.js";
import {
  RefundApplicationError,
  RefundHttpTransport,
  createRefundApplicationService,
  type RefundApplicationErrorCode,
  type RefundApplicationResult,
  type RefundApplicationService,
  type RefundApplicationServiceDependencies,
} from "./refund-application-service.js";
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

export {
  RefundApplicationError,
  createRefundApplicationService,
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlRefundRequestRepository,
  MySqlProviderWebhookEventRepository,
  MySqlVerifiedPaymentResultRepository,
  FinancialWebhookHttpTransport,
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxRefundProviderFromEnvironment,
  createSandboxWebhookVerifierFromEnvironment,
  createVerifiedPaymentOutcomeService,
  createVerifiedPaymentAccountingService,
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
  financialM144SchemaSql,
  refundHttpPrefix,
  sandboxWebhookPath,
};
export type {
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
