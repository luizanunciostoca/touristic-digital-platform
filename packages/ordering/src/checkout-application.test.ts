import { describe, expect, it } from "vitest";

import {
  createMoney,
  createPaymentIdempotencyKey,
  type Payment,
  type PaymentId,
  type PaymentIdempotencyClaim,
  type PaymentIdempotencyKey,
  type PaymentIdempotencyPort,
  type PaymentRepositoryPort,
} from "@touristic/financial";

import {
  CheckoutApplicationError,
  createOrder,
  createPricingQuote,
  createProviderNeutralCheckoutApplicationService,
  normalizeBusinessCheckoutHandoff,
  type CheckoutApplicationRequest,
  type CheckoutClockPort,
  type CheckoutIdentityPort,
  type Order,
  type OrderId,
  type OrderPricingAuthorityPort,
  type OrderRepositoryPort,
  type OrderRequestKey,
  type PricingQuote,
  type ProviderNeutralCheckoutDependencies,
} from "./index.js";

function validHandoff(): CheckoutApplicationRequest {
  return {
    sessionId: "session_12345678",
    planId: "growth",
    contractor: {
      name: "Luiz Silva",
      email: "luiz@example.com",
      phone: "+55 75 99999-0000",
      document: "123.456.789-00",
    },
    businessDraft: {
      demoBusinessId: "demo_business_123",
      displayName: "Toca do Morcego",
      categoryId: "restaurant",
      specialty: "Frutos do mar",
      environment: "sandbox",
      publishable: false,
    },
    acceptedTerms: [
      {
        type: "terms",
        version: "business-partner-terms-2026-08",
        acceptedAt: "2026-08-14T21:00:00Z",
      },
      {
        type: "privacy",
        version: "privacy-policy-2026-08",
        acceptedAt: "2026-08-14T21:00:00Z",
      },
    ],
    returnUrl: "https://morro.digital/empresas",
    tutorial: false,
    requiresPaymentsCapability: true,
  };
}

function quote(minorUnits = 49_900): PricingQuote {
  const value = createPricingQuote({
    planId: "growth",
    planName: "Crescimento",
    minorUnits,
    currency: "BRL",
    pricingVersion: "plans_2026_08",
  });
  if (!value) throw new Error("TEST_QUOTE_INVALID");
  return value;
}

class MemoryOrderRepository implements OrderRepositoryPort {
  readonly byId = new Map<OrderId, Order>();
  readonly byRequestKey = new Map<OrderRequestKey, Order>();

  async findById(orderId: OrderId): Promise<Order | null> {
    return this.byId.get(orderId) ?? null;
  }

  async findByRequestKey(
    requestKey: OrderRequestKey,
  ): Promise<Order | null> {
    return this.byRequestKey.get(requestKey) ?? null;
  }

  async save(order: Order): Promise<Order> {
    const owner = this.byRequestKey.get(order.requestKey);
    if (owner && owner.id !== order.id) {
      throw new Error("ORDERING_REQUEST_KEY_CONFLICT");
    }
    this.byId.set(order.id, order);
    this.byRequestKey.set(order.requestKey, order);
    return order;
  }
}

class MemoryPaymentRepository implements PaymentRepositoryPort {
  readonly byId = new Map<PaymentId, Payment>();
  failNextSave = false;

  async findById(paymentId: PaymentId): Promise<Payment | null> {
    return this.byId.get(paymentId) ?? null;
  }

  async save(payment: Payment): Promise<Payment> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("SIMULATED_PAYMENT_OUTAGE");
    }
    const existing = this.byId.get(payment.id);
    if (existing) return existing;
    this.byId.set(payment.id, payment);
    return payment;
  }
}

class MemoryPaymentIdempotency implements PaymentIdempotencyPort {
  readonly claims = new Map<PaymentIdempotencyKey, PaymentId>();

