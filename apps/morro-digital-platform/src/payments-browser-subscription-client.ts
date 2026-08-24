import type { DashboardAuthClient } from "@touristic/auth-browser";
import { normalizeBusinessId } from "@touristic/business";
import { normalizeSubscriptionId } from "@touristic/ordering/subscription";

export type BrowserProviderSubscriptionStatus =
  "pending" | "authorized" | "paused" | "cancelled";

export interface BrowserProviderSubscriptionProjection {
  readonly subscriptionId: string;
  readonly providerSubscriptionReference: string;
  readonly providerStatus: BrowserProviderSubscriptionStatus;
  readonly subscriptionStatus:
    "active" | "cancel_at_period_end" | "past_due" | "cancelled";
  readonly plan: Readonly<{
    id: string;
    name: string;
    amount: Readonly<{ minorUnits: number; currency: string }>;
    pricingVersion: string;
  }>;
  readonly frequency: 1;
  readonly frequencyType: "months";
  readonly replayed: boolean;
}

export interface PaymentsBrowserSubscriptionClient {
  create(
    subscriptionId: unknown,
    cardToken: unknown,
  ): Promise<BrowserProviderSubscriptionProjection>;
  read(subscriptionId: unknown): Promise<BrowserProviderSubscriptionProjection>;
  pause(
    subscriptionId: unknown,
  ): Promise<BrowserProviderSubscriptionProjection>;
  resume(
    subscriptionId: unknown,
  ): Promise<BrowserProviderSubscriptionProjection>;
  cancel(
    subscriptionId: unknown,
  ): Promise<BrowserProviderSubscriptionProjection>;
}

type SecureFetchPort = Pick<DashboardAuthClient, "secureFetch">;

function endpoint(subscriptionIdInput: unknown, action?: string): string {
  const subscriptionId = normalizeSubscriptionId(subscriptionIdInput);
  if (!subscriptionId) throw new Error("INVALID_SUBSCRIPTION_ID");
  const suffix = action ? `/${action}` : "";
  return `/api/payments/v1/subscriptions/${encodeURIComponent(subscriptionId)}/provider${suffix}`;
}

function normalizeCardToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return /^[A-Za-z0-9._:-]{4,512}$/u.test(token) ? token : "";
}

async function errorCode(response: Response): Promise<string> {
  const payload = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === "string"
    ? payload.error
    : `HTTP_${response.status}`;
}

function projection(value: unknown): BrowserProviderSubscriptionProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_SUBSCRIPTION_PROVIDER_RESPONSE");
  }
  const data = value as Partial<BrowserProviderSubscriptionProjection>;
  const subscriptionId = normalizeSubscriptionId(data.subscriptionId);
  const plan = data.plan;
  if (
    !subscriptionId ||
    typeof data.providerSubscriptionReference !== "string" ||
    !["pending", "authorized", "paused", "cancelled"].includes(
      String(data.providerStatus),
    ) ||
    !["active", "cancel_at_period_end", "past_due", "cancelled"].includes(
      String(data.subscriptionStatus),
    ) ||
    !plan ||
    typeof plan.id !== "string" ||
    typeof plan.name !== "string" ||
    !plan.amount ||
    !Number.isSafeInteger(plan.amount.minorUnits) ||
    plan.amount.minorUnits <= 0 ||
    typeof plan.amount.currency !== "string" ||
    typeof plan.pricingVersion !== "string" ||
    data.frequency !== 1 ||
    data.frequencyType !== "months" ||
    typeof data.replayed !== "boolean"
  ) {
    throw new Error("INVALID_SUBSCRIPTION_PROVIDER_RESPONSE");
  }
  return Object.freeze({
    ...(data as BrowserProviderSubscriptionProjection),
    subscriptionId,
  });
}

export function createPaymentsBrowserSubscriptionClient(
  authClient: SecureFetchPort,
  businessIdInput: unknown,
): PaymentsBrowserSubscriptionClient {
  const businessId = normalizeBusinessId(businessIdInput);
  if (!businessId) throw new Error("INVALID_BUSINESS_ID");

  async function request(
    subscriptionId: unknown,
    method: "GET" | "POST",
    action?: "pause" | "resume" | "cancel",
    body?: Readonly<Record<string, string>>,
  ): Promise<BrowserProviderSubscriptionProjection> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Business-ID": businessId,
    };
    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body ?? {});
    }

    const response = await authClient.secureFetch(
      endpoint(subscriptionId, action),
      init,
    );
    if (!response.ok) throw new Error(await errorCode(response));
    const payload = (await response.json()) as { data?: unknown };
    return projection(payload.data);
  }

  const client: PaymentsBrowserSubscriptionClient = {
    async create(
      subscriptionId: unknown,
      cardTokenInput: unknown,
    ): Promise<BrowserProviderSubscriptionProjection> {
      const cardToken = normalizeCardToken(cardTokenInput);
      if (!cardToken) throw new Error("INVALID_CARD_TOKEN");
      return request(subscriptionId, "POST", undefined, { cardToken });
    },
    async read(
      subscriptionId: unknown,
    ): Promise<BrowserProviderSubscriptionProjection> {
      return request(subscriptionId, "GET");
    },
    async pause(
      subscriptionId: unknown,
    ): Promise<BrowserProviderSubscriptionProjection> {
      return request(subscriptionId, "POST", "pause");
    },
    async resume(
      subscriptionId: unknown,
    ): Promise<BrowserProviderSubscriptionProjection> {
      return request(subscriptionId, "POST", "resume");
    },
    async cancel(
      subscriptionId: unknown,
    ): Promise<BrowserProviderSubscriptionProjection> {
      return request(subscriptionId, "POST", "cancel");
    },
  };

  return Object.freeze(client);
}
