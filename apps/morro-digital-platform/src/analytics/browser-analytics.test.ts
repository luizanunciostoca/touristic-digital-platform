import { describe, expect, it, vi } from "vitest";

import type {
  AnalyticsCollector,
  AnalyticsEvent,
  AnalyticsEventInput,
  AnalyticsTrackResult,
} from "@touristic/analytics";

import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_SEARCH_SUBMITTED_EVENT,
  ANALYTICS_TRANSACTION_EVENTS,
  applyBrowserAnalyticsConsentChoice,
  browserAnalyticsConsentPreferenceCopy,
  installBrowserAnalyticsInstrumentation,
  installMorroBrowserAnalytics,
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

function installedBrowserHarness(consent: "granted" | "unknown" = "granted") {
  const document = Object.assign(new EventTarget(), {
    documentElement: { lang: "pt-BR" },
    getElementById: () => null,
  }) as unknown as Document;
  const localStorage = storage();
  if (consent === "granted") {
    writeBrowserAnalyticsConsent(document, localStorage, "granted");
  }
  const events: AnalyticsEvent[] = [];
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    if (typeof init?.body !== "string") {
      throw new TypeError("Analytics request body must be JSON text");
    }
    events.push(JSON.parse(init.body) as AnalyticsEvent);
    return { ok: true } as Response;
  });
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "__MORRO_ANALYTICS__",
  );
  const controller = installMorroBrowserAnalytics({
    document,
    window: {
      localStorage,
      sessionStorage: storage(),
      crypto: { randomUUID: () => "session-live-locale" },
    } as unknown as Window,
    fetcher,
  });
  return {
    document,
    events,
    controller,
    cleanup() {
      controller.destroy();
      if (original) {
        Object.defineProperty(globalThis, "__MORRO_ANALYTICS__", original);
      } else {
        Reflect.deleteProperty(globalThis, "__MORRO_ANALYTICS__");
      }
    },
  };
}

describe("browser analytics live locale", () => {
  it("emits the current locale after a language switch", () => {
    const h = installedBrowserHarness();
    try {
      expect(h.events[0]?.locale).toBe("pt-BR");
      const firstPayload = JSON.stringify(h.events[0]);
      for (const locale of ["en", "es", "he"]) {
        h.document.documentElement.lang = locale;
        dispatch(h.document, ANALYTICS_SEARCH_SUBMITTED_EVENT, {
          queryLength: 3,
        });
        expect(h.events.at(-1)).toMatchObject({
          name: "search_submitted",
          locale,
          sessionId: "session-live-locale",
          destinationId: "morro-de-sao-paulo",
          source: "browser",
        });
      }
      expect(h.events).toHaveLength(4);
      expect(JSON.stringify(h.events[0])).toBe(firstPayload);
    } finally {
      h.cleanup();
    }
  });

  it("uses current locale for delayed session consent and honors denial and destroy", async () => {
    const h = installedBrowserHarness("unknown");
    try {
      expect(h.events).toHaveLength(0);
      h.document.documentElement.lang = "he";
      dispatch(h.document, "morro:navigation-requested", {});
      expect(h.events).toHaveLength(0);
      h.controller.setConsent("granted");
      expect(h.events).toHaveLength(1);
      expect(h.events[0]).toMatchObject({
        name: "session_started",
        locale: "he",
        sessionId: "session-live-locale",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      h.controller.setConsent("denied");
      h.document.documentElement.lang = "es";
      dispatch(h.document, "morro:navigation-requested", {});
      expect(h.events).toHaveLength(1);

      h.controller.setConsent("granted");
      dispatch(h.document, "morro:navigation-requested", {});
      expect(h.events).toHaveLength(2);
      expect(h.events[1]).toMatchObject({
        name: "directions_started",
        locale: "es",
      });
      expect(
        h.events.filter((event) => event.name === "session_started"),
      ).toHaveLength(1);

      h.controller.destroy();
      h.document.documentElement.lang = "en";
      dispatch(h.document, "morro:navigation-requested", {});
      h.controller.setConsent("granted");
      expect(h.events).toHaveLength(2);
    } finally {
      h.cleanup();
    }
  });

  it("preserves the empty-language fallback and existing payload normalization", () => {
    const h = installedBrowserHarness();
    try {
      for (const [locale, expected] of [
        ["", "pt"],
        [" en-US ", "en-US"],
        ["   ", undefined],
      ] as const) {
        h.document.documentElement.lang = locale;
        dispatch(h.document, "morro:navigation-requested", {});
        expect(h.events.at(-1)?.locale).toBe(expected);
      }
      expect(h.events).toHaveLength(4);
    } finally {
      h.cleanup();
    }
  });

  it("resolves fresh context for commercial milestones without changing their attributes", () => {
    const h = installedBrowserHarness();
    try {
      const milestones = [
        [ANALYTICS_TRANSACTION_EVENTS.offerSelected, "offer_selected"],
        [
          ANALYTICS_TRANSACTION_EVENTS.reservationStarted,
          "reservation_started",
        ],
        [ANALYTICS_TRANSACTION_EVENTS.checkoutStarted, "checkout_started"],
        [ANALYTICS_TRANSACTION_EVENTS.paymentApproved, "payment_approved"],
        [ANALYTICS_TRANSACTION_EVENTS.ticketIssued, "ticket_issued"],
      ] as const;
      for (const [eventName, name] of milestones) {
        h.document.documentElement.lang = "es";
        dispatch(h.document, eventName, { offerId: "offer-1" });
        expect(h.events.at(-1)).toMatchObject({ name, locale: "es" });
      }
      expect(h.events).toHaveLength(6);
    } finally {
      h.cleanup();
    }
  });

  it("contains context failures and recovers session and subsequent emissions", async () => {
    const { collector, inputs } = collectorHarness();
    const document = new EventTarget() as unknown as Document;
    let unavailable = true;
    const instrumentation = installBrowserAnalyticsInstrumentation({
      document,
      collector,
      context: { sessionId: "session-context-failure" },
      getContext: () => {
        if (unavailable) throw new Error("Context unavailable");
        return { sessionId: "session-context-failure", locale: "en" };
      },
    });
    try {
      dispatch(document, "morro:navigation-requested", {});
      expect(inputs).toHaveLength(0);
      unavailable = false;
      dispatch(document, ANALYTICS_CONSENT_CHANGED_EVENT, { state: "granted" });
      dispatch(document, "morro:navigation-requested", {});
      expect(inputs.map((input) => [input.name, input.context.locale])).toEqual(
        [
          ["session_started", "en"],
          ["directions_started", "en"],
        ],
      );
      await Promise.resolve();
      dispatch(document, ANALYTICS_CONSENT_CHANGED_EVENT, { state: "granted" });
      expect(inputs).toHaveLength(2);
    } finally {
      instrumentation.destroy();
    }
  });
});

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
  it("never forwards raw search text", async () => {
    const { collector, inputs } = collectorHarness();
    const document = new EventTarget() as unknown as Document;

    installBrowserAnalyticsInstrumentation({
      document,
      collector,
      context: { sessionId: "session-search" },
    });

    dispatch(document, ANALYTICS_SEARCH_SUBMITTED_EVENT, {
      query: "praia tranquila",
      queryLength: 16,
      resultCount: 4,
      filterCount: 2,
    });

    await Promise.resolve();

    const search = inputs.find((input) => input.name === "search_submitted");
    expect(search?.attributes).toEqual({
      queryLength: 16,
      resultCount: 4,
      filterCount: 2,
    });
    expect(JSON.stringify(search)).not.toContain("praia tranquila");
  });

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

  it("deduplicates category/place views and tracks tour completion duration", async () => {
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
      source: "canonical",
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
          discoverySource: "canonical",
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
  });

  it("maps commerce and transaction milestones without payment amounts", async () => {
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
  });
});

