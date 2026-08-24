const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
function replaceOnce(file, from, to) {
  const current = read(file);
  const count = current.split(from).length - 1;
  if (count !== 1) throw new Error(`${file}: expected exactly one match, got ${count}`);
  write(file, current.replace(from, to));
}

const activation = `import type { VerifiedPaymentResult } from "@touristic/financial";

import { normalizeOrderId, type Order } from "./index.js";
import {
  createActiveSubscription,
  normalizeSubscriptionId,
  type Subscription,
  type SubscriptionRepositoryPort,
} from "./subscription.js";

export type SubscriptionActivationDisposition = "activated" | "replayed";

export interface SubscriptionActivationResult {
  readonly disposition: SubscriptionActivationDisposition;
  readonly subscription: Subscription;
}

export interface SubscriptionActivationDependencies {
  readonly subscriptions: SubscriptionRepositoryPort;
}

export const subscriptionActivationErrorCodes = Object.freeze([
  "SUBSCRIPTION_ACTIVATION_INVALID_ORDER",
  "SUBSCRIPTION_ACTIVATION_UNSUPPORTED_SOURCE",
  "SUBSCRIPTION_ACTIVATION_INVALID_VERIFIED_PAYMENT",
  "SUBSCRIPTION_ACTIVATION_CONFLICT",
] as const);

export type SubscriptionActivationErrorCode =
  (typeof subscriptionActivationErrorCodes)[number];

export class SubscriptionActivationError extends Error {
  readonly code: SubscriptionActivationErrorCode;

  constructor(code: SubscriptionActivationErrorCode) {
    super(code);
    this.name = "SubscriptionActivationError";
    this.code = code;
  }
}

function failure(code: SubscriptionActivationErrorCode): never {
  throw new SubscriptionActivationError(code);
}

function addCalendarMonthUtc(value: string): string {
  const source = new Date(value);
  if (!Number.isFinite(source.getTime())) {
    failure("SUBSCRIPTION_ACTIVATION_INVALID_VERIFIED_PAYMENT");
  }
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month + 1,
      Math.min(day, lastDay),
      source.getUTCHours(),
      source.getUTCMinutes(),
      source.getUTCSeconds(),
      source.getUTCMilliseconds(),
    ),
  ).toISOString();
}

function subscriptionIdForOrder(order: Order): string {
  const orderId = normalizeOrderId(order.id);
  if (!orderId) failure("SUBSCRIPTION_ACTIVATION_INVALID_ORDER");
  const subscriptionId = normalizeSubscriptionId(\`sub_\${orderId.slice(4)}\`);
  if (!subscriptionId) failure("SUBSCRIPTION_ACTIVATION_INVALID_ORDER");
  return subscriptionId;
}

function samePricing(left: Subscription, right: Subscription): boolean {
  const a = left.currentPeriod.pricing;
  const b = right.currentPeriod.pricing;
  return (
    a.planId === b.planId &&
    a.planName === b.planName &&
    a.amount.minorUnits === b.amount.minorUnits &&
    a.amount.currency === b.amount.currency &&
    a.pricingVersion === b.pricingVersion &&
    a.capturedAt === b.capturedAt
  );
}

function sameActivation(existing: Subscription, expected: Subscription): boolean {
  if (
    existing.id !== expected.id ||
    existing.createdAt !== expected.createdAt ||
    !samePricing(existing, expected)
  ) {
    return false;
  }
  if (existing.currentPeriod.number !== 1) return true;
  return (
    existing.currentPeriod.startAt === expected.currentPeriod.startAt &&
    existing.currentPeriod.endAt === expected.currentPeriod.endAt &&
    existing.currentPeriod.orderId === expected.currentPeriod.orderId &&
    existing.currentPeriod.paymentId === expected.currentPeriod.paymentId &&
    existing.currentPeriod.verifiedResultId ===
      expected.currentPeriod.verifiedResultId
  );
}

export function createSubscriptionActivationApplicationService(
  dependencies: SubscriptionActivationDependencies,
) {
  return Object.freeze({
    async activate(input: {
      readonly order: Order;
      readonly verifiedPayment: VerifiedPaymentResult;
    }): Promise<SubscriptionActivationResult> {
      const orderId = normalizeOrderId(input.order.id);
      if (!orderId || input.order.status !== "payment_confirmed") {
        failure("SUBSCRIPTION_ACTIVATION_INVALID_ORDER");
      }
      if (input.order.source.kind !== "business_onboarding") {
        failure("SUBSCRIPTION_ACTIVATION_UNSUPPORTED_SOURCE");
      }

      const subscriptionId = subscriptionIdForOrder(input.order);
      const periodStartAt = input.verifiedPayment.occurredAt;
      const periodEndAt = addCalendarMonthUtc(periodStartAt);
      const expected = createActiveSubscription({
        id: subscriptionId,
        order: input.order,
        verifiedPayment: input.verifiedPayment,
        periodStartAt,
        periodEndAt,
        createdAt: input.verifiedPayment.recordedAt,
      });
      if (!expected) {
        failure("SUBSCRIPTION_ACTIVATION_INVALID_VERIFIED_PAYMENT");
      }

      const existing = await dependencies.subscriptions.findById(
        expected.id,
      );
      if (existing) {
        if (!sameActivation(existing, expected)) {
          failure("SUBSCRIPTION_ACTIVATION_CONFLICT");
        }
        return Object.freeze({
          disposition: "replayed" as const,
          subscription: existing,
        });
      }

      const persisted = await dependencies.subscriptions.save(expected);
      if (!sameActivation(persisted, expected)) {
        failure("SUBSCRIPTION_ACTIVATION_CONFLICT");
      }
      return Object.freeze({
        disposition: "activated" as const,
        subscription: persisted,
      });
    },
  });
}
`;
write('packages/ordering/src/subscription-activation.ts', activation);

