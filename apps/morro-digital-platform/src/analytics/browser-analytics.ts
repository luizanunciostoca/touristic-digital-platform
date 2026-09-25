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

export const ANALYTICS_SEARCH_SUBMITTED_EVENT = "morro:search-submitted";

export const ANALYTICS_TRANSACTION_EVENTS = Object.freeze({
  offerSelected: "morro:commerce-offer-selected",
  reservationStarted: "morro:reservation-started",
  checkoutStarted: "morro:checkout-started",
  paymentApproved: "morro:payment-approved",
  ticketIssued: "morro:ticket-issued",
} as const);

export interface BrowserAnalyticsController {
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
  readonly source?: unknown;
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
    const explicitPlaceId = safeText(
      value.slice("commerce:place:".length),
      160,
    );
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

  listen(ANALYTICS_SEARCH_SUBMITTED_EVENT, (event) => {
    const detail = eventDetail(event);
    if (!detail) return;

    const queryLength = safeCount(detail.queryLength);
    const resultCount = safeCount(detail.resultCount);
    const filterCount = safeCount(detail.filterCount);
    if (queryLength === undefined) return;

    track("search_submitted", {
      queryLength,
      ...(resultCount !== undefined ? { resultCount } : {}),
      ...(filterCount !== undefined ? { filterCount } : {}),
    });
  });

