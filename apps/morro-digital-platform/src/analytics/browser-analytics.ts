import {
  createAnalyticsCollector,
  createSameOriginAnalyticsTransport,
  type AnalyticsCollector,
  type AnalyticsConsentState,
  type AnalyticsContext,
  type AnalyticsEventName,
} from "@touristic/analytics";

export const ANALYTICS_CONSENT_STORAGE_KEY = "morro-analytics-consent-v1";
export const ANALYTICS_SESSION_STORAGE_KEY = "morro-analytics-session-v1";
export const ANALYTICS_CONSENT_CHANGED_EVENT =
  "morro:analytics-consent-changed";

export const ANALYTICS_TRANSACTION_EVENTS = Object.freeze({
  offerSelected: "morro:commerce-offer-selected",
  reservationStarted: "morro:reservation-started",
  checkoutStarted: "morro:checkout-started",
  paymentApproved: "morro:payment-approved",
  ticketIssued: "morro:ticket-issued",
} as const);

interface BrowserAnalyticsController {
  getConsent(): AnalyticsConsentState;
  setConsent(state: Exclude<AnalyticsConsentState, "unknown">): void;
  destroy(): void;
}

interface MorroAnalyticsGlobal {
  __MORRO_ANALYTICS__?: BrowserAnalyticsController;
}

interface AnalyticsEventDetail {
  readonly [key: string]: unknown;
}

interface ExploreTourSnapshot {
  readonly tourId?: unknown;
  readonly stage?: unknown;
  readonly currentStopIndex?: unknown;
  readonly totalStops?: unknown;
}

interface ExploreStateSnapshot {
  readonly category?: unknown;
  readonly place?: unknown;
  readonly stage?: unknown;
  readonly markerCount?: unknown;
  readonly tour?: ExploreTourSnapshot | null;
}

export interface BrowserAnalyticsInstrumentationOptions {
  readonly document: Document;
  readonly collector: AnalyticsCollector;
  readonly context: AnalyticsContext;
  readonly now?: () => number;
}

export interface InstallMorroBrowserAnalyticsOptions {
  readonly document: Document;
  readonly window: Window;
  readonly fetcher?: typeof fetch;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Analytics consent/session storage must never block the product runtime.
  }
}