const activationTest = `import { describe, expect, it } from "vitest";

import {
  normalizeFinancialEventId,
  normalizePaymentId,
  normalizeProviderEventId,
  type VerifiedPaymentResult,
} from "@touristic/financial";

import {
  capturePricingSnapshot,
  createBusinessOrderRequestKey,
  createOrder,
  createPricingQuote,
  normalizeOrderId,
  normalizeOrderSourceReference,
  type Order,
} from "./index.js";
import { createSubscriptionActivationApplicationService } from "./subscription-activation.js";
import type { Subscription } from "./subscription.js";

function order(at = "2026-01-31T10:00:00Z"): Order {
  const id = normalizeOrderId("ord_activation_12345678");
  const key = createBusinessOrderRequestKey("session_activation", "growth");
  const source = normalizeOrderSourceReference("session_activation");
  const quote = createPricingQuote({
    planId: "growth",
    planName: "Growth",
    minorUnits: 10_000,
    currency: "BRL",
    pricingVersion: "pricing_v1",
  });
  const pricing = quote ? capturePricingSnapshot(quote, at) : null;
  if (!id || !key || !source || !pricing) throw new Error("FIXTURE_INVALID");
  const value = createOrder({
    id,
    requestKey: key,
    source,
    status: "payment_confirmed",
    pricing,
    createdAt: at,
    updatedAt: at,
  });
  if (!value) throw new Error("ORDER_INVALID");
  return value;
}

function verified(
  orderReference = "ord_activation_12345678",
): VerifiedPaymentResult {
  const resultId = normalizeFinancialEventId("fev_activation_12345678");
  const providerEventId = normalizeProviderEventId("pwe_activation_12345678");
  const paymentId = normalizePaymentId("pay_activation_12345678");
  if (!resultId || !providerEventId || !paymentId) throw new Error("PAYMENT_FIXTURE_INVALID");
  return {
    resultId,
    providerEventId,
    paymentId,
    orderReference,
    kind: "approved",
    paymentStatus: "confirmed",
    paymentReference: "provider_activation_12345678",
    occurredAt: "2026-01-31T10:05:00Z",
    recordedAt: "2026-01-31T10:06:00Z",
  };
}

describe("subscription activation application service", () => {
  it("materializes the first paid period server-side and clamps calendar month ends", async () => {
    let stored: Subscription | null = null;
    const service = createSubscriptionActivationApplicationService({
      subscriptions: {
        findById: async () => stored,
        save: async value => (stored = value),
      },
    });
    const result = await service.activate({ order: order(), verifiedPayment: verified() });
    expect(result.disposition).toBe("activated");
    expect(result.subscription).toMatchObject({
      id: "sub_activation_12345678",
      status: "active",
      currentPeriod: {
        number: 1,
        startAt: "2026-01-31T10:05:00.000Z",
        endAt: "2026-02-28T10:05:00.000Z",
        orderId: "ord_activation_12345678",
        paymentId: "pay_activation_12345678",
      },
    });
  });

  it("is deterministically replayable without creating another subscription", async () => {
    let stored: Subscription | null = null;
    let writes = 0;
    const service = createSubscriptionActivationApplicationService({
      subscriptions: {
        findById: async () => stored,
        save: async value => {
          writes += 1;
          stored = value;
          return value;
        },
      },
    });
    await service.activate({ order: order(), verifiedPayment: verified() });
    const replay = await service.activate({ order: order(), verifiedPayment: verified() });
    expect(replay.disposition).toBe("replayed");
    expect(writes).toBe(1);
  });

  it("fails closed when verified payment belongs to a different order", async () => {
    const service = createSubscriptionActivationApplicationService({
      subscriptions: { findById: async () => null, save: async value => value },
    });
    await expect(
      service.activate({ order: order(), verifiedPayment: verified("ord_other_12345678") }),
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_ACTIVATION_INVALID_VERIFIED_PAYMENT" });
  });
});
`;
write('packages/ordering/src/subscription-activation.test.ts', activationTest);