describe("browser analytics consent preferences", () => {
  it("commits granted/denied only after an explicit choice", () => {
    const setConsent = vi.fn();
    const controller = {
      getConsent: () => "unknown" as const,
      setConsent,
      destroy: vi.fn(),
    };

    expect(applyBrowserAnalyticsConsentChoice(controller, "later")).toBe(
      "unknown",
    );
    expect(setConsent).not.toHaveBeenCalled();

    expect(applyBrowserAnalyticsConsentChoice(controller, "denied")).toBe(
      "denied",
    );
    expect(setConsent).toHaveBeenNthCalledWith(1, "denied");

    expect(applyBrowserAnalyticsConsentChoice(controller, "granted")).toBe(
      "granted",
    );
    expect(setConsent).toHaveBeenNthCalledWith(2, "granted");
  });

  it("localizes the end-user privacy choices without changing consent", () => {
    expect(browserAnalyticsConsentPreferenceCopy("pt-BR").deny).toBe(
      "Somente necessários",
    );
    expect(browserAnalyticsConsentPreferenceCopy("en-US").allow).toBe(
      "Allow analytics",
    );
    expect(browserAnalyticsConsentPreferenceCopy("es").later).toBe("Ahora no");
    expect(browserAnalyticsConsentPreferenceCopy("he-IL").deny).toBe(
      "הכרחי בלבד",
    );
    expect(browserAnalyticsConsentPreferenceCopy("iw").manage).toBe("פרטיות");
  });
});

describe("semantic explore analytics result counts", () => {
  it.each<[Record<string, unknown>, number | undefined]>([
    [{ markerCount: 5 }, 5],
    [{ markerCount: 5, locationCount: 8 }, 8],
    [{ markerCount: 5, locationCount: 0 }, 0],
    ...[undefined, null, NaN, -1, 1.5, "8"].map<
      [Record<string, unknown>, number | undefined]
    >((locationCount) => [{ markerCount: 5, locationCount }, undefined]),
  ])(
    "records only authoritative semantic counts: %j",
    async (counts, expected) => {
      const { collector, inputs } = collectorHarness();
      const document = new EventTarget() as unknown as Document;
      installBrowserAnalyticsInstrumentation({
        document,
        collector,
        context: { sessionId: "semantic" },
      });
      dispatch(document, "morro:explore-state-changed", {
        category: "beaches",
        stage: "places",
        ...counts,
      });
      await Promise.resolve();
      const attributes = inputs.find(
        (input) => input.name === "category_viewed",
      )?.attributes;
      expect(attributes).toBeDefined();
      if (expected === undefined)
        expect(attributes).not.toHaveProperty("resultCount");
      else expect(attributes?.resultCount).toBe(expected);
    },
  );
});
