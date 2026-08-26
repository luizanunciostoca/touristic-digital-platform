import mysql, { type Pool } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMoney } from "@touristic/financial";
import type { ProviderSubscriptionSnapshot } from "@touristic/financial/subscription-provider";

import { MySqlProviderSubscriptionRepository } from "./mysql-provider-subscription-repository.js";
import { applyFinancialM146Schema } from "./provider-subscription-schema.js";
import { createFinancialMySqlPoolFromEnvironment } from "./index.js";

const databaseUrl = process.env.FINANCIAL_DATABASE_URL;
const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const describeMySql = databaseUrl && adminUrl ? describe : describe.skip;

function snapshot(
  status: ProviderSubscriptionSnapshot["status"] = "authorized",
  reference = "preapproval_mysql_0001",
): ProviderSubscriptionSnapshot {
  const amount = createMoney(12_900, "BRL");
  if (!amount) throw new Error("FIXTURE_INVALID");
  return Object.freeze({
    providerSubscriptionReference: reference,
    externalReference: "sub_mysql_provider_0001",
    status,
    amount,
    frequency: 1,
    frequencyType: "months",
    payerEmail: "buyer@example.com",
  });
}

describeMySql.sequential("M146 provider subscription MySQL integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!adminUrl || !databaseUrl) {
      throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
    }
    const admin = await mysql.createConnection(adminUrl);
    try {
      await admin.query(
        "CREATE DATABASE IF NOT EXISTS financial_m137_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
    } finally {
      await admin.end();
    }
    pool = createFinancialMySqlPoolFromEnvironment({
      FINANCIAL_DATABASE_URL: databaseUrl,
    });
    await applyFinancialM146Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM financial_provider_subscriptions");
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("persists identity, tenant and authoritative status readbacks idempotently", async () => {
    const repository = new MySqlProviderSubscriptionRepository(pool);

    const created = await repository.saveReadback(
      snapshot(),
      "2026-08-24T04:00:00.000Z",
      "business_mysql_owner",
    );
    expect(created).toMatchObject({
      subscriptionId: "sub_mysql_provider_0001",
      tenantId: "business_mysql_owner",
      providerSubscriptionReference: "preapproval_mysql_0001",
      status: "authorized",
      amount: { minorUnits: 12_900, currency: "BRL" },
      frequency: 1,
      frequencyType: "months",
      payerEmail: "buyer@example.com",
    });

    const replay = await repository.saveReadback(
      snapshot("paused"),
      "2026-08-24T04:01:00.000Z",
      "business_mysql_owner",
    );
    expect(replay).toMatchObject({
      tenantId: "business_mysql_owner",
      status: "paused",
      createdAt: "2026-08-24T04:00:00.000Z",
      updatedAt: "2026-08-24T04:01:00.000Z",
    });
    await expect(
      repository.findBySubscriptionId("sub_mysql_provider_0001"),
    ).resolves.toEqual(replay);
  });

  it("rejects cross-tenant rebinding, split identity and stale readbacks", async () => {
    const repository = new MySqlProviderSubscriptionRepository(pool);
    await repository.saveReadback(
      snapshot(),
      "2026-08-24T04:00:00.000Z",
      "business_mysql_owner",
    );

    await expect(
      repository.saveReadback(
        snapshot(),
        "2026-08-24T04:01:00.000Z",
        "business_mysql_attacker",
      ),
    ).rejects.toThrow("FINANCIAL_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT");

    await expect(
      repository.saveReadback(
        snapshot("authorized", "preapproval_mysql_other"),
        "2026-08-24T04:01:00.000Z",
        "business_mysql_owner",
      ),
    ).rejects.toThrow("FINANCIAL_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT");

    await expect(
      repository.saveReadback(
        snapshot("paused"),
        "2026-08-24T03:59:59.000Z",
        "business_mysql_owner",
      ),
    ).rejects.toThrow("FINANCIAL_PROVIDER_SUBSCRIPTION_STALE_READBACK");
  });
});