const orderingPkgPath = 'packages/ordering/package.json';
const orderingPkg = JSON.parse(read(orderingPkgPath));
orderingPkg.exports['./subscription-activation'] = {
  types: './src/subscription-activation.ts',
  node: './dist/subscription-activation.js',
  default: './src/subscription-activation.ts',
};
write(orderingPkgPath, JSON.stringify(orderingPkg, null, 2) + '\n');

replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  'import { createMoney, type Money } from "./index.js";',
  'import { createMoney, normalizeFinancialTimestamp, type Money } from "./index.js";',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  readonly frequencyType: "months";\n  readonly reason: string;',
  '  readonly frequencyType: "months";\n  readonly startAt: string;\n  readonly reason: string;',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  readonly frequencyType: "months";\n  readonly payerEmail: string;\n}\n\nexport interface ProviderSubscriptionBinding',
  '  readonly frequencyType: "months";\n  readonly startAt?: string;\n  readonly payerEmail: string;\n}\n\nexport interface ProviderSubscriptionBinding',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  'function httpsUrl(value: unknown): string {',
  'function canonicalTimestamp(value: unknown): string {\n  const normalized = normalizeFinancialTimestamp(value);\n  return normalized ? new Date(normalized).toISOString() : "";\n}\n\nfunction httpsUrl(value: unknown): string {',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '    frequencyType?: unknown;\n    reason?: unknown;',
  '    frequencyType?: unknown;\n    startAt?: unknown;\n    reason?: unknown;',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  const reason = text(input.reason, 160);',
  '  const startAt = canonicalTimestamp(input.startAt);\n  const reason = text(input.reason, 160);',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '    input.frequencyType !== "months" ||\n    !reason ||',
  '    input.frequencyType !== "months" ||\n    !startAt ||\n    !reason ||',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '    frequencyType: "months" as const,\n    reason,',
  '    frequencyType: "months" as const,\n    startAt,\n    reason,',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '    frequencyType?: unknown;\n    payerEmail?: unknown;\n  }>,\n): ProviderSubscriptionSnapshot | null {',
  '    frequencyType?: unknown;\n    startAt?: unknown;\n    payerEmail?: unknown;\n  }>,\n): ProviderSubscriptionSnapshot | null {',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '  const payerEmail = text(input.payerEmail, 200).toLowerCase();',
  '  const payerEmail = text(input.payerEmail, 200).toLowerCase();\n  const startAt = input.startAt === undefined ? "" : canonicalTimestamp(input.startAt);',
);
replaceOnce(
  'packages/financial/src/subscription-provider.ts',
  '    frequencyType: "months" as const,\n    payerEmail,\n  });\n}',
  '    frequencyType: "months" as const,\n    ...(startAt ? { startAt } : {}),\n    payerEmail,\n  });\n}',
);

