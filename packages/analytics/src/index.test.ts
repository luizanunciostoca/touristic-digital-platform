import { describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  createAnalyticsCollector,
  createAnalyticsEvent,
  sanitizeAnalyticsAttributes,
  type AnalyticsEvent,
} from "./index.js";

describe("analytics taxonomy", () => {
  it("keeps the required product funnel events canonical", () => {
    expect(ANALYTICS_EVENT_NAMES).toEqual([
      "session_started",
      "category_viewed",
      "place_viewed",
      "search_submitted",
      "assistant_query",
      "directions_started",
      "tour_started",
      "tour_completed",
      "commerce_clicked",
      "offer_selected",
      "reservation_started",
      "checkout_started",
      "payment_approved",
      "ticket_issued",
    ]);
  });
});

describe("analytics privacy boundary", () => {
  it("retains only allowlisted primitives", () => {
    expect(
      sanitizeAnalyticsAttributes("search_submitted", {
        queryLength: 17,
        resultCount: 4,
        filterCount: 2,
        unrecognized: "ignored",
      }),
    ).toEqual({ queryLength: 17, resultCount: 4, filterCount: 2 });
  });

  it("rejects raw search and assistant text keys", () => {
    expect(
      sanitizeAnalyticsAttributes("search_submitted", {
        query: "praia tranquila",
        queryLength: 16,
      }),
    ).toBeNull();
    expect(
      sanitizeAnalyticsAttributes("assistant_query", {
        message: "onde comer sushi?",
        queryLength: 17,
      }),
    ).toBeNull();
  });

  it("rejects nested or unbounded attribute values", () => {
    expect(
      sanitizeAnalyticsAttributes("place_viewed", {
        placeId: { raw: "place-1" },
      }),
    ).toBeNull();
    expect(
      sanitizeAnalyticsAttributes("place_viewed", {
        placeId: "x".repeat(241),
      }),
    ).toBeNull();
  });
});

describe("analytics collector", () => {
  it("does not collect before explicit consent", async () => {
    const send = vi.fn<(event: AnalyticsEvent) => Promise<void>>();
    const collector = createAnalyticsCollector({
      transport: { send },
      getConsent: () => "unknown",
    });

    await expect(
      collector.track({
        name: "session_started",
        context: { sessionId: "session-1" },
      }),
    ).resolves.toEqual({
      status: "dropped",
      reason: "consent_not_granted",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("emits a sanitized versioned event after consent", async () => {
    const sent: AnalyticsEvent[] = [];
    const collector = createAnalyticsCollector({
      transport: { send: (event) => void sent.push(event) },
      getConsent: () => "granted",
      createEventId: () => "event-1",
      now: () => new Date("2026-09-20T09:00:00.000Z"),
    });

    const result = await collector.track({
      name: "assistant_query",
      context: {
        sessionId: "session-1",
        destinationId: "morro-de-sao-paulo",
        locale: "pt-BR",
        source: "assistant",
      },
      attributes: {
        queryLength: 18,
        inputMode: "text",
        hasPlaceContext: true,
        hasNavigationContext: false,
        ignored: "not persisted",
      },
    });

    expect(result.status).toBe("sent");
    expect(sent).toEqual([
      {
        schemaVersion: "1",
        eventId: "event-1",
        name: "assistant_query",
        occurredAt: "2026-09-20T09:00:00.000Z",
        sessionId: "session-1",
        destinationId: "morro-de-sao-paulo",
        locale: "pt-BR",
        source: "assistant",
        attributes: {
          queryLength: 18,
          inputMode: "text",
          hasPlaceContext: true,
          hasNavigationContext: false,
        },
      },
    ]);
  });
});

describe("analytics envelope", () => {
  it("rejects empty session identifiers", () => {
    expect(
      createAnalyticsEvent(
        {
          name: "place_viewed",
          context: { sessionId: "   " },
          attributes: { placeId: "place-1" },
        },
        { eventId: "event-1", occurredAt: "2026-09-20T09:00:00.000Z" },
      ),
    ).toBeNull();
  });
});
