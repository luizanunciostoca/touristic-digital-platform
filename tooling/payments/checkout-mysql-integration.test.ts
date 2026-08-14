import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPaymentIdempotencyKey,
  type Payment,
  type PaymentRepositoryPort,
} from "../../packages/financial/src/index.js";
import {
  createBusinessOrderRequestKey,
  createProviderNeutralCheckoutApplicationService,
  type CheckoutApplicationRequest,
  type CheckoutIdentityPort,
} from "../../packages/ordering/src/index.js";
import {
  MySqlPaymentIdempotencyPort,
  MySqlPaymentRepository,
  applyFinancialM137Schema,
  createFinancialMySqlPoolFromEnvironment,
} from "../../services/financial/src/index.js";
import {
  MySqlOrderRepository,
  applyOrderingM137Schema,
  createOrderPricingAuthorityFromEnvironment,
  createOrderingMySqlPoolFromEnvironment,
} from "../../services/ordering/src/index.js";

const adminUrl = process.env.MYSQL_ADMIN_DATABASE_URL;
const orderingUrl = process.env.ORDERING_DATABASE_URL;
const financialUrl = process.env.FINANCIAL_DATABASE_URL;
const describeMySql =
  adminUrl && orderingUrl && financialUrl ? describe : describe.skip;

type OrderingPool = ReturnType<typeof createOrderingMySqlPoolFromEnvironment>;
type FinancialPool = ReturnType<typeof createFinancialMySqlPoolFromEnvironment>;

function pricingCatalog(minorUnits: number): string {
  return JSON.stringify({
    version: "plans_mysql_2026_08",
    plans: [
      {
        id: "growth",
        name: "Crescimento",
        minorUnits,
        currency: "BRL",
      },
    ],
  });
}

function handoff(): CheckoutApplicationRequest {
  return {
    sessionId: "mysql_checkout_session",
    planId: "growth",
    contractor: {
      name: "Integração Financeira",
      email: "checkout@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "mysql_demo_business",
      displayName: "Checkout MySQL",
      categoryId: "restaurant",
      specialty: "Integração",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "terms_mysql_v1",
        acceptedAt: "2026-08-14T21:30:00Z",
      },
      {
        type: "privacy",
        version: "privacy_mysql_v1",
        acceptedAt: "2026-08-14T21:30:00Z",
      },
    ],
    returnUrl: "https://morro.digital/empresas",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

describeMySql.sequential("M138 checkout application MySQL integration", () => {
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
    await applyOrderingM137Schema(orderingPool);
    await applyFinancialM137Schema(financialPool);
  });

  beforeEach(async () => {
    await financialPool.query("DELETE FROM financial_ledger_postings");
    await financialPool.query("DELETE FROM financial_ledger_transactions");
    await financialPool.query("DELETE FROM financial_payments");
    await financialPool.query("DELETE FROM financial_payment_idempotency");
    await orderingPool.query("DELETE FROM ordering_orders");
  });

  afterAll(async () => {
    await orderingPool?.end();
    await financialPool?.end();
    await adminPool?.end();
  });

  it("repairs an interrupted cross-database start without repricing", async () => {
    const orders = new MySqlOrderRepository(orderingPool);
    const persistedPayments = new MySqlPaymentRepository(financialPool);
    const paymentIdempotency = new MySqlPaymentIdempotencyPort(financialPool);
    let failNextPaymentSave = true;
    const payments: PaymentRepositoryPort = {
      findById: (paymentId) => persistedPayments.findById(paymentId),
      save(payment: Payment): Promise<Payment> {
        if (failNextPaymentSave) {
          failNextPaymentSave = false;
          return Promise.reject(
            new Error("SIMULATED_CROSS_DATABASE_INTERRUPTION"),
          );
        }
        return persistedPayments.save(payment);
      },
    };
    let orderAllocations = 0;
    let paymentAllocations = 0;
    const identities: CheckoutIdentityPort = {
      allocateOrderId(): string {
        orderAllocations += 1;
        return "ord_mysql_checkout_0001";
      },
      allocatePaymentId(): string {
        paymentAllocations += 1;
        return "pay_mysql_checkout_0001";
      },
    };
    const firstService = createProviderNeutralCheckoutApplicationService({
      orders,
      payments,
      paymentIdempotency,
      identities,
      clock: { now: () => "2026-08-14T21:30:00Z" },
      pricing: createOrderPricingAuthorityFromEnvironment({
        ORDERING_PRICING_CATALOG_JSON: pricingCatalog(49_900),
      }),
    });

    await expect(firstService.startCheckout(handoff())).rejects.toThrow(
      "SIMULATED_CROSS_DATABASE_INTERRUPTION",
    );

    const requestKey = createBusinessOrderRequestKey(
      "mysql_checkout_session",
      "growth",
    );
    if (!requestKey) throw new Error("FIXTURE_INVALID");
    const interruptedOrder = await orders.findByRequestKey(requestKey);
    expect(interruptedOrder).toMatchObject({
      status: "draft",
      pricing: { amount: { minorUnits: 49_900, currency: "BRL" } },
    });
    if (!interruptedOrder) throw new Error("FIXTURE_INVALID");
    const idempotencyKey = createPaymentIdempotencyKey(interruptedOrder.id);
    if (!idempotencyKey) throw new Error("FIXTURE_INVALID");
    await expect(paymentIdempotency.find(idempotencyKey)).resolves.toBe(
      "pay_mysql_checkout_0001",
    );
    await expect(
      persistedPayments.findById("pay_mysql_checkout_0001" as never),
    ).resolves.toBeNull();

    const repairService = createProviderNeutralCheckoutApplicationService({
      orders,
      payments,
      paymentIdempotency,
      identities,
      clock: { now: () => "2026-08-14T21:30:00Z" },
      pricing: createOrderPricingAuthorityFromEnvironment({
        ORDERING_PRICING_CATALOG_JSON: pricingCatalog(99_900),
      }),
    });
    const repaired = await repairService.startCheckout(handoff());

    expect(repaired).toMatchObject({
      replayed: true,
      order: {
        id: "ord_mysql_checkout_0001",
        status: "pending_payment",
        pricing: { amount: { minorUnits: 49_900, currency: "BRL" } },
      },
      payment: {
        id: "pay_mysql_checkout_0001",
        status: "pending",
        amount: { minorUnits: 49_900, currency: "BRL" },
      },
    });
    expect(orderAllocations).toBe(1);
    expect(paymentAllocations).toBe(1);
    await expect(
      persistedPayments.findById(repaired.payment.id),
    ).resolves.toEqual(repaired.payment);
  });
});