replaceOnce(
  'services/ordering/src/provider-subscription-http-transport.ts',
  '    snapshot.frequency === 1 &&\n    snapshot.frequencyType === "months"',
  '    snapshot.frequency === 1 &&\n    snapshot.frequencyType === "months" &&\n    snapshot.startAt === subscription.currentPeriod.endAt',
);
replaceOnce(
  'services/ordering/src/provider-subscription-http-transport.ts',
  '      frequencyType: "months",\n      reason: subscription.currentPeriod.pricing.planName,',
  '      frequencyType: "months",\n      startAt: subscription.currentPeriod.endAt,\n      reason: subscription.currentPeriod.pricing.planName,',
);

replaceOnce(
  'services/ordering/src/provider-subscription-http-transport.test.ts',
  '    frequencyType: "months",\n    payerEmail: "buyer@example.com",',
  '    frequencyType: "months",\n    startAt: activeSubscription.currentPeriod.endAt,\n    payerEmail: "buyer@example.com",',
);
replaceOnce(
  'services/ordering/src/provider-subscription-http-transport.test.ts',
  '      frequencyType: "months",\n      payerEmail: "buyer@example.com",',
  '      frequencyType: "months",\n      startAt: activeSubscription.currentPeriod.endAt,\n      payerEmail: "buyer@example.com",',
);

replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.ts',
  '    frequencyType: recurring?.frequency_type,\n    payerEmail: payload.payer_email,',
  '    frequencyType: recurring?.frequency_type,\n    startAt: recurring?.start_date,\n    payerEmail: payload.payer_email,',
);
replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.ts',
  '            frequency_type: request.frequencyType,\n            transaction_amount:',
  '            frequency_type: request.frequencyType,\n            start_date: request.startAt,\n            transaction_amount:',
);
replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.ts',
  '        snapshot.frequencyType !== request.frequencyType ||\n        snapshot.payerEmail !== request.payerEmail',
  '        snapshot.frequencyType !== request.frequencyType ||\n        snapshot.startAt !== request.startAt ||\n        snapshot.payerEmail !== request.payerEmail',
);

replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.test.ts',
  '  frequencyType: "months",\n  reason: "Plano Growth",',
  '  frequencyType: "months",\n  startAt: "2026-09-01T00:00:00.000Z",\n  reason: "Plano Growth",',
);
replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.test.ts',
  '      frequency_type: "months",\n      transaction_amount: 129,',
  '      frequency_type: "months",\n      start_date: "2026-09-01T00:00:00.000Z",\n      transaction_amount: 129,',
);
replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.test.ts',
  '      frequencyType: "months",\n      payerEmail: "buyer@example.com",',
  '      frequencyType: "months",\n      startAt: "2026-09-01T00:00:00.000Z",\n      payerEmail: "buyer@example.com",',
);
replaceOnce(
  'services/financial/src/mercado-pago-subscription-provider.test.ts',
  '        frequency_type: "months",\n        transaction_amount: 129,',
  '        frequency_type: "months",\n        start_date: "2026-09-01T00:00:00.000Z",\n        transaction_amount: 129,',
);

