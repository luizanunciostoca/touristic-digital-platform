import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import {
  normalizeFinancialTimestamp,
  type Money,
} from "@touristic/financial";
import {
  normalizeProviderSubscriptionSnapshot,
  type ProviderSubscriptionSnapshot,
  type ProviderSubscriptionStatus,
} from "@touristic/financial/subscription-provider";

export interface ProviderSubscriptionBinding {
  readonly subscriptionId: string;
  readonly providerSubscriptionReference: string;
  readonly status: ProviderSubscriptionStatus;
  readonly amount: Money;
  readonly frequency: 1;
  readonly frequencyType: "months";
  readonly payerEmail: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProviderSubscriptionRow extends RowDataPacket {
  subscription_id: string;
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
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : "";
}

function mysqlTimestamp(value: string): string {
  return value.replace("T", " ").replace("Z", "");
}

function minorUnits(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function toBinding(row: ProviderSubscriptionRow): ProviderSubscriptionBinding {
  const amountMinor = minorUnits(row.amount_minor);
  const snapshot = normalizeProviderSubscriptionSnapshot({
    providerSubscriptionReference: row.provider_reference,
    externalReference: row.subscription_id,
    status: row.status,
    amount:
      amountMinor === null
        ? null
        : { minorUnits: amountMinor, currency: row.currency },
    frequency: row.frequency,
    frequencyType: row.frequency_type,
    payerEmail: row.payer_email,
  });
  const createdAt = timestamp(row.created_at);
  const updatedAt = timestamp(row.updated_at);
  if (
    !snapshot ||
    !createdAt ||
    !updatedAt ||
    Date.parse(updatedAt) < Date.parse(createdAt)
  ) {
    throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_CORRUPT_ROW");
  }
  return Object.freeze({
    subscriptionId: snapshot.externalReference,
    providerSubscriptionReference: snapshot.providerSubscriptionReference,
    status: snapshot.status,
    amount: snapshot.amount,
    frequency: snapshot.frequency,
    frequencyType: snapshot.frequencyType,
    payerEmail: snapshot.payerEmail,
    createdAt,
    updatedAt,
  });
}

function immutableMatches(
  binding: ProviderSubscriptionBinding,
  snapshot: ProviderSubscriptionSnapshot,
): boolean {
  return (
    binding.subscriptionId === snapshot.externalReference &&
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
    `SELECT subscription_id, provider_reference, status, amount_minor, currency,
            frequency, frequency_type, payer_email, created_at, updated_at
       FROM financial_provider_subscriptions
      WHERE subscription_id = ? OR provider_reference = ?
      FOR UPDATE`,
    [subscriptionId, providerReference],
  );
  return rows.map(toBinding);
}

export class MySqlProviderSubscriptionRepository {
  constructor(private readonly pool: Pool) {}

  async findBySubscriptionId(
    subscriptionId: string,
  ): Promise<ProviderSubscriptionBinding | null> {
    const [rows] = await this.pool.query<ProviderSubscriptionRow[]>(
      `SELECT subscription_id, provider_reference, status, amount_minor, currency,
              frequency, frequency_type, payer_email, created_at, updated_at
         FROM financial_provider_subscriptions
        WHERE subscription_id = ?
        LIMIT 1`,
      [subscriptionId],
    );
    return rows[0] ? toBinding(rows[0]) : null;
  }

  async saveReadback(
    input: ProviderSubscriptionSnapshot,
    observedAtInput: unknown,
  ): Promise<ProviderSubscriptionBinding> {
    const snapshot = normalizeProviderSubscriptionSnapshot(input);
    const observedAt = timestamp(observedAtInput);
    if (!snapshot || !observedAt) {
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
      if (current && !immutableMatches(current, snapshot)) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT");
      }
      if (current && Date.parse(observedAt) < Date.parse(current.updatedAt)) {
        throw new Error("FINANCIAL_PROVIDER_SUBSCRIPTION_STALE_READBACK");
      }

      if (current) {
        await connection.execute(
          `UPDATE financial_provider_subscriptions
              SET status = ?, updated_at = ?
            WHERE subscription_id = ? AND provider_reference = ?`,
          [
            snapshot.status,
            mysqlTimestamp(observedAt),
            snapshot.externalReference,
            snapshot.providerSubscriptionReference,
          ],
        );
      } else {
        await connection.execute(
          `INSERT INTO financial_provider_subscriptions (
             subscription_id, provider_reference, status, amount_minor, currency,
             frequency, frequency_type, payer_email, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            snapshot.externalReference,
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
        `SELECT subscription_id, provider_reference, status, amount_minor, currency,
                frequency, frequency_type, payer_email, created_at, updated_at
           FROM financial_provider_subscriptions
          WHERE subscription_id = ? AND provider_reference = ?
          LIMIT 1`,
        [snapshot.externalReference, snapshot.providerSubscriptionReference],
      );
      const persisted = rows[0] ? toBinding(rows[0]) : null;
      if (!persisted || !immutableMatches(persisted, snapshot)) {
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
