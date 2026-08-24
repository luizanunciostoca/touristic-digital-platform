import {
  createSubscriptionProviderIdempotencyKey,
  normalizeProviderSubscriptionRequest,
  normalizeProviderSubscriptionSnapshot,
  type FinancialSubscriptionProviderPort,
  type ProviderSubscriptionBinding,
  type ProviderSubscriptionBindingRepositoryPort,
  type ProviderSubscriptionSnapshot,
} from "@touristic/financial/subscription-provider";
import {
  normalizeSubscriptionId,
  scheduleSubscriptionCancellation,
  type Subscription,
  type SubscriptionId,
  type SubscriptionRepositoryPort,
} from "@touristic/ordering/subscription";

export const providerSubscriptionHttpPrefix =
  "/api/payments/v1/subscriptions" as const;

export interface ProviderSubscriptionHttpRequest {
  readonly method: string;
  readonly pathname: string;
  readonly headers?: Readonly<
    Record<string, string | readonly string[] | undefined>
  >;
  readonly body?: unknown;
  readonly correlationId?: string;
  readonly clientIp?: string;
}

export interface ProviderSubscriptionHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Readonly<Record<string, unknown>>;
}

export type ProviderSubscriptionAuthorizationReason =
  | "authentication_required"
  | "invalid_csrf"
  | "cross_origin_request"
  | "read_only_role"
  | "missing_context"
  | "business_access_denied";

export interface ProviderSubscriptionAuthorizedContext {
  readonly allowed: true;
  readonly actorSubject: string;
  readonly actorEmail: string;
  readonly tenantId: string;
}

export interface ProviderSubscriptionAuthorizationPort {
  authorize(
    request: ProviderSubscriptionHttpRequest,
    subscription: Subscription,
    mutation: boolean,
  ): Promise<
    | ProviderSubscriptionAuthorizedContext
    | Readonly<{
        allowed: false;
        reason: ProviderSubscriptionAuthorizationReason;
      }>
  >;
}

export interface ProviderSubscriptionAuditPort {
  record(event: Readonly<Record<string, string | null>>): Promise<void>;
}

export interface ProviderSubscriptionClockPort {
  now(): string;
}

export interface ProviderSubscriptionHttpTransportDependencies {
  readonly subscriptions: SubscriptionRepositoryPort;
  readonly bindings: ProviderSubscriptionBindingRepositoryPort;
  readonly provider: FinancialSubscriptionProviderPort;
  readonly authorization: ProviderSubscriptionAuthorizationPort;
  readonly audit: ProviderSubscriptionAuditPort;
  readonly clock: ProviderSubscriptionClockPort;
  readonly backUrl: string;
}

type ProviderSubscriptionRoute = Readonly<{
  subscriptionId: SubscriptionId;
  action: "provider" | "pause" | "resume" | "cancel";
}>;

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength
    ? normalized
    : "";
}

function header(
  request: ProviderSubscriptionHttpRequest,
  name: string,
): string {
  const target = name.toLowerCase();
  for (const [key, raw] of Object.entries(request.headers ?? {})) {
    if (key.toLowerCase() !== target) continue;
    const value = typeof raw === "string" ? raw : raw?.[0];
    return text(value, 2_048);
  }
  return "";
}

function correlationId(request: ProviderSubscriptionHttpRequest): string {
  const value = text(
    request.correlationId ?? header(request, "x-correlation-id"),
    120,
  );
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/u.test(value)
    ? value
    : "corr_invalid";
}

function response(
  status: number,
  body: Readonly<Record<string, unknown>>,
  correlation: string,
): ProviderSubscriptionHttpResponse {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "Cache-Control": "no-store",
      "X-Correlation-ID": correlation,
    }),
    body: Object.freeze({ ...body }),
  });
}

function errorResponse(
  status: number,
  error: string,
  correlation: string,
): ProviderSubscriptionHttpResponse {
  return response(status, { error }, correlation);
}

function route(pathname: string): ProviderSubscriptionRoute | null {
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length < 6 ||
    segments.length > 7 ||
    segments[0] !== "api" ||
    segments[1] !== "payments" ||
    segments[2] !== "v1" ||
    segments[3] !== "subscriptions" ||
    segments[5] !== "provider"
  ) {
    return null;
  }

  const subscriptionId = normalizeSubscriptionId(segments[4]);
  if (!subscriptionId) return null;

  const action = segments[6] ?? "provider";
  if (
    action !== "provider" &&
    action !== "pause" &&
    action !== "resume" &&
    action !== "cancel"
  ) {
    return null;
  }

  return Object.freeze({ subscriptionId, action });
}