const api = 'apps/morro-digital-platform/tooling/payments-subscription-api.mjs';
replaceOnce(
  api,
  'import { randomUUID } from "node:crypto";',
  'import { randomUUID } from "node:crypto";\n\nimport { normalizeOrderId } from "@touristic/ordering";\nimport { createSubscriptionActivationApplicationService } from "@touristic/ordering/subscription-activation";',
);
replaceOnce(
  api,
  'import { createFinancialMySqlPoolFromEnvironment } from "@touristic/financial-server";',
  'import {\n  MySqlVerifiedPaymentResultRepository,\n  createFinancialMySqlPoolFromEnvironment,\n} from "@touristic/financial-server";',
);
replaceOnce(
  api,
  '  MySqlCheckoutAccessRepository,\n  MySqlSubscriptionRepository,',
  '  MySqlCheckoutAccessRepository,\n  MySqlOrderRepository,\n  MySqlSubscriptionRepository,',
);
replaceOnce(
  api,
  'const subscriptionPath =\n  /^\\/api\\/payments\\/v1\\/subscriptions\\/sub_[A-Za-z0-9_-]{8,116}\\/provider(?:\\/(?:pause|resume|cancel))?$/u;',
  'const subscriptionActivationPath = "/api/payments/v1/subscriptions";\nconst subscriptionPath =\n  /^\\/api\\/payments\\/v1\\/subscriptions\\/sub_[A-Za-z0-9_-]{8,116}\\/provider(?:\\/(?:pause|resume|cancel))?$/u;',
);
replaceOnce(
  api,
  '      const access = new MySqlCheckoutAccessRepository(orderingPool);\n      const transport = new ProviderSubscriptionHttpTransport({\n        subscriptions: new MySqlSubscriptionRepository(orderingPool),',
  '      const access = new MySqlCheckoutAccessRepository(orderingPool);\n      const subscriptions = new MySqlSubscriptionRepository(orderingPool);\n      const orders = new MySqlOrderRepository(orderingPool);\n      const paymentResults = new MySqlVerifiedPaymentResultRepository(financialPool);\n      const activation = createSubscriptionActivationApplicationService({ subscriptions });\n      const transport = new ProviderSubscriptionHttpTransport({\n        subscriptions,',
);
replaceOnce(
  api,
  '      runtime = Object.freeze({ transport, pools, enabled: true });',
  '      runtime = Object.freeze({\n        transport,\n        activation,\n        access,\n        orders,\n        paymentResults,\n        pools,\n        enabled: true,\n      });',
);
replaceOnce(
  api,
  '    matches(pathname) {\n      return subscriptionPath.test(pathname);\n    },',
  '    matches(pathname) {\n      return pathname === subscriptionActivationPath || subscriptionPath.test(pathname);\n    },',
);
replaceOnce(
  api,
  '      const method = String(request.method || "GET").toUpperCase();\n      let body;',
  `      const method = String(request.method || "GET").toUpperCase();\n      const activationRequest = requestUrl.pathname === subscriptionActivationPath;\n      let body;`,
);
replaceOnce(
  api,
  '      try {\n        const result = await runtime.transport.handle({',
  `      try {\n        if (activationRequest) {\n          if (method !== "POST") {\n            sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" }, correlationId, { Allow: "POST" });\n            return;\n          }\n          const orderId = normalizeOrderId(body?.orderId);\n          if (!orderId) {\n            sendJson(response, 400, { error: "INVALID_SUBSCRIPTION_ACTIVATION_REQUEST" }, correlationId);\n            return;\n          }\n          const session = await authApi.resolveSession(request);\n          if (!session) {\n            sendJson(response, 401, { error: "AUTH_REQUIRED" }, correlationId);\n            return;\n          }\n          const mutation = authApi.authorizeMutation(request, session, "subscription.activate");\n          if (!mutation.allowed) {\n            sendJson(response, 403, { error: mutation.reason === "cross_origin_request" ? "ORIGIN_DENIED" : "INVALID_CSRF" }, correlationId);\n            return;\n          }\n          const business = authorizeBusinessAccess(session, header(request, "x-business-id"), { mutation: true });\n          if (!business.allowed || !business.businessId) {\n            sendJson(response, 403, { error: business.reason === "read_only_role" ? "READ_ONLY_ROLE" : "BUSINESS_ACCESS_DENIED" }, correlationId);\n            return;\n          }\n          const checkoutAccess = await runtime.access.findByOrderId(orderId);\n          if (!checkoutAccess?.tenantId || checkoutAccess.tenantId !== business.businessId) {\n            sendJson(response, 403, { error: "BUSINESS_ACCESS_DENIED" }, correlationId);\n            return;\n          }\n          const order = await runtime.orders.findById(orderId);\n          if (!order) {\n            sendJson(response, 404, { error: "ORDER_NOT_FOUND" }, correlationId);\n            return;\n          }\n          const verifiedPayment = await runtime.paymentResults.findByPaymentStatus(checkoutAccess.paymentId, "confirmed");\n          if (!verifiedPayment) {\n            sendJson(response, 409, { error: "PAYMENT_NOT_CONFIRMED" }, correlationId);\n            return;\n          }\n          const activationResult = await runtime.activation.activate({ order, verifiedPayment });\n          runtimeAudit(audit, {\n            action: "subscription.activate",\n            result: "success",\n            reason: activationResult.disposition,\n            correlationId,\n            subscriptionId: activationResult.subscription.id,\n            orderId,\n            tenantId: business.businessId,\n            actorSubject: session.subject,\n          });\n          const subscription = activationResult.subscription;\n          sendJson(\n            response,\n            activationResult.disposition === "activated" ? 201 : 200,\n            {\n              data: Object.freeze({\n                subscriptionId: subscription.id,\n                status: subscription.status,\n                currentPeriod: Object.freeze({\n                  number: subscription.currentPeriod.number,\n                  startAt: subscription.currentPeriod.startAt,\n                  endAt: subscription.currentPeriod.endAt,\n                }),\n                plan: Object.freeze({\n                  id: subscription.currentPeriod.pricing.planId,\n                  name: subscription.currentPeriod.pricing.planName,\n                  amount: subscription.currentPeriod.pricing.amount,\n                  pricingVersion: subscription.currentPeriod.pricing.pricingVersion,\n                }),\n                replayed: activationResult.disposition === "replayed",\n              }),\n            },\n            correlationId,\n          );\n          return;\n        }\n\n        const result = await runtime.transport.handle({`,
);