  listen("morro:assistant-input-submitted", (event) => {
    const detail = eventDetail(event);
    if (!detail) return;
    const message = safeText(detail.message, 4_000);
    if (!message) return;

    const navigationBanner =
      options.document.getElementById("instruction-banner");

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
    const sourceCandidate = safeText(detail.source, 40);
    const discoverySource =
      sourceCandidate === "canonical" ||
      sourceCandidate === "local" ||
      sourceCandidate === "mapbox" ||
      sourceCandidate === "legacy"
        ? sourceCandidate
        : undefined;
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
          ...(discoverySource ? { discoverySource } : {}),
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

    if (tourId && tourStage === "finale" && completedTourId !== tourId) {
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

  const transactionEventMap: Readonly<Record<string, AnalyticsEventName>> =
    Object.freeze({
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

export type BrowserAnalyticsConsentChoice =
  Exclude<AnalyticsConsentState, "unknown"> | "later";

export interface BrowserAnalyticsConsentPreferencesOptions {
  readonly document: Document;
  readonly controller: BrowserAnalyticsController;
}

export interface BrowserAnalyticsConsentPreferencesController {
  open(): void;
  destroy(): void;
}

interface AnalyticsConsentPreferenceCopy {
  readonly manage: string;
  readonly title: string;
  readonly description: string;
  readonly allow: string;
  readonly deny: string;
  readonly later: string;
  readonly granted: string;
  readonly denied: string;
  readonly unknown: string;
}

const analyticsConsentPreferenceCopy = Object.freeze({
  pt: Object.freeze({
    manage: "Privacidade",
    title: "Preferências de privacidade",
    description:
      "Analytics opcionais ajudam a entender o uso do Morro Digital sem enviar o texto das suas buscas, mensagens do Assistente, dados de pagamento ou outros dados pessoais. Você pode escolher agora ou continuar sem analytics.",
    allow: "Permitir analytics",
    deny: "Somente necessários",
    later: "Agora não",
    granted: "Analytics opcionais permitidos.",
    denied: "Somente recursos necessários estão ativos.",
    unknown: "Analytics opcionais continuam desativados até você escolher.",
  }),
  en: Object.freeze({
    manage: "Privacy",
    title: "Privacy preferences",
    description:
      "Optional analytics help us understand how Morro Digital is used without sending your search text, Assistant messages, payment data, or other personal data. You can choose now or continue without analytics.",
    allow: "Allow analytics",
    deny: "Necessary only",
    later: "Not now",
    granted: "Optional analytics are allowed.",
    denied: "Only necessary features are active.",
    unknown: "Optional analytics remain disabled until you choose.",
  }),
  es: Object.freeze({
    manage: "Privacidad",
    title: "Preferencias de privacidad",
    description:
      "Los analytics opcionales ayudan a entender el uso de Morro Digital sin enviar el texto de tus búsquedas, mensajes del Asistente, datos de pago u otros datos personales. Puedes elegir ahora o continuar sin analytics.",
    allow: "Permitir analytics",
    deny: "Solo necesarios",
    later: "Ahora no",
    granted: "Los analytics opcionales están permitidos.",
    denied: "Solo están activos los recursos necesarios.",
    unknown: "Los analytics opcionales siguen desactivados hasta que elijas.",
  }),
  he: Object.freeze({
    manage: "פרטיות",
    title: "העדפות פרטיות",
    description:
      "ניתוח שימוש אופציונלי עוזר לנו להבין כיצד משתמשים ב-Morro Digital בלי לשלוח את טקסט החיפוש, הודעות העוזר, נתוני תשלום או מידע אישי אחר. אפשר לבחור עכשיו או להמשיך ללא Analytics.",
    allow: "אפשר Analytics",
    deny: "הכרחי בלבד",
    later: "לא עכשיו",
    granted: "Analytics אופציונלי מאופשר.",
    denied: "רק תכונות הכרחיות פעילות.",
    unknown: "Analytics אופציונלי נשאר מושבת עד לבחירה.",
  }),
} satisfies Readonly<
  Record<"pt" | "en" | "es" | "he", AnalyticsConsentPreferenceCopy>
>);

export function browserAnalyticsConsentPreferenceCopy(
  locale: string,
): AnalyticsConsentPreferenceCopy {
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith("en")) return analyticsConsentPreferenceCopy.en;
  if (normalized.startsWith("es")) return analyticsConsentPreferenceCopy.es;
  if (normalized.startsWith("he") || normalized.startsWith("iw")) {
    return analyticsConsentPreferenceCopy.he;
  }
  return analyticsConsentPreferenceCopy.pt;
}

export function applyBrowserAnalyticsConsentChoice(
  controller: BrowserAnalyticsController,
  choice: BrowserAnalyticsConsentChoice,
): AnalyticsConsentState {
  if (choice === "later") return controller.getConsent();
  controller.setConsent(choice);
  return choice;
}

export function installBrowserAnalyticsConsentPreferences(
  options: BrowserAnalyticsConsentPreferencesOptions,
): BrowserAnalyticsConsentPreferencesController {
  const { document, controller } = options;
  document
    .querySelector<HTMLElement>("[data-morro-analytics-consent-preferences]")
    ?.remove();

  const root = document.createElement("section");
  root.className = "analytics-consent-preferences";
  root.setAttribute("data-morro-analytics-consent-preferences", "true");
  root.setAttribute("aria-live", "polite");
  document.body.append(root);

  let expanded = false;

  const localizedCopy = (): AnalyticsConsentPreferenceCopy =>
    browserAnalyticsConsentPreferenceCopy(
      document.documentElement.lang || "pt",
    );

  const createButton = (
    label: string,
    variant: "choice" | "later" | "trigger",
  ): HTMLButtonElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "analytics-consent-button analytics-consent-" + variant;
    button.textContent = label;
    return button;
  };

  const render = (): void => {
    const copy = localizedCopy();
    const state = controller.getConsent();
    root.replaceChildren();
    root.dataset.consentState = state;
    root.classList.toggle("is-collapsed", !expanded);

    if (!expanded) {
      root.removeAttribute("role");
      root.removeAttribute("aria-labelledby");
      root.removeAttribute("aria-describedby");

      const trigger = createButton(copy.manage, "trigger");
      trigger.setAttribute("aria-haspopup", "dialog");
      const status =
        state === "granted"
          ? copy.granted
          : state === "denied"
            ? copy.denied
            : copy.unknown;
      trigger.setAttribute("aria-label", copy.manage + ". " + status);
      trigger.addEventListener("click", () => {
        expanded = true;
        render();
      });
      root.append(trigger);
      return;
    }

    root.setAttribute("role", "dialog");
    root.setAttribute("aria-labelledby", "analytics-consent-title");
    root.setAttribute(
      "aria-describedby",
      "analytics-consent-description analytics-consent-status",
    );

    const title = document.createElement("h2");
    title.id = "analytics-consent-title";
    title.textContent = copy.title;

    const description = document.createElement("p");
    description.id = "analytics-consent-description";
    description.textContent = copy.description;

    const status = document.createElement("p");
    status.id = "analytics-consent-status";
    status.className = "analytics-consent-status";
    status.textContent =
      state === "granted"
        ? copy.granted
        : state === "denied"
          ? copy.denied
          : copy.unknown;

    const actions = document.createElement("div");
    actions.className = "analytics-consent-actions";

    const deny = createButton(copy.deny, "choice");
    deny.setAttribute("aria-pressed", String(state === "denied"));
    deny.addEventListener("click", () => {
      applyBrowserAnalyticsConsentChoice(controller, "denied");
    });

    const allow = createButton(copy.allow, "choice");
    allow.setAttribute("aria-pressed", String(state === "granted"));
    allow.addEventListener("click", () => {
      applyBrowserAnalyticsConsentChoice(controller, "granted");
    });

    const later = createButton(copy.later, "later");
    later.addEventListener("click", () => {
      applyBrowserAnalyticsConsentChoice(controller, "later");
      expanded = false;
      render();
    });

    actions.append(deny, allow, later);
    root.append(title, description, status, actions);
  };

  const onConsentChanged = (): void => {
    expanded = false;
    render();
  };
  document.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);

  const localeObserver = new MutationObserver(render);
  localeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  render();

  return Object.freeze({
    open(): void {
      expanded = true;
      render();
    },
    destroy(): void {
      localeObserver.disconnect();
      document.removeEventListener(
        ANALYTICS_CONSENT_CHANGED_EVENT,
        onConsentChanged,
      );
      root.remove();
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