function authorizationError(
  reason: ProviderSubscriptionAuthorizationReason,
  correlation: string,
): ProviderSubscriptionHttpResponse {
  switch (reason) {
    case "authentication_required":
      return errorResponse(401, "AUTH_REQUIRED", correlation);
    case "missing_context":
      return errorResponse(400, "SUBSCRIPTION_CONTEXT_REQUIRED", correlation);
    case "invalid_csrf":
      return errorResponse(403, "INVALID_CSRF", correlation);
    case "cross_origin_request":
      return errorResponse(403, "ORIGIN_DENIED", correlation);
    case "read_only_role":
      return errorResponse(403, "READ_ONLY_ROLE", correlation);
    case "business_access_denied":
      return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlation);
  }
}

function canonicalNow(clock: ProviderSubscriptionClockPort): string {
  const value = text(clock.now(), 40);
  const timestamp = Date.parse(value);
  if (!value || !Number.isFinite(timestamp)) {
    throw new Error("SUBSCRIPTION_CLOCK_INVALID");
  }
  return new Date(timestamp).toISOString();
}

function httpsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function recordBody(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cardToken(value: unknown): string {
  const body = recordBody(value);
  if (!body) return "";
  const normalized = text(body.cardToken ?? body.card_token_id, 512);
  return /^[A-Za-z0-9._:-]{4,512}$/u.test(normalized) ? normalized : "";
}

function actorEmail(value: unknown): string {
  const normalized = text(value, 200).toLowerCase();
  return /^\S+@\S+\.\S+$/u.test(normalized) ? normalized : "";
}

function snapshotMatchesSubscription(
  snapshot: ProviderSubscriptionSnapshot,
  subscription: Subscription,
): boolean {
  return (
    snapshot.externalReference === subscription.id &&
    snapshot.amount.minorUnits ===
      subscription.currentPeriod.pricing.amount.minorUnits &&
    snapshot.amount.currency ===
      subscription.currentPeriod.pricing.amount.currency &&
    snapshot.frequency === 1 &&
    snapshot.frequencyType === "months"
  );
}

function snapshotMatchesBinding(
  snapshot: ProviderSubscriptionSnapshot,
  binding: ProviderSubscriptionBinding,
): boolean {
  return (
    snapshot.externalReference === binding.subscriptionId &&
    snapshot.providerSubscriptionReference ===
      binding.providerSubscriptionReference &&
    snapshot.amount.minorUnits === binding.amount.minorUnits &&
    snapshot.amount.currency === binding.amount.currency &&
    snapshot.frequency === binding.frequency &&
    snapshot.frequencyType === binding.frequencyType &&
    snapshot.payerEmail === binding.payerEmail
  );
}

function bindingOwnedBy(
  binding: ProviderSubscriptionBinding,
  authorization: ProviderSubscriptionAuthorizedContext,
): boolean {
  return binding.tenantId === authorization.tenantId;
}

function projection(
  binding: ProviderSubscriptionBinding,
  subscription: Subscription,
  replayed: boolean,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    subscriptionId: subscription.id,
    providerSubscriptionReference: binding.providerSubscriptionReference,
    providerStatus: binding.status,
    subscriptionStatus: subscription.status,
    plan: Object.freeze({
      id: subscription.currentPeriod.pricing.planId,
      name: subscription.currentPeriod.pricing.planName,
      amount: subscription.currentPeriod.pricing.amount,
      pricingVersion: subscription.currentPeriod.pricing.pricingVersion,
    }),
    frequency: binding.frequency,
    frequencyType: binding.frequencyType,
    replayed,
  });
}

async function audit(
  port: ProviderSubscriptionAuditPort,
  input: Readonly<Record<string, string | null>>,
): Promise<void> {
  await port.record(Object.freeze({ ...input }));
}

export class ProviderSubscriptionHttpTransport {
  private readonly backUrl: string;

  constructor(
    private readonly dependencies: ProviderSubscriptionHttpTransportDependencies,
  ) {
    this.backUrl = httpsUrl(dependencies.backUrl);
    if (!this.backUrl) throw new Error("SUBSCRIPTION_BACK_URL_INVALID");
  }

  matches(pathname: string): boolean {
    return pathname.startsWith(`${providerSubscriptionHttpPrefix}/`);
  }

