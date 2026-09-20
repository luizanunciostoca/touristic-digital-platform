export const notificationTemplates = Object.freeze([
  "ticket_confirmation",
  "reservation_reminder",
  "tour_reminder",
  "payment_issue",
  "cancellation",
  "refund",
] as const);

export const notificationChannels = Object.freeze([
  "email",
  "push",
  "sms",
] as const);

export type NotificationTemplate = (typeof notificationTemplates)[number];
export type NotificationChannel = (typeof notificationChannels)[number];
export type NotificationTopic =
  | "ticket"
  | "reservation"
  | "tour"
  | "payment"
  | "cancellation"
  | "refund";
export type NotificationVariable = string | number | boolean | null;
export type NotificationVariables = Readonly<
  Record<string, NotificationVariable>
>;

export interface NotificationRequestInput {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly destinationId: string;
  readonly recipientReference: string;
  readonly locale: string;
  readonly template: NotificationTemplate;
  readonly channel: NotificationChannel;
  readonly variables?: Readonly<Record<string, unknown>>;
  readonly requestedAt: string;
}

export interface NotificationRequest {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly destinationId: string;
  readonly recipientReference: string;
  readonly locale: string;
  readonly template: NotificationTemplate;
  readonly topic: NotificationTopic;
  readonly channel: NotificationChannel;
  readonly variables: NotificationVariables;
  readonly requestedAt: string;
}

export interface NotificationPreferenceQuery {
  readonly destinationId: string;
  readonly recipientReference: string;
  readonly topic: NotificationTopic;
  readonly channel: NotificationChannel;
}

export interface NotificationPreferencePort {
  isAllowed(query: NotificationPreferenceQuery): Promise<boolean>;
}

export interface NotificationIdempotencyPort {
  claim(idempotencyKey: string): Promise<boolean>;
  release(idempotencyKey: string): Promise<void>;
}

export interface NotificationProviderReceipt {
  readonly providerMessageId: string;
}

export interface NotificationProvider {
  readonly name: string;
  readonly channels: readonly NotificationChannel[];
  send(request: NotificationRequest): Promise<NotificationProviderReceipt>;
}

export interface NotificationDispatcher {
  dispatch(request: NotificationRequest): Promise<NotificationDispatchResult>;
}

export type NotificationDispatchResult =
  | Readonly<{
      status: "sent";
      provider: string;
      providerMessageId: string;
    }>
  | Readonly<{ status: "suppressed"; reason: "preference" }>
  | Readonly<{ status: "duplicate" }>
  | Readonly<{
      status: "failed";
      reason: "no_provider" | "providers_failed";
      attemptedProviders: readonly string[];
    }>;

export interface CreateNotificationDispatcherOptions {
  readonly preferences: NotificationPreferencePort;
  readonly idempotency: NotificationIdempotencyPort;
  readonly providers: readonly NotificationProvider[];
}

const TEMPLATE_TOPICS: Readonly<
  Record<NotificationTemplate, NotificationTopic>
> = Object.freeze({
  ticket_confirmation: "ticket",
  reservation_reminder: "reservation",
  tour_reminder: "tour",
  payment_issue: "payment",
  cancellation: "cancellation",
  refund: "refund",
});

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,159}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$/u;
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;
const VARIABLE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/u;
const FORBIDDEN_VARIABLE_KEYS = Object.freeze([
  "email",
  "phone",
  "telephone",
  "cpf",
  "card",
  "token",
  "secret",
  "password",
]);

function isForbiddenVariableKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return FORBIDDEN_VARIABLE_KEYS.some((forbidden) =>
    normalized.includes(forbidden),
  );
}

function isIsoTimestamp(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isSafeVariable(value: unknown): value is NotificationVariable {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length <= 500;
}

function sanitizeVariables(
  variables: Readonly<Record<string, unknown>> | undefined,
): NotificationVariables | null {
  if (!variables) return Object.freeze({});

  const sanitized: Record<string, NotificationVariable> = {};
  for (const [key, value] of Object.entries(variables)) {
    if (
      !VARIABLE_KEY.test(key) ||
      isForbiddenVariableKey(key) ||
      !isSafeVariable(value)
    ) {
      return null;
    }
    sanitized[key] = value;
  }

  return Object.freeze(sanitized);
}

export function notificationTopicForTemplate(
  template: NotificationTemplate,
): NotificationTopic {
  return TEMPLATE_TOPICS[template];
}

export function createNotificationRequest(
  input: NotificationRequestInput,
): NotificationRequest | null {
  const id = input.id.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const destinationId = input.destinationId.trim();
  const recipientReference = input.recipientReference.trim();
  const locale = input.locale.trim();

  if (
    !IDENTIFIER.test(id) ||
    !IDEMPOTENCY_KEY.test(idempotencyKey) ||
    !IDENTIFIER.test(destinationId) ||
    !IDENTIFIER.test(recipientReference) ||
    !LOCALE.test(locale) ||
    !isIsoTimestamp(input.requestedAt)
  ) {
    return null;
  }

  const variables = sanitizeVariables(input.variables);
  if (!variables) return null;

  return Object.freeze({
    id,
    idempotencyKey,
    destinationId,
    recipientReference,
    locale,
    template: input.template,
    topic: notificationTopicForTemplate(input.template),
    channel: input.channel,
    variables,
    requestedAt: input.requestedAt,
  });
}

function assertProviderConfiguration(
  providers: readonly NotificationProvider[],
): void {
  const names = providers.map((provider) => provider.name.trim());
  if (names.some((name) => name.length === 0)) {
    throw new Error("Notification provider name is required.");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("Notification provider names must be unique.");
  }
}

function eligibleProviders(
  providers: readonly NotificationProvider[],
  channel: NotificationChannel,
): readonly NotificationProvider[] {
  return providers.filter((provider) => provider.channels.includes(channel));
}

export function createNotificationDispatcher(
  options: CreateNotificationDispatcherOptions,
): NotificationDispatcher {
  assertProviderConfiguration(options.providers);

  return Object.freeze({
    async dispatch(
      request: NotificationRequest,
    ): Promise<NotificationDispatchResult> {
      const allowed = await options.preferences.isAllowed({
        destinationId: request.destinationId,
        recipientReference: request.recipientReference,
        topic: request.topic,
        channel: request.channel,
      });

      if (!allowed) {
        return Object.freeze({
          status: "suppressed",
          reason: "preference",
        });
      }

      const claimed = await options.idempotency.claim(request.idempotencyKey);
      if (!claimed) return Object.freeze({ status: "duplicate" });

      const providers = eligibleProviders(options.providers, request.channel);
      const attemptedProviders: string[] = [];

      for (const provider of providers) {
        attemptedProviders.push(provider.name);
        try {
          const receipt = await provider.send(request);
          const providerMessageId = receipt.providerMessageId.trim();
          if (!providerMessageId) {
            throw new Error("Notification provider returned an empty receipt.");
          }
          return Object.freeze({
            status: "sent",
            provider: provider.name,
            providerMessageId,
          });
        } catch {
          continue;
        }
      }

      await options.idempotency.release(request.idempotencyKey);

      return Object.freeze({
        status: "failed",
        reason: providers.length === 0 ? "no_provider" : "providers_failed",
        attemptedProviders: Object.freeze(attemptedProviders),
      });
    },
  });
}
