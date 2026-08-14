import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

import { MySqlLedgerTransactionRepository } from "./mysql-ledger-repository.js";
import { MySqlPaymentIdempotencyPort } from "./mysql-payment-idempotency-port.js";
import { MySqlPaymentRepository } from "./mysql-payment-repository.js";
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
} from "./sandbox-checkout-provider.js";
import { createSandboxWebhookVerifierFromEnvironment } from "./sandbox-webhook-verifier.js";
import {
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
} from "./schema.js";
import {
  createVerifiedPaymentOutcomeService,
  type VerifiedPaymentOutcome,
  type VerifiedPaymentOutcomeApplicationPort,
  type VerifiedPaymentOutcomeDisposition,
  type VerifiedPaymentOutcomeServiceDependencies,
} from "./verified-payment-outcome-service.js";
import {
  FinancialWebhookHttpTransport,
  sandboxWebhookPath,
} from "./webhook-http-transport.js";

export {
  MySqlLedgerTransactionRepository,
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  MySqlProviderWebhookEventRepository,
  MySqlVerifiedPaymentResultRepository,
  FinancialWebhookHttpTransport,
  SandboxCheckoutProviderError,
  createSandboxCheckoutProviderFromEnvironment,
  createSandboxWebhookVerifierFromEnvironment,
  createVerifiedPaymentOutcomeService,
  financialM137SchemaSql,
  financialM141SchemaSql,
  financialM142SchemaSql,
  sandboxWebhookPath,
};
export type {
  ProviderWebhookEventClaim,
  ProviderWebhookEventRepositoryPort,
  ProviderWebhookReceipt,
  VerifiedPaymentOutcome,
  VerifiedPaymentOutcomeApplicationPort,
  VerifiedPaymentOutcomeDisposition,
  VerifiedPaymentOutcomeServiceDependencies,
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