  async handle(
    request: ProviderSubscriptionHttpRequest,
  ): Promise<ProviderSubscriptionHttpResponse> {
    const correlation = correlationId(request);
    if (correlation === "corr_invalid") {
      return errorResponse(400, "CORRELATION_ID_REQUIRED", correlation);
    }

    const matched = route(request.pathname);
    if (!matched) return errorResponse(404, "NOT_FOUND", correlation);

    const method = request.method.trim().toUpperCase();
    if (
      (matched.action === "provider" &&
        method !== "GET" &&
        method !== "POST") ||
      (matched.action !== "provider" && method !== "POST")
    ) {
      return errorResponse(405, "METHOD_NOT_ALLOWED", correlation);
    }

    try {
      const subscription = await this.dependencies.subscriptions.findById(
        matched.subscriptionId,
      );
      if (!subscription) {
        return errorResponse(404, "SUBSCRIPTION_NOT_FOUND", correlation);
      }

      const authorization = await this.dependencies.authorization.authorize(
        request,
        subscription,
        method !== "GET",
      );
      if (!authorization.allowed) {
        await audit(this.dependencies.audit, {
          action: `subscription.provider.${matched.action}`,
          result: "denied",
          reason: authorization.reason,
          correlationId: correlation,
          subscriptionId: subscription.id,
          actorSubject: null,
          tenantId: null,
        });
        return authorizationError(authorization.reason, correlation);
      }

      if (matched.action === "provider" && method === "POST") {
        return await this.create(
          request,
          subscription,
          authorization,
          correlation,
        );
      }
      if (matched.action === "provider") {
        return await this.read(subscription, authorization, correlation);
      }
      return await this.transition(
        matched.action,
        subscription,
        authorization,
        correlation,
      );
    } catch {
      return errorResponse(
        503,
        "SUBSCRIPTION_PROVIDER_UNAVAILABLE",
        correlation,
      );
    }
  }

  private async create(
    request: ProviderSubscriptionHttpRequest,
    subscription: Subscription,
    authorization: ProviderSubscriptionAuthorizedContext,
    correlation: string,
  ): Promise<ProviderSubscriptionHttpResponse> {
    const now = canonicalNow(this.dependencies.clock);
    const existing = await this.dependencies.bindings.findBySubscriptionId(
      subscription.id,
    );

    if (existing) {
      if (!bindingOwnedBy(existing, authorization)) {
        return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlation);
      }
      const providerSnapshot = normalizeProviderSubscriptionSnapshot(
        await this.dependencies.provider.readSubscription(
          existing.providerSubscriptionReference,
        ),
      );
      if (
        !providerSnapshot ||
        !snapshotMatchesSubscription(providerSnapshot, subscription) ||
        !snapshotMatchesBinding(providerSnapshot, existing)
      ) {
        throw new Error("SUBSCRIPTION_PROVIDER_READBACK_MISMATCH");
      }
      const persisted = await this.dependencies.bindings.saveReadback(
        providerSnapshot,
        now,
        authorization.tenantId,
      );
      await this.recordSuccess(
        "create",
        "replayed",
        subscription,
        authorization,
        correlation,
      );
      return response(
        200,
        { data: projection(persisted, subscription, true) },
        correlation,
      );
    }

    if (subscription.status !== "active") {
      return errorResponse(409, "SUBSCRIPTION_NOT_ACTIVE", correlation);
    }

    const providerCardToken = cardToken(request.body);
    const payerEmail = actorEmail(authorization.actorEmail);
    if (!providerCardToken || !payerEmail) {
      return errorResponse(
        400,
        "INVALID_SUBSCRIPTION_PROVIDER_REQUEST",
        correlation,
      );
    }

    const idempotencyKey = createSubscriptionProviderIdempotencyKey(
      subscription.id,
    );
    const providerRequest = normalizeProviderSubscriptionRequest({
      subscriptionId: subscription.id,
      idempotencyKey,
      amount: subscription.currentPeriod.pricing.amount,
      frequency: 1,
      frequencyType: "months",
      reason: subscription.currentPeriod.pricing.planName,
      payerEmail,
      cardToken: providerCardToken,
      backUrl: this.backUrl,
      metadata: {
        subscriptionId: subscription.id,
        orderId: subscription.currentPeriod.orderId,
        planId: subscription.currentPeriod.pricing.planId,
      },
    });
    if (!providerRequest) {
      return errorResponse(
        400,
        "INVALID_SUBSCRIPTION_PROVIDER_REQUEST",
        correlation,
      );
    }

    const providerSnapshot = normalizeProviderSubscriptionSnapshot(
      await this.dependencies.provider.createSubscription(providerRequest),
    );
    if (
      !providerSnapshot ||
      !snapshotMatchesSubscription(providerSnapshot, subscription) ||
      providerSnapshot.payerEmail !== providerRequest.payerEmail
    ) {
      throw new Error("SUBSCRIPTION_PROVIDER_READBACK_MISMATCH");
    }