const browser = 'apps/morro-digital-platform/src/payments-browser-subscription-client.ts';
replaceOnce(
  browser,
  'import { normalizeBusinessId } from "@touristic/business";\nimport { normalizeSubscriptionId } from "@touristic/ordering/subscription";',
  'import { normalizeBusinessId } from "@touristic/business";\nimport { normalizeOrderId } from "@touristic/ordering";\nimport { normalizeSubscriptionId } from "@touristic/ordering/subscription";',
);
replaceOnce(
  browser,
  'export interface PaymentsBrowserSubscriptionClient {\n  create(',
  `export interface BrowserCanonicalSubscriptionProjection {\n  readonly subscriptionId: string;\n  readonly status: "active";\n  readonly currentPeriod: Readonly<{ number: 1; startAt: string; endAt: string }>;\n  readonly plan: BrowserProviderSubscriptionProjection["plan"];\n  readonly replayed: boolean;\n}\n\nexport interface PaymentsBrowserSubscriptionClient {\n  activate(orderId: unknown): Promise<BrowserCanonicalSubscriptionProjection>;\n  create(`,
);
replaceOnce(
  browser,
  'function projection(value: unknown): BrowserProviderSubscriptionProjection {',
  `function activationProjection(value: unknown): BrowserCanonicalSubscriptionProjection {\n  if (!value || typeof value !== "object" || Array.isArray(value)) {\n    throw new Error("INVALID_SUBSCRIPTION_ACTIVATION_RESPONSE");\n  }\n  const data = value as Partial<BrowserCanonicalSubscriptionProjection>;\n  const subscriptionId = normalizeSubscriptionId(data.subscriptionId);\n  if (\n    !subscriptionId ||\n    data.status !== "active" ||\n    data.currentPeriod?.number !== 1 ||\n    typeof data.currentPeriod.startAt !== "string" ||\n    typeof data.currentPeriod.endAt !== "string" ||\n    !data.plan ||\n    typeof data.plan.id !== "string" ||\n    typeof data.plan.name !== "string" ||\n    !data.plan.amount ||\n    !Number.isSafeInteger(data.plan.amount.minorUnits) ||\n    typeof data.plan.amount.currency !== "string" ||\n    typeof data.plan.pricingVersion !== "string" ||\n    typeof data.replayed !== "boolean"\n  ) {\n    throw new Error("INVALID_SUBSCRIPTION_ACTIVATION_RESPONSE");\n  }\n  return Object.freeze({ ...(data as BrowserCanonicalSubscriptionProjection), subscriptionId });\n}\n\nfunction projection(value: unknown): BrowserProviderSubscriptionProjection {`,
);
replaceOnce(
  browser,
  '  const client: PaymentsBrowserSubscriptionClient = {\n    async create(',
  `  const client: PaymentsBrowserSubscriptionClient = {\n    async activate(orderIdInput: unknown): Promise<BrowserCanonicalSubscriptionProjection> {\n      const orderId = normalizeOrderId(orderIdInput);\n      if (!orderId) throw new Error("INVALID_ORDER_ID");\n      const response = await authClient.secureFetch(\n        "/api/payments/v1/subscriptions",\n        {\n          method: "POST",\n          headers: {\n            Accept: "application/json",\n            "Content-Type": "application/json",\n            "X-Business-ID": businessId,\n          },\n          cache: "no-store",\n          body: JSON.stringify({ orderId }),\n        },\n      );\n      if (!response.ok) throw new Error(await errorCode(response));\n      const payload = (await response.json()) as { data?: unknown };\n      return activationProjection(payload.data);\n    },\n    async create(`,
);