  async claim(
    key: PaymentIdempotencyKey,
    proposedPaymentId: PaymentId,
  ): Promise<PaymentIdempotencyClaim> {
    const existing = this.claims.get(key);
    if (existing) {
      return Object.freeze({ claimed: false, paymentId: existing });
    }
    for (const [otherKey, paymentId] of this.claims) {
      if (otherKey !== key && paymentId === proposedPaymentId) {
        throw new Error("FINANCIAL_IDEMPOTENCY_PAYMENT_ID_CONFLICT");
      }
    }
    this.claims.set(key, proposedPaymentId);
    return Object.freeze({ claimed: true, paymentId: proposedPaymentId });
  }

  async find(key: PaymentIdempotencyKey): Promise<PaymentId | null> {
    return this.claims.get(key) ?? null;
  }
}

class MutablePricingAuthority implements OrderPricingAuthorityPort {
  current: PricingQuote | null = quote();
  calls = 0;

  async resolvePlan(planId: string): Promise<PricingQuote | null> {
    this.calls += 1;
    return this.current?.planId === planId ? this.current : null;
  }
}

class DeterministicIdentities implements CheckoutIdentityPort {
  orderAllocations = 0;
  paymentAllocations = 0;

  allocateOrderId(): unknown {
    this.orderAllocations += 1;
    return "ord_checkout_0001";
  }

  allocatePaymentId(): unknown {
    this.paymentAllocations += 1;
    return "pay_checkout_0001";
  }
}

class FixedClock implements CheckoutClockPort {
  now(): unknown {
    return "2026-08-14T21:00:00Z";
  }
}

function setup(): ProviderNeutralCheckoutDependencies & {
  readonly orders: MemoryOrderRepository;
  readonly payments: MemoryPaymentRepository;
  readonly paymentIdempotency: MemoryPaymentIdempotency;
  readonly pricing: MutablePricingAuthority;
  readonly identities: DeterministicIdentities;
} {
  return {
    orders: new MemoryOrderRepository(),
    payments: new MemoryPaymentRepository(),
    paymentIdempotency: new MemoryPaymentIdempotency(),
    pricing: new MutablePricingAuthority(),
    identities: new DeterministicIdentities(),
    clock: new FixedClock(),
  };
}

describe("M138 Business checkout handoff revalidation", () => {
  it("normalizes and freezes only the bounded provider-neutral contract", () => {
    const handoff = normalizeBusinessCheckoutHandoff(validHandoff());

    expect(handoff).toMatchObject({
      sessionId: "session_12345678",
      planId: "growth",
      contractor: { email: "luiz@example.com" },
      businessDraft: {
        environment: "sandbox",
        publishable: false,
      },
      tutorial: false,
      requiresPaymentsCapability: true,
    });
    expect(handoff?.acceptedTerms[0]?.acceptedAt).toBe(
      "2026-08-14T21:00:00.000Z",
    );
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff?.contractor)).toBe(true);
    expect(Object.isFrozen(handoff?.acceptedTerms)).toBe(true);
  });

  it("rejects unsafe drafts, missing legal acceptance and redirect credentials", () => {
    expect(
      normalizeBusinessCheckoutHandoff({
        ...validHandoff(),
        businessDraft: {
          environment: "production",
          publishable: true,
        },
      }),
    ).toBeNull();
    expect(
      normalizeBusinessCheckoutHandoff({
        ...validHandoff(),
        acceptedTerms: [
          {
            type: "terms",
            version: "v1",
            acceptedAt: "2026-08-14T21:00:00Z",
          },
        ],
      }),
    ).toBeNull();
    expect(
      normalizeBusinessCheckoutHandoff({
        ...validHandoff(),
        returnUrl: "https://user:password@example.com/return",
      }),
    ).toBeNull();
  });
});