    const persisted = await this.dependencies.bindings.saveReadback(
      providerSnapshot,
      now,
      authorization.tenantId,
    );
    await this.recordSuccess(
      "create",
      "created",
      subscription,
      authorization,
      correlation,
    );
    return response(
      201,
      { data: projection(persisted, subscription, false) },
      correlation,
    );
  }

  private async read(
    subscription: Subscription,
    authorization: ProviderSubscriptionAuthorizedContext,
    correlation: string,
  ): Promise<ProviderSubscriptionHttpResponse> {
    const existing = await this.dependencies.bindings.findBySubscriptionId(
      subscription.id,
    );
    if (!existing) {
      return errorResponse(404, "SUBSCRIPTION_PROVIDER_NOT_FOUND", correlation);
    }
    if (!bindingOwnedBy(existing, authorization)) {
      return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlation);
    }

    const snapshot = normalizeProviderSubscriptionSnapshot(
      await this.dependencies.provider.readSubscription(
        existing.providerSubscriptionReference,
      ),
    );
    if (
      !snapshot ||
      !snapshotMatchesSubscription(snapshot, subscription) ||
      !snapshotMatchesBinding(snapshot, existing)
    ) {
      throw new Error("SUBSCRIPTION_PROVIDER_READBACK_MISMATCH");
    }

    const persisted = await this.dependencies.bindings.saveReadback(
      snapshot,
      canonicalNow(this.dependencies.clock),
      authorization.tenantId,
    );
    await this.recordSuccess(
      "read",
      "authoritative_readback",
      subscription,
      authorization,
      correlation,
    );
    return response(
      200,
      { data: projection(persisted, subscription, true) },
      correlation,
    );
  }

  private async transition(
    action: "pause" | "resume" | "cancel",
    subscription: Subscription,
    authorization: ProviderSubscriptionAuthorizedContext,
    correlation: string,
  ): Promise<ProviderSubscriptionHttpResponse> {
    const existing = await this.dependencies.bindings.findBySubscriptionId(
      subscription.id,
    );
    if (!existing) {
      return errorResponse(404, "SUBSCRIPTION_PROVIDER_NOT_FOUND", correlation);
    }
    if (!bindingOwnedBy(existing, authorization)) {
      return errorResponse(403, "BUSINESS_ACCESS_DENIED", correlation);
    }
    if (
      (action === "pause" || action === "resume") &&
      subscription.status !== "active"
    ) {
      return errorResponse(409, "SUBSCRIPTION_NOT_ACTIVE", correlation);
    }
    if (action === "cancel" && subscription.status === "past_due") {
      return errorResponse(
        409,
        "SUBSCRIPTION_CANCELLATION_CONFLICT",
        correlation,
      );
    }

    const now = canonicalNow(this.dependencies.clock);
    let canonicalSubscription = subscription;
    if (action === "cancel" && subscription.status === "active") {
      const scheduled = scheduleSubscriptionCancellation({
        subscription,
        requestedAt: now,
      });
      if (!scheduled) {
        throw new Error("SUBSCRIPTION_CANCELLATION_INVALID");
      }
      canonicalSubscription =
        await this.dependencies.subscriptions.save(scheduled);
    }

    const rawSnapshot = await this.executeTransition(
      action,
      existing.providerSubscriptionReference,
    );
    const snapshot = normalizeProviderSubscriptionSnapshot(rawSnapshot);
    if (
      !snapshot ||
      !snapshotMatchesSubscription(snapshot, canonicalSubscription) ||
      !snapshotMatchesBinding(snapshot, existing)
    ) {
      throw new Error("SUBSCRIPTION_PROVIDER_READBACK_MISMATCH");
    }

    const expectedStatus =
      action === "pause"
        ? "paused"
        : action === "resume"
          ? "authorized"
          : "cancelled";
    if (snapshot.status !== expectedStatus) {
      throw new Error("SUBSCRIPTION_PROVIDER_STATUS_MISMATCH");
    }

    const persisted = await this.dependencies.bindings.saveReadback(
      snapshot,
      now,
      authorization.tenantId,
    );
    await this.recordSuccess(
      action,
      "authoritative_readback",
      canonicalSubscription,
      authorization,
      correlation,
    );
    return response(
      200,
      { data: projection(persisted, canonicalSubscription, false) },
      correlation,
    );
  }

  private async executeTransition(
    action: "pause" | "resume" | "cancel",
    reference: string,
  ): Promise<ProviderSubscriptionSnapshot> {
    switch (action) {
      case "pause":
        return this.dependencies.provider.pauseSubscription(reference);
      case "resume":
        return this.dependencies.provider.resumeSubscription(reference);
      case "cancel":
        return this.dependencies.provider.cancelSubscription(reference);
    }
  }

  private async recordSuccess(
    action: "create" | "read" | "pause" | "resume" | "cancel",
    reason: string,
    subscription: Subscription,
    authorization: ProviderSubscriptionAuthorizedContext,
    correlation: string,
  ): Promise<void> {
    await audit(this.dependencies.audit, {
      action: `subscription.provider.${action}`,
      result: "success",
      reason,
      correlationId: correlation,
      subscriptionId: subscription.id,
      actorSubject: authorization.actorSubject,
      tenantId: authorization.tenantId,
    });
  }
}