const browserTest = 'apps/morro-digital-platform/src/payments-browser-subscription-client.test.ts';
replaceOnce(
  browserTest,
  'describe("createPaymentsBrowserSubscriptionClient", () => {\n  it("sends only provider card token',
  `describe("createPaymentsBrowserSubscriptionClient", () => {\n  it("activates from order identity only and never sends monetary authority", async () => {\n    const activation = {\n      subscriptionId: "sub_browser_subscription_0001",\n      status: "active",\n      currentPeriod: { number: 1, startAt: "2026-08-24T00:00:00.000Z", endAt: "2026-09-24T00:00:00.000Z" },\n      plan: projection.plan,\n      replayed: false,\n    };\n    const secureFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse(activation));\n    const client = createPaymentsBrowserSubscriptionClient({ secureFetch }, "business_browser_0001");\n    await expect(client.activate("ord_browser_subscription_0001")).resolves.toMatchObject({ status: "active" });\n    const [url, init] = secureFetch.mock.calls[0] ?? [];\n    expect(url).toBe("/api/payments/v1/subscriptions");\n    const requestBody = requireStringBody(init);\n    expect(JSON.parse(requestBody)).toEqual({ orderId: "ord_browser_subscription_0001" });\n    expect(requestBody).not.toContain("amount");\n    expect(requestBody).not.toContain("currency");\n    expect(requestBody).not.toContain("frequency");\n    expect(requestBody).not.toContain("payerEmail");\n  });\n\n  it("sends only provider card token`,
);
replaceOnce(
  browserTest,
  '    await expect(\n      client.create("invalid", "card_token_browser_0001"),',
  '    await expect(client.activate("invalid")).rejects.toThrow("INVALID_ORDER_ID");\n    await expect(\n      client.create("invalid", "card_token_browser_0001"),',
);

console.log('SUBSCRIPTION_REMEDIATION_APPLIED');