export function readBrowserAnalyticsConsent(
  storage: Storage,
): AnalyticsConsentState {
  const value = readStorage(storage, ANALYTICS_CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : "unknown";
}

export function writeBrowserAnalyticsConsent(
  document: Document,
  storage: Storage,
  state: Exclude<AnalyticsConsentState, "unknown">,
): void {
  writeStorage(storage, ANALYTICS_CONSENT_STORAGE_KEY, state);
  document.dispatchEvent(
    new CustomEvent(ANALYTICS_CONSENT_CHANGED_EVENT, {
      detail: Object.freeze({ state }),
    }),
  );
}

function createSessionId(window: Window): string {
  const existing = readStorage(
    window.sessionStorage,
    ANALYTICS_SESSION_STORAGE_KEY,
  )?.trim();
  if (existing) return existing;

  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `session-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
  writeStorage(window.sessionStorage, ANALYTICS_SESSION_STORAGE_KEY, generated);
  return generated;
}

function eventDetail(event: Event): AnalyticsEventDetail | null {
  if (!(event instanceof CustomEvent)) return null;
  if (!event.detail || typeof event.detail !== "object") return null;
  return event.detail as AnalyticsEventDetail;
}

function safeText(value: unknown, maxLength = 160): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
    ? value
    : undefined;
}

function normalizedPlaceId(value: unknown): string | undefined {
  const text = safeText(value);
  if (!text) return undefined;
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || undefined;
}

function commerceAttributes(
  detail: AnalyticsEventDetail,
): Readonly<Record<string, unknown>> {
  const value = safeText(detail.value, 240);
  const placeId = normalizedPlaceId(detail.place);
  const attributes: Record<string, unknown> = {
    surface: "assistant",
  };

  if (placeId) attributes.placeId = placeId;

  if (value?.startsWith("commerce:offer:")) {
    const offerId = safeText(value.slice("commerce:offer:".length), 160);
    if (offerId) attributes.offerId = offerId;
  } else if (value?.startsWith("commerce:place:")) {
    const explicitPlaceId = safeText(value.slice("commerce:place:".length), 160);
    if (explicitPlaceId) attributes.placeId = explicitPlaceId;
  }

  return Object.freeze(attributes);
}

function transactionAttributes(
  name: AnalyticsEventName,
  detail: AnalyticsEventDetail,
): Readonly<Record<string, unknown>> {
  const attributes: Record<string, unknown> = {};

  const placeId = safeText(detail.placeId);
  const offerId = safeText(detail.offerId);
  const orderId = safeText(detail.orderId);
  const currency = safeText(detail.currency, 16);
  const paymentMethod = safeText(detail.paymentMethod, 80);
  const ticketType = safeText(detail.ticketType, 80);
  const quantity = safeCount(detail.quantity);
  const itemCount = safeCount(detail.itemCount);
  const ticketCount = safeCount(detail.ticketCount);

  if (placeId) attributes.placeId = placeId;
  if (offerId) attributes.offerId = offerId;
  if (orderId) attributes.orderId = orderId;
  if (currency) attributes.currency = currency;
  if (paymentMethod) attributes.paymentMethod = paymentMethod;
  if (ticketType) attributes.ticketType = ticketType;
  if (quantity !== undefined) attributes.quantity = quantity;
  if (itemCount !== undefined) attributes.itemCount = itemCount;
  if (ticketCount !== undefined) attributes.ticketCount = ticketCount;

  if (name === "reservation_started" && quantity === undefined) {
    attributes.quantity = 1;
  }

  return Object.freeze(attributes);
}

export function installBrowserAnalyticsInstrumentation(
  options: BrowserAnalyticsInstrumentationOptions,
): Readonly<{ destroy(): void }> {
  const now = options.now ?? Date.now;
  const listeners: Array<readonly [string, EventListener]> = [];
  let lastCategory: string | null = null;
  let lastPlace: string | null = null;
  let activeTourId: string | null = null;
  let activeTourStartedAt: number | null = null;
  let completedTourId: string | null = null;
  let sessionSent = false;

  const track = (
    name: AnalyticsEventName,
    attributes?: Readonly<Record<string, unknown>>,
  ): void => {
    void options.collector
      .track({
        name,
        context: options.context,
        ...(attributes ? { attributes } : {}),
      })
      .catch(() => undefined);
  };

  const trackSessionStarted = (): void => {
    if (sessionSent) return;
    void options.collector
      .track({
        name: "session_started",
        context: options.context,
      })
      .then((result) => {
        if (result.status === "sent") sessionSent = true;
      })
      .catch(() => undefined);
  };

  const listen = (name: string, listener: EventListener): void => {
    options.document.addEventListener(name, listener);
    listeners.push([name, listener]);
  };

  trackSessionStarted();

  listen(ANALYTICS_CONSENT_CHANGED_EVENT, (event) => {
    const detail = eventDetail(event);
    if (detail?.state === "granted") trackSessionStarted();
  });

  listen("morro:assistant-input-submitted", (event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    const message = safeText(detail.message, 4_000);
    if (!message) return;

    const navigationBanner = options.document.getElementById(
      "instruction-banner",
    );

    track("assistant_query", {
      queryLength: message.length,
      inputMode: safeText(detail.source, 40) ?? "unknown",
      hasPlaceContext: Boolean(
        options.document.getElementById("map")?.dataset.explorePlace,
      ),
      hasNavigationContext: Boolean(
        navigationBanner && !navigationBanner.classList.contains("hidden"),
      ),
    });
  });

  listen("morro:navigation-requested", () => {
    track("directions_started");
  });

  listen("morro:commerce-cta-activated", (event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    track("commerce_clicked", commerceAttributes(detail));
  });

  listen("morro:explore-state-changed", (event) => {
    const detail = eventDetail(event) as ExploreStateSnapshot | null;
    if (!detail) return;

    const category = safeText(detail.category);
    const stage = safeText(detail.stage);
    const place = safeText(detail.place);
    const markerCount = safeCount(detail.markerCount);

    if (category && stage !== "menu" && category !== lastCategory) {
      lastCategory = category;
      track("category_viewed", {
        categoryId: category,
        ...(markerCount !== undefined ? { resultCount: markerCount } : {}),
      });
    }

    if (stage === "detail" && place) {
      const placeId = normalizedPlaceId(place);
      if (placeId && placeId !== lastPlace) {
        lastPlace = placeId;
        track("place_viewed", {
          placeId,
          ...(category ? { categoryId: category } : {}),
        });
      }
    } else if (stage !== "detail") {
      lastPlace = null;
    }

    const tour = detail.tour;
    const tourId = safeText(tour?.tourId);
    const tourStage = safeText(tour?.stage);
    const totalStops = safeCount(tour?.totalStops);

    if (tourId && tourStage === "intro" && activeTourId !== tourId) {
      activeTourId = tourId;
      activeTourStartedAt = now();
      completedTourId = null;
      track("tour_started", {
        tourId,
        ...(totalStops !== undefined ? { stopCount: totalStops } : {}),
      });
    }

    if (
      tourId &&
      tourStage === "finale" &&
      completedTourId !== tourId
    ) {
      completedTourId = tourId;
      const durationSeconds =
        activeTourStartedAt === null
          ? undefined
          : Math.max(0, Math.round((now() - activeTourStartedAt) / 1_000));
      track("tour_completed", {
        tourId,
        ...(totalStops !== undefined ? { completedStops: totalStops } : {}),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      });
    }

    if (!tourId) {
      activeTourId = null;
      activeTourStartedAt = null;
    }
  });

  const transactionEventMap: Readonly<
    Record<string, AnalyticsEventName>
  > = Object.freeze({
    [ANALYTICS_TRANSACTION_EVENTS.offerSelected]: "offer_selected",
    [ANALYTICS_TRANSACTION_EVENTS.reservationStarted]: "reservation_started",
    [ANALYTICS_TRANSACTION_EVENTS.checkoutStarted]: "checkout_started",
    [ANALYTICS_TRANSACTION_EVENTS.paymentApproved]: "payment_approved",
    [ANALYTICS_TRANSACTION_EVENTS.ticketIssued]: "ticket_issued",
  });

  for (const [eventName, analyticsName] of Object.entries(
    transactionEventMap,
  )) {
    listen(eventName, (event) => {
      const detail = eventDetail(event);
      if (!detail) return;
      track(analyticsName, transactionAttributes(analyticsName, detail));
    });
  }

  return Object.freeze({
    destroy(): void {
      for (const [name, listener] of listeners) {
        options.document.removeEventListener(name, listener);
      }
    },
  });
}

export function installMorroBrowserAnalytics(
  options: InstallMorroBrowserAnalyticsOptions,
): BrowserAnalyticsController {
  const fetcher = options.fetcher ?? options.window.fetch.bind(options.window);
  const context: AnalyticsContext = Object.freeze({
    sessionId: createSessionId(options.window),
    destinationId: "morro-de-sao-paulo",
    locale: options.document.documentElement.lang || "pt",
    source: "browser",
  });
  const collector = createAnalyticsCollector({
    transport: createSameOriginAnalyticsTransport(fetcher),
    getConsent: () => readBrowserAnalyticsConsent(options.window.localStorage),
  });
  const instrumentation = installBrowserAnalyticsInstrumentation({
    document: options.document,
    collector,
    context,
  });

  const controller: BrowserAnalyticsController = Object.freeze({
    getConsent(): AnalyticsConsentState {
      return readBrowserAnalyticsConsent(options.window.localStorage);
    },
    setConsent(state: Exclude<AnalyticsConsentState, "unknown">): void {
      writeBrowserAnalyticsConsent(
        options.document,
        options.window.localStorage,
        state,
      );
    },
    destroy(): void {
      instrumentation.destroy();
    },
  });

  const global = globalThis as typeof globalThis & MorroAnalyticsGlobal;
  global.__MORRO_ANALYTICS__ = controller;
  return controller;
}
