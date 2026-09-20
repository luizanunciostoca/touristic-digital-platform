import { describe, expect, it, vi } from "vitest";

import type {
  AnalyticsCollector,
  AnalyticsEventInput,
  AnalyticsTrackResult,
} from "@touristic/analytics";

import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_TRANSACTION_EVENTS,
  installBrowserAnalyticsInstrumentation,
  readBrowserAnalyticsConsent,
  writeBrowserAnalyticsConsent,
} from "./browser-analytics.js";

function collectorHarness() {
  const inputs: AnalyticsEventInput[] = [];
  const collector: AnalyticsCollector = {
    async track(input): Promise<AnalyticsTrackResult> {
      inputs.push(input);
      return {
        status: "sent",
        event: {
          schemaVersion: "1",
          eventId: `event-${inputs.length}`,
          name: input.name,
          occurredAt: "2026-09-20T10:00:00.000Z",
          sessionId: input.context.sessionId,
          attributes: {},
        },
      };
    },
  };
  return { collector, inputs };
}

function dispatch(document: Document, name: string, detail: unknown): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("browser analytics consent", () => {
  it("defaults to unknown and persists only explicit decisions", () => {
    const local = storage();
    expect(readBrowserAnalyticsConsent(local)).toBe("unknown");

    const document = new EventTarget() as unknown as Document;
    const listener = vi.fn();
    document.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, listener);

    writeBrowserAnalyticsConsent(document, local, "granted");

    expect(readBrowserAnalyticsConsent(local)).toBe("granted");
    expect(listener).toHaveBeenCalledOnce();
  });
});

describe("browser analytics instrumentation", () => {
  it("never forwards Assistant message text", async () => {
    const { collector, inputs } = collectorHarness();
    const document = new EventTarget() as unknown as Document;
    Object.defineProperty(document, "getElementById", {
      value: () => null,
    });

    installBrowserAnalyticsInstrumentation({
      document,
      collector,
      context: { sessionId: "session-1" },
    });

    dispatch(document, "morro:assistant-input-submitted", {
      message: "onde comer sushi?",
      source: "keyboard",
    });

    await Promise.resolve();

    const query = inputs.find((input) => input.name === "assistant_query");
    expect(query?.attributes).toEqual({
      queryLength: 17,
      inputMode: "keyboard",
      hasPlaceContext: false,
      hasNavigationContext: false,
    });
    expect(JSON.stringify(query)).not.toContain("sushi");
  });

  it(
    "deduplicates category/place views and tracks tour completion duration",
    async () => {
      const { collector, inputs } = collectorHarness();
      const document = new EventTarget() as unknown as Document;
      let now = 1_000;

      installBrowserAnalyticsInstrumentation({
        document,
        collector,
        context: { sessionId: "session-2" },
        now: () => now,
      });

      const base = {
        category: "beaches",
        markerCount: 4,
        tour: null,
      };

      dispatch(document, "morro:explore-state-changed", {
        ...base,
        stage: "places",
        place: null,
      });
      dispatch(document, "morro:explore-state-changed", {
        ...base,
        stage: "detail",
        place: "Segunda Praia",
      });
      dispatch(document, "morro:explore-state-changed", {
        ...base,
        stage: "detail",
        place: "Segunda Praia",
      });
      dispatch(document, "morro:explore-state-changed", {
        category: "tours",
        stage: "tour",
        place: null,
        markerCount: 5,
        tour: {
          tourId: "volta-a-ilha",
          stage: "intro",
          currentStopIndex: 0,
          totalStops: 5,
        },
      });
      now = 11_000;
      dispatch(document, "morro:explore-state-changed", {
        category: "tours",
        stage: "tour",
        place: null,
        markerCount: 5,
        tour: {
          tourId: "volta-a-ilha",
          stage: "finale",
          currentStopIndex: 4,
          totalStops: 5,
        },
      });

      await Promise.resolve();

      expect(
        inputs.filter((input) => input.name === "category_viewed"),
      ).toHaveLength(2);
      expect(inputs.filter((input) => input.name === "place_viewed")).toEqual([
        expect.objectContaining({
          attributes: {
            placeId: "segunda-praia",
            categoryId: "beaches",
          },
        }),
      ]);
      expect(
        inputs.find((input) => input.name === "tour_started")?.attributes,
      ).toEqual({
        tourId: "volta-a-ilha",
        stopCount: 5,
      });
      expect(
        inputs.find((input) => input.name === "tour_completed")?.attributes,
      ).toEqual({
        tourId: "volta-a-ilha",
        completedStops: 5,
        durationSeconds: 10,
      });
    },
  );

  it(
    "maps commerce and transaction milestones without payment amounts",
    async () => {
      const { collector, inputs } = collectorHarness();
      const document = new EventTarget() as unknown as Document;

      installBrowserAnalyticsInstrumentation({
        document,
        collector,
        context: { sessionId: "session-3" },
      });

      dispatch(document, "morro:commerce-cta-activated", {
        value: "commerce:offer:offer-001",
        place: "Segunda Praia",
        url: "/tickets.html?offer=offer-001",
      });
      dispatch(document, ANALYTICS_TRANSACTION_EVENTS.checkoutStarted, {
        orderId: "order-001",
        itemCount: 2,
        currency: "BRL",
        amount: 31800,
      });
      dispatch(document, ANALYTICS_TRANSACTION_EVENTS.paymentApproved, {
        orderId: "order-001",
        paymentMethod: "pix",
        currency: "BRL",
        card: "4111111111111111",
      });

      await Promise.resolve();

      expect(
        inputs.find((input) => input.name === "commerce_clicked")?.attributes,
      ).toEqual({
        surface: "assistant",
        placeId: "segunda-praia",
        offerId: "offer-001",
      });
      expect(
        inputs.find((input) => input.name === "checkout_started")?.attributes,
      ).toEqual({
        orderId: "order-001",
        itemCount: 2,
        currency: "BRL",
      });
      expect(
        inputs.find((input) => input.name === "payment_approved")?.attributes,
      ).toEqual({
        orderId: "order-001",
        currency: "BRL",
        paymentMethod: "pix",
      });
      expect(JSON.stringify(inputs)).not.toContain("4111111111111111");
      expect(JSON.stringify(inputs)).not.toContain("31800");
    },
  );
});
