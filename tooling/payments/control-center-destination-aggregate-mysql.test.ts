import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  MySqlFinancialReconciliationRepository,
  MySqlPaymentRepository,
  applyFinancialM145Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "../../services/financial/src/index.js";
import {
  MySqlCheckoutAccessRepository,
  applyOrderingM139Schema,
  createOrderingMySqlPoolFromEnvironment,
} from "../../services/ordering/src/index.js";

const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const orderingUrl = process.env.ORDERING_DATABASE_URL;
const financialUrl = process.env.FINANCIAL_DATABASE_URL;
const describeMySql =
  adminUrl && orderingUrl && financialUrl ? describe : describe.skip;

type OrderingPool = ReturnType<typeof createOrderingMySqlPoolFromEnvironment>;
type FinancialPool = ReturnType<typeof createFinancialMySqlPoolFromEnvironment>;

describeMySql.sequential(
  "Control Center destination aggregate MySQL integration",
  () => {
    let adminPool: OrderingPool;
    let orderingPool: OrderingPool;
    let financialPool: FinancialPool;

    beforeAll(async () => {
      if (!adminUrl || !orderingUrl || !financialUrl) {
        throw new Error("MYSQL_INTEGRATION_URLS_REQUIRED");
      }
      adminPool = createOrderingMySqlPoolFromEnvironment({
        ORDERING_DATABASE_URL: adminUrl,
      });
      await adminPool.query(
        "CREATE DATABASE IF NOT EXISTS ordering_m137_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
      await adminPool.query(
        "CREATE DATABASE IF NOT EXISTS financial_m137_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
      );
      orderingPool = createOrderingMySqlPoolFromEnvironment({
        ORDERING_DATABASE_URL: orderingUrl,
      });
      financialPool = createFinancialMySqlPoolFromEnvironment({
        FINANCIAL_DATABASE_URL: financialUrl,
      });
      await applyOrderingM139Schema(orderingPool);
      await applyFinancialM145Schema(financialPool);
    });

    beforeEach(async () => {
      await financialPool.query(
        "DELETE FROM financial_reconciliation_run_findings",
      );
      await financialPool.query(
        "DELETE FROM financial_reconciliation_findings",
      );
      await financialPool.query("DELETE FROM financial_reconciliation_runs");
      await financialPool.query("DELETE FROM financial_refund_requests");
      await financialPool.query("DELETE FROM financial_payment_results");
      await financialPool.query("DELETE FROM financial_provider_events");
      await financialPool.query("DELETE FROM financial_ledger_postings");
      await financialPool.query("DELETE FROM financial_ledger_transactions");
      await financialPool.query("DELETE FROM financial_payments");
      await financialPool.query("DELETE FROM financial_payment_idempotency");
      for (const table of [
        "ordering_subscription_renewal_intents",
        "ordering_subscriptions",
        "ordering_ticketing_reservation_bindings",
      ]) {
        try {
          await orderingPool.query(`DELETE FROM ${table}`);
        } catch (error) {
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "ER_NO_SUCH_TABLE"
          ) {
            throw error;
          }
        }
      }
      await orderingPool.query("DELETE FROM ordering_checkout_access");
      await orderingPool.query("DELETE FROM ordering_orders");
    });

    afterAll(async () => {
      await Promise.allSettled([
        orderingPool?.end(),
        financialPool?.end(),
        adminPool?.end(),
      ]);
    });

    async function seed(destinationId: string, count: number, start: number) {
      for (let offset = 0; offset < count; offset += 1) {
        const sequence = String(start + offset).padStart(4, "0");
        const orderId = `ord_aggregate_${sequence}`;
        const paymentId = `pay_aggregate_${sequence}`;
        const now = new Date("2026-09-21T12:00:00.000Z");
        await orderingPool.execute(
          `INSERT INTO ordering_orders (
             order_id, request_key, source_kind, source_reference, status,
             plan_id, plan_name, amount_minor, currency, pricing_version,
             pricing_captured_at, created_at, updated_at
           ) VALUES (?, ?, 'business_onboarding', ?, 'payment_confirmed',
                     'growth', 'Growth', 100, 'BRL', 'v1', ?, ?, ?)`,
          [
            orderId,
            `request_${sequence}`,
            `business_${sequence}`,
            now,
            now,
            now,
          ],
        );
        await orderingPool.execute(
          `INSERT INTO ordering_checkout_access (
             order_id, payment_id, request_fingerprint, token_hash,
             requester_kind, actor_subject, destination_id, tenant_id,
             correlation_id, created_at, expires_at
           ) VALUES (?, ?, ?, ?, 'authenticated', ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            paymentId,
            Buffer.alloc(32, 1),
            Buffer.alloc(32, 2),
            `user:${sequence}`,
            destinationId,
            `tenant-${destinationId}`,
            `corr_aggregate_${sequence}`,
            now,
            new Date("2026-09-21T13:00:00.000Z"),
          ],
        );
        await financialPool.execute(
          `INSERT INTO financial_payments (
             payment_id, idempotency_key, subject_kind, subject_reference,
             amount_minor, currency, status, provider_reference,
             created_at, updated_at, confirmed_at, refunded_at
           ) VALUES (?, ?, 'order', ?, 100, 'BRL', 'confirmed', ?, ?, ?, ?, NULL)`,
          [
            paymentId,
            `idem_${sequence}`,
            orderId,
            `provider_${sequence}`,
            now,
            now,
            now,
          ],
        );
      }
    }

    it("keeps Morro and Itacare isolated and aggregates beyond the legacy 30-payment ceiling", async () => {
      await seed("morro-de-sao-paulo", 40, 1);
      await seed("itacare", 35, 1001);

      await financialPool.execute(
        `INSERT INTO financial_reconciliation_findings (
           reconciliation_finding_id, payment_id, kind, severity,
           evidence_hash, expected_value, observed_value, state,
           first_seen_at, last_seen_at, acknowledged_at,
           acknowledged_by, resolved_at
         ) VALUES (
           'rcf_aggregate_00000001', 'pay_aggregate_0001',
           'amount_mismatch', 'critical', ?,
           '100', '90', 'open', ?, ?, NULL, NULL, NULL
         )`,
        [
          Buffer.alloc(32, 3),
          new Date("2026-09-21T12:00:00.000Z"),
          new Date("2026-09-21T12:05:00.000Z"),
        ],
      );

      const access = new MySqlCheckoutAccessRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);
      const reconciliation = new MySqlFinancialReconciliationRepository(
        financialPool,
      );

      const morroPage = await access.listByDestinationId("morro-de-sao-paulo", {
        limit: 250,
      });
      const itacarePage = await access.listByDestinationId("itacare", {
        limit: 250,
      });
      expect(morroPage.records).toHaveLength(40);
      expect(itacarePage.records).toHaveLength(35);
      expect(
        morroPage.records.every(
          (record) => record.destinationId === "morro-de-sao-paulo",
        ),
      ).toBe(true);
      expect(
        itacarePage.records.every(
          (record) => record.destinationId === "itacare",
        ),
      ).toBe(true);

      const morroIds = morroPage.records.map((record) => record.paymentId);
      const itacareIds = itacarePage.records.map((record) => record.paymentId);
      await expect(payments.aggregateConfirmedByIds(morroIds)).resolves.toEqual(
        [{ currency: "BRL", minorUnits: "4000", paymentCount: 40 }],
      );
      await expect(
        payments.aggregateConfirmedByIds(itacareIds),
      ).resolves.toEqual([
        { currency: "BRL", minorUnits: "3500", paymentCount: 35 },
      ]);

      const morroReview = await reconciliation.listPendingReviewByPaymentIds(
        morroIds,
        100,
      );
      const itacareReview = await reconciliation.listPendingReviewByPaymentIds(
        itacareIds,
        100,
      );
      expect(morroReview.total).toBe(1);
      expect(morroReview.findings[0]?.paymentId).toBe("pay_aggregate_0001");
      expect(itacareReview).toEqual({ findings: [], total: 0 });
    });

    it("returns empty owner-backed pages and zero revenue without borrowing another destination", async () => {
      await seed("morro-de-sao-paulo", 2, 1);
      const access = new MySqlCheckoutAccessRepository(orderingPool);
      const payments = new MySqlPaymentRepository(financialPool);

      const empty = await access.listByDestinationId("itacare", { limit: 250 });
      expect(empty).toEqual({ records: [], nextCursor: null });
      await expect(
        payments.aggregateConfirmedByIds(
          empty.records.map((record) => record.paymentId),
        ),
      ).resolves.toEqual([]);
    });
  },
);
