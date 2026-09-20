import { describe, expect, it, vi } from "vitest";

import {
  createNotificationDispatcher,
  createNotificationRequest,
  notificationTemplates,
  notificationTopicForTemplate,
  type NotificationIdempotencyPort,
  type NotificationPreferencePort,
  type NotificationProvider,
} from "./index.js";

const validRequest = createNotificationRequest({
  id: "notification-001",
  idempotencyKey: "ticket:order-001:user-001",
  destinationId: "morro-de-sao-paulo",
  recipientReference: "user:user-001",
  locale: "pt-BR",
  template: "ticket_confirmation",
  channel: "email",
  variables: {
    ticketReference: "ticket-001",
    experienceName: "Volta à Ilha",
  },
  requestedAt: "2026-09-20T10:00:00.000Z",
});

if (!validRequest) throw new Error("Notification fixture must be valid.");

function allowPreferences(allowed = true): NotificationPreferencePort {
  return {
    isAllowed: vi.fn(async () => allowed),
  };
}

function idempotency(claimed = true): NotificationIdempotencyPort & {
  claim: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    claim: vi.fn(async () => claimed),
    release: vi.fn(async () => undefined),
  };
}

describe("notification request", () => {
  it("maps the six canonical templates to notification topics", () => {
    expect(notificationTemplates.map(notificationTopicForTemplate)).toEqual([
      "ticket",
      "reservation",
      "tour",
      "payment",
      "cancellation",
      "refund",
    ]);
  });

  it("keeps recipient delivery addresses outside the domain request", () => {
    expect(
      createNotificationRequest({
        ...validRequest,
        recipientReference: "guest@example.com",
      }),
    ).toBeNull();
  });

  it("rejects nested template variables", () => {
    expect(
      createNotificationRequest({
        ...validRequest,
        variables: { unsafe: { nested: true } },
      }),
    ).toBeNull();
  });
});

describe("notification dispatcher", () => {
  it("suppresses delivery before claiming idempotency when preferences opt out", async () => {
    const claims = idempotency();
    const provider: NotificationProvider = {
      name: "primary",
      channels: ["email"],
      send: vi.fn(async () => ({ providerMessageId: "message-1" })),
    };
    const dispatcher = createNotificationDispatcher({
      preferences: allowPreferences(false),
      idempotency: claims,
      providers: [provider],
    });

    await expect(dispatcher.dispatch(validRequest)).resolves.toEqual({
      status: "suppressed",
      reason: "preference",
    });
    expect(claims.claim).not.toHaveBeenCalled();
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("does not send an already claimed notification", async () => {
    const provider: NotificationProvider = {
      name: "primary",
      channels: ["email"],
      send: vi.fn(async () => ({ providerMessageId: "message-1" })),
    };
    const dispatcher = createNotificationDispatcher({
      preferences: allowPreferences(),
      idempotency: idempotency(false),
      providers: [provider],
    });

    await expect(dispatcher.dispatch(validRequest)).resolves.toEqual({
      status: "duplicate",
    });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("falls back to the next provider for the requested channel", async () => {
    const claims = idempotency();
    const primary: NotificationProvider = {
      name: "primary",
      channels: ["email"],
      send: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    };
    const fallback: NotificationProvider = {
      name: "fallback",
      channels: ["email"],
      send: vi.fn(async () => ({ providerMessageId: "message-2" })),
    };
    const unrelated: NotificationProvider = {
      name: "push-only",
      channels: ["push"],
      send: vi.fn(async () => ({ providerMessageId: "message-3" })),
    };
    const dispatcher = createNotificationDispatcher({
      preferences: allowPreferences(),
      idempotency: claims,
      providers: [primary, unrelated, fallback],
    });

    await expect(dispatcher.dispatch(validRequest)).resolves.toEqual({
      status: "sent",
      provider: "fallback",
      providerMessageId: "message-2",
    });
    expect(primary.send).toHaveBeenCalledOnce();
    expect(unrelated.send).not.toHaveBeenCalled();
    expect(fallback.send).toHaveBeenCalledOnce();
    expect(claims.release).not.toHaveBeenCalled();
  });

  it("releases the claim when every provider fails so a later retry is possible", async () => {
    const claims = idempotency();
    const provider: NotificationProvider = {
      name: "primary",
      channels: ["email"],
      send: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    };
    const dispatcher = createNotificationDispatcher({
      preferences: allowPreferences(),
      idempotency: claims,
      providers: [provider],
    });

    await expect(dispatcher.dispatch(validRequest)).resolves.toEqual({
      status: "failed",
      reason: "providers_failed",
      attemptedProviders: ["primary"],
    });
    expect(claims.release).toHaveBeenCalledWith(validRequest.idempotencyKey);
  });

  it("fails closed and releases the claim when no provider supports the channel", async () => {
    const claims = idempotency();
    const dispatcher = createNotificationDispatcher({
      preferences: allowPreferences(),
      idempotency: claims,
      providers: [],
    });

    await expect(dispatcher.dispatch(validRequest)).resolves.toEqual({
      status: "failed",
      reason: "no_provider",
      attemptedProviders: [],
    });
    expect(claims.release).toHaveBeenCalledWith(validRequest.idempotencyKey);
  });
});
