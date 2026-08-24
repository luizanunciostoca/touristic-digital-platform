import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { createMoney, normalizeFinancialTimestamp } from "@touristic/financial";
import {
  normalizeProviderSubscriptionSnapshot,
  type ProviderSubscriptionBinding,
  type ProviderSubscriptionBindingRepositoryPort,
  type ProviderSubscriptionSnapshot,
  type ProviderSubscriptionStatus,
} from "@touristic/financial/subscription-provider";

interface ProviderSubscriptionRow extends RowDataPacket {
  subscription_id: string;
  tenant_id: string;
  provider_reference: string;
  status: ProviderSubscriptionStatus;
  amount_minor: string | number;
  currency: string;
  frequency: number;
  frequency_type: "months";
  payer_email: string;
  created_at: Date | string;
  updated_at: Date | string;
}

function timestamp(value: unknown): string {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  if (typeof value !== "string") return "";
  const candidate = value.includes("T")
    ? value
    : `${value.trim().replace(" ", "T")}Z`;
  const normalized = normalizeFinancialTimestamp(candidate);
  return normalized ? new Date(normalized).toISOString() : "";
}

function mysqlTimestamp(value: string): string {
  return value.replace("T", " ").replace("Z", "");
}

function minorUnits(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function tenantId(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{4,120}$/u.test(normalized) ? normalized : "";
}

function toBinding(row: ProviderSubscriptionRow): ProviderSubscriptionBinding {
  const amountMinor = minorUnits(row.amount_minor);
  const amount = amountMinor === null ? null : createMoney(amountMinor, row.currency);
  const tenant = tenantId(row.tenant_id);
  const snapshot = normalizeProviderSubscriptionSnapshot({
    providerSubscriptionReference: row.provider_reference,
    externalReference: row.subscription_id,
    status: row.status,
    amount,
    frequency: row.frequency,
    frequencyType: row.frequency_type,
    payerEmail: row.payer_email,
  });
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  if (
    !tenant ||
    !snapshot ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_CORRUPT_ROW");
  }
  return Object.freeze({
    subscriptionId: snapshot.externalReference,
    tenantId: tenant,
    providerSubscriptionReference: snapshot.providerSubscriptionReference,
    status: snapshot.status,
    amount: snapshot.amount,
    frequency: 1 as const,
    frequencyType: "months" as const,
    payerEmail: snapshot.payerEmail,
    createdAt,
    updatedAt,
  });
}

function immutableMatches(
  binding: ProviderSubscriptionBinding,
  snapshot: ProviderSubscriptionSnapshot,
  tenant: string,
): boolean {
  return (
    binding.subscriptionId === snapshot.externalReference &&
    binding.tenantId === tenant &&
    binding.providerSubscriptionReference ===
      snapshot.providerSubscriptionReference &&
    binding.amount.minorUnits === snapshot.amount.minorUnits &&
    binding.amount.currency === snapshot.amount.currency &&
    binding.frequency === snapshot.frequency &&
    binding.frequencyType === snapshot.frequencyType &&
    binding.payerEmail === snapshot.payerEmail
  );
}

async function selectLocked(
  connection: PoolConnection,
  subscriptionId: string,
  providerReference: string,
): Promise<ProviderSubscriptionBinding[]> {
  const [rows] = await connection.query<ProviderSubscriptionRow[]>(
    `SELECT subscription_id, tenant_id, provider_reference, status, amount_minor,
            currency, frequency, frequency_type, payer_email, created_at, updated_at
       FROM financial_provider_subscriptions
      WHERE subscription_id = ? OR provider_reference = ?
      FOR UPDATE`,
    [subscriptionId, providerReference],
  );
  return rows.map(toBinding);
}

export class MySqlProviderSubscriptionRepository
  implements ProviderSubscriptionBindingRepositoryPort
{
  constructor(private readonly pool: Pool) {}

  async findBySubscriptionId(
    subscriptionId: string,
  ): Promise<ProviderSubscriptionBinding | null> {
    const [rows] = await this.pool.query<ProviderSubscriptionRow[]>(
      `SELECT subscription_id, tenant_id, provider_reference, status, amount_minor,
              currency, frequency, frequency_type, payer_email, created_at, updated_at
         FROM financial_provider_subscriptions
        WHERE subscription_id = ?
        LIMIT 1`,
      [subscriptionId],
    );
    return rows[0] ? toBinding(rows[0]) : null;
  }

  async saveReadback(
    input: ProviderSubscriptionSnapshot,
    observedAtInput: string,
    tenantIdInput: string,
  ): Promise<ProviderSubscriptionBinding> {
    const snapshot = normalizeProviderSubscriptionSnapshot(input);
    const observedAt = timestamp(observedAtInput);
    const tenant = tenantId(tenantIdInput);
    if (!snapshot || !observedAt || !tenant) {
      throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_INVALID");
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const existing = await selectLocked(
        connection,
        snapshot.externalReference,
        snapshot.providerSubscriptionReference,
      );
      if (existing.length > 1) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT");
      }

      const current = existing[0] ?? null;
      if (current && !immutableMatches(current, snapshot, tenant)) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT");
      }
      if (current && Date.parse(observedAt) < Date.parse(current.updatedAt)) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_STALE_READBACK");
      }

      if (current) {
        await connection.execute(
          `UPDATE financial_provider_subscriptions
              SET status = ?, updated_at = ?
            WHERE subscription_id = ? AND provider_reference = ? AND tenant_id = ?`,
          [
            snapshot.status,
            mysqlTimestamp(observedAt),
            snapshot.externalReference,
            snapshot.providerSubscriptionReference,
            tenant,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO financial_provider_subscriptions (
             subscription_id, tenant_id, provider_reference, status, amount_minor,
             currency, frequency, frequency_type, payer_email, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshot.externalReference,
            tenant,
            snapshot.providerSubscriptionReference,
            snapshot.status,
            snapshot.amount.minorUnits,
            snapshot.amount.currency,
            snapshot.frequency,
            snapshot.frequencyType,
            snapshot.payerEmail,
            mysqlTimestamp(observedAt),
            mysqlTimestamp(observedAt),
          ],
        );
      }

      const [rows] = await connection.query<ProviderSubscriptionRow[]>(
        `SELECT subscription_id, tenant_id, provider_reference, status, amount_minor,
                currency, frequency, frequency_type, payer_email, created_at, updated_at
           FROM financial_provider_subscriptions
          WHERE subscription_id = ? AND provider_reference = ? AND tenant_id = ?
          LIMIT 1`,
        [snapshot.externalReference, snapshot.providerSubscriptionReference, tenant],
      );
      const persisted = rows[0] ? toBinding(rows[0]) : null;
      if (!persisted || !immutableMatches(persisted, snapshot, tenant)) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_NOT_PERSISTED");
      }
      await connection.commit();
      return persisted;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