describe("M138 provider-neutral checkout application service", () => {
  it("uses only authoritative pricing and creates durable domain state", async () => {
    const dependencies = setup();
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);
    const input = {
      ...validHandoff(),
      amount: { minorUnits: 1, currency: "USD" },
    } as CheckoutApplicationRequest;

    const result = await service.startCheckout(input);

    expect(result.replayed).toBe(false);
    expect(result.order).toMatchObject({
      id: "ord_checkout_0001",
      requestKey: "business:session_12345678:growth",
      status: "pending_payment",
      pricing: {
        planId: "growth",
        amount: { minorUnits: 49_900, currency: "BRL" },
        pricingVersion: "plans_2026_08",
      },
    });
    expect(result.payment).toMatchObject({
      id: "pay_checkout_0001",
      idempotencyKey: "payment:v1:ord_checkout_0001",
      subject: { kind: "order", reference: "ord_checkout_0001" },
      amount: { minorUnits: 49_900, currency: "BRL" },
      status: "pending",
    });
    expect(result.order.updatedAt).toBe("2026-08-14T21:00:00.001Z");
    expect(JSON.stringify(result)).not.toContain("luiz@example.com");
    expect(result).not.toHaveProperty("checkoutUrl");
    expect(result).not.toHaveProperty("publicToken");
    expect(result).not.toHaveProperty("provider");
  });

  it("replays the original snapshot without repricing or reallocating IDs", async () => {
    const dependencies = setup();
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);

    const first = await service.startCheckout(validHandoff());
    dependencies.pricing.current = quote(99_900);
    const second = await service.startCheckout(validHandoff());

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(second.payment.id).toBe(first.payment.id);
    expect(second.order.pricing.amount.minorUnits).toBe(49_900);
    expect(dependencies.pricing.calls).toBe(1);
    expect(dependencies.identities.orderAllocations).toBe(1);
    expect(dependencies.identities.paymentAllocations).toBe(1);
  });

  it("repairs a claimed Payment after a cross-database interruption", async () => {
    const dependencies = setup();
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);
    dependencies.payments.failNextSave = true;

    await expect(service.startCheckout(validHandoff())).rejects.toThrow(
      "SIMULATED_PAYMENT_OUTAGE",
    );
    dependencies.pricing.current = quote(99_900);

    const repaired = await service.startCheckout(validHandoff());

    expect(repaired.replayed).toBe(true);
    expect(repaired.order.status).toBe("pending_payment");
    expect(repaired.order.pricing.amount.minorUnits).toBe(49_900);
    expect(repaired.payment.id).toBe("pay_checkout_0001");
    expect(dependencies.pricing.calls).toBe(1);
    expect(dependencies.identities.orderAllocations).toBe(1);
    expect(dependencies.identities.paymentAllocations).toBe(1);
  });

  it("fails closed when the official plan does not exist", async () => {
    const dependencies = setup();
    dependencies.pricing.current = null;
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);

    await expect(service.startCheckout(validHandoff())).rejects.toMatchObject({
      name: "CheckoutApplicationError",
      code: "CHECKOUT_PLAN_NOT_CONFIGURED",
    });
  });

  it("fails closed on forged IDs and immutable Payment divergence", async () => {
    const forgedDependencies = setup();
    forgedDependencies.identities.allocateOrderId = () => "forged-order";
    const forgedService =
      createProviderNeutralCheckoutApplicationService(forgedDependencies);
    await expect(
      forgedService.startCheckout(validHandoff()),
    ).rejects.toBeInstanceOf(CheckoutApplicationError);

    const dependencies = setup();
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);
    const first = await service.startCheckout(validHandoff());
    const divergentAmount = createMoney(1, "BRL");
    if (!divergentAmount) throw new Error("TEST_MONEY_INVALID");
    dependencies.payments.byId.set(first.payment.id, {
      ...first.payment,
      amount: divergentAmount,
    });

    await expect(service.startCheckout(validHandoff())).rejects.toMatchObject({
      code: "CHECKOUT_PAYMENT_CONFLICT",
    });
  });

  it("keeps Financial idempotency derived from the persisted Order", async () => {
    const dependencies = setup();
    const service =
      createProviderNeutralCheckoutApplicationService(dependencies);
    const result = await service.startCheckout(validHandoff());
    const key = createPaymentIdempotencyKey(result.order.id);

    expect(key).toBe("payment:v1:ord_checkout_0001");
    await expect(
      dependencies.paymentIdempotency.find(key!),
    ).resolves.toBe(result.payment.id);
    const reconstructed = createOrder({
      ...result.order,
      status: "pending_payment",
    });
    expect(reconstructed).not.toBeNull();
  });
});
