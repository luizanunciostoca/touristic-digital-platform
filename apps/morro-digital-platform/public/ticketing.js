import {
  ANALYTICS_TRANSACTION_EVENTS,
  installBrowserAnalyticsConsentPreferences,
  installMorroBrowserAnalytics,
} from "/runtime/browser-analytics.js";
import { initializeMorroBrowserLocale } from "/runtime/browser-locale.js";
import {
  applyCommerceDocumentCopy,
  commerceIntlLocale,
  getTicketingPresentationCopy,
} from "/runtime/commerce-i18n.js";

const localeResolution = initializeMorroBrowserLocale({ document });
const presentationLocale = commerceIntlLocale(localeResolution.locale);
const copy = getTicketingPresentationCopy(presentationLocale);
applyCommerceDocumentCopy(document, "ticketing", presentationLocale);
const browserAnalytics = installMorroBrowserAnalytics({ document, window });
const privacyPreferences = installBrowserAnalyticsConsentPreferences({
  document,
  controller: browserAnalytics,
});

const state = {
  session: null,
  csrfToken: "",
  offers: [],
  selectedOffer: null,
  selectedDate: "",
  quote: null,
  quoteRequest: 0,
  submitting: false,
};

const checkoutStorageKey = "morro_ticketing_checkout_v1";
const pendingCheckoutStorageKey = "morro_ticketing_pending_checkout_v1";
const reservationAttemptStorageKey = "morro_ticketing_reservation_attempt_v1";
const analyticsMilestonesStorageKey = "morro_ticketing_analytics_v1";
const analyticsContextStorageKey = "morro_ticketing_analytics_context_v1";
const canonicalCheckoutPath = "/api/payments/v1/checkouts";
const commerceSessionPath = "/api/ticketing/v1/consumer-session";
const elements = {
  offers: document.querySelector("#offers"),
  dateSelector: document.querySelector("#date-selector"),
  reservations: document.querySelector("#reservations"),
  form: document.querySelector("#reservation-form"),
  inventoryId: document.querySelector("#inventory-id"),
  selectedOffer: document.querySelector("#selected-offer"),
  holderName: document.querySelector("#holder-name"),
  holderEmail: document.querySelector("#holder-email"),
  holderPhone: document.querySelector("#holder-phone"),
  holderDocument: document.querySelector("#holder-document"),
  quantity: document.querySelector("#quantity"),
  reserve: document.querySelector("#reserve-button"),
  message: document.querySelector("#reservation-message"),
  refresh: document.querySelector("#refresh-button"),
  sessionLabel: document.querySelector("#session-label"),
  dialog: document.querySelector("#ticket-dialog"),
  dialogClose: document.querySelector("#ticket-close"),
  ticketTitle: document.querySelector("#ticket-title"),
  ticketQr: document.querySelector("#ticket-qr"),
  ticketCode: document.querySelector("#ticket-code"),
  ticketMeta: document.querySelector("#ticket-meta"),
  hero: document.querySelector(".ticketing-hero-media"),
  heroTitle: document.querySelector("#ticketing-title"),
  productLead: document.querySelector("#product-lead"),
  productLocation: document.querySelector("#product-location"),
  productRating: document.querySelector("#product-rating"),
  productDuration: document.querySelector("#product-duration"),
  productAvailability: document.querySelector("#product-availability"),
  selectionSummary: document.querySelector("#selection-summary"),
  selectedSummaryTitle: document.querySelector("#selected-summary-title"),
  selectedSummaryMeta: document.querySelector("#selected-summary-meta"),
  summaryUnitPrice: document.querySelector("#summary-unit-price"),
  summaryQuantity: document.querySelector("#summary-quantity"),
  summarySubtotal: document.querySelector("#summary-subtotal"),
  quoteBadge: document.querySelector("#quote-badge"),
  quantityDecrease: document.querySelector("#quantity-decrease"),
  quantityIncrease: document.querySelector("#quantity-increase"),
  returnLink: document.querySelector("[data-ticketing-return]"),
  identityPanel: document.querySelector("#identity-panel"),
  privacySettings: document.querySelector("#privacy-settings-button"),
};

function readSessionJson(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeSessionJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Analytics context is best-effort and must never block Ticketing.
  }
}

function emitAnalyticsOnce(key, eventName, detail = {}) {
  const sent = readSessionJson(analyticsMilestonesStorageKey, {});
  if (!sent || typeof sent !== "object" || Array.isArray(sent) || sent[key])
    return;
  document.dispatchEvent(
    new CustomEvent(eventName, {
      detail: Object.freeze(detail),
    }),
  );
  sent[key] = true;
  writeSessionJson(analyticsMilestonesStorageKey, sent);
}

function rememberAnalyticsReservationContext(reservationId, context) {
  if (!reservationId) return;
  const stored = readSessionJson(analyticsContextStorageKey, {});
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return;
  stored[reservationId] = Object.freeze({
    orderId: text(context.orderId),
    currency: text(context.currency),
    ticketType: text(context.ticketType),
  });
  writeSessionJson(analyticsContextStorageKey, stored);
}

function analyticsReservationContext(reservationId) {
  const stored = readSessionJson(analyticsContextStorageKey, {});
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return null;
  const value = stored[reservationId];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function correlationId() {
  if (!globalThis.crypto?.randomUUID)
    throw new Error("BROWSER_CRYPTO_REQUIRED");
  return `browser:${globalThis.crypto.randomUUID()}`;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function money(value) {
  if (
    !value ||
    typeof value.minorUnits !== "number" ||
    typeof value.currency !== "string"
  )
    return "—";
  return new Intl.NumberFormat(presentationLocale, {
    style: "currency",
    currency: value.currency,
  }).format(value.minorUnits / 100);
}

function dateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(presentationLocale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bahia",
      }).format(date)
    : "—";
}

function productKindLabel(offer) {
  if (offer?.product?.kind === "tour") return copy.kindTour;
  if (offer?.product?.kind === "transport") return copy.kindTransport;
  return copy.kindExperience;
}

function destinationLabel(offer) {
  if (offer?.destinationId === "morro-de-sao-paulo")
    return "Morro de São Paulo";
  return text(offer?.destinationId).replaceAll("-", " ") || "Morro Digital";
}

function durationLabel(offer) {
  const start = Date.parse(offer?.startsAt || "");
  const end = Date.parse(offer?.endsAt || "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "";
  const minutes = Math.round((end - start) / 60000);
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours}h`;
  }
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  }
  return `${minutes} min`;
}

function heroImageFor(offer) {
  const reference = text(offer?.product?.reference).toLowerCase();
  if (reference.includes("toca-do-morcego"))
    return "/images/fotos/toca_do_morcego1.jpg";
  if (reference.includes("garapua") && reference.includes("4x4"))
    return "/images/fotos/passeio_4x4_garapua1.jpg";
  if (reference.includes("garapua"))
    return "/images/fotos/passeio_quadriciclo_garapua1.jpg";
  if (reference.includes("gamboa"))
    return "/images/fotos/passeio_barco_gamboa1.jpg";
  if (reference.includes("tinhare") || reference.includes("volta-a-ilha"))
    return "/images/fotos/passeio_lancha_ilha_tinhare1.jpg";
  return "/images/fotos/farol_do_morro1.jpg";
}

function friendlyError(error, fallback = copy.createReservationFailed) {
  const code = text(error?.message);
  if (code.includes("FEATURE_DISABLED") || code.includes("UNAVAILABLE") || error?.status === 503)
    return copy.ticketingUnavailable;
  if (code.includes("EXHAUSTED"))
    return copy.soldOut;
  if (code.includes("QUANTITY_LIMIT"))
    return copy.fillFields;
  if (code.includes("INVENTORY_UNAVAILABLE"))
    return copy.static.unavailable;
  if (code.includes("CURRENCY_MISMATCH"))
    return copy.static.currencyMismatch;
  if (code.includes("EXPIRED"))
    return copy.static.quoteExpired;
  if (error?.status === 409)
    return copy.static.priceChanged;
  if (error?.status === 400)
    return "Revise os dados da reserva e tente novamente.";
  return fallback;
}

function quoteIdentity(quote) {
  if (!quote) return "";
  return [
    quote.inventoryId,
    quote.quantity,
    quote.pricingVersion,
    quote.totalAmount?.minorUnits,
    quote.totalAmount?.currency,
  ].join(":");
}

function updatePurchaseSummary() {
  const quote = state.quote;
  const minimum = Math.max(1, Number(elements.quantity.min) || 1);
  const maximum = Math.max(minimum, Number(elements.quantity.max) || minimum);
  const quantity = Math.max(minimum, Number(elements.quantity.value) || minimum);
  elements.summaryQuantity.textContent = String(quantity);
  elements.summaryUnitPrice.textContent = quote ? money(quote.unitAmount) : "—";
  elements.summarySubtotal.textContent = quote ? money(quote.totalAmount) : "—";
  elements.quoteBadge.textContent = quote ? copy.static.quoteConfirmed : copy.static.confirmingValue;
  elements.quantityDecrease.disabled = quantity <= minimum;
  elements.quantityIncrease.disabled = quantity >= maximum;
}

async function refreshQuote({ announce = false } = {}) {
  const offer = state.selectedOffer;
  if (!offer) return null;
  const quantity = Number(elements.quantity.value);
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    state.quote = null;
    updatePurchaseSummary();
    elements.reserve.disabled = true;
    return null;
  }
  const requestId = ++state.quoteRequest;
  state.quote = null;
  elements.reserve.disabled = true;
  elements.reserve.textContent = copy.static.confirmingAvailability;
  updatePurchaseSummary();
  try {
    const payload = await api("/api/ticketing/v1/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inventoryId: offer.id, quantity }),
    });
    if (requestId !== state.quoteRequest || state.selectedOffer?.id !== offer.id)
      return null;
    const quote = payload.data;
    if (
      !quote ||
      quote.inventoryId !== offer.id ||
      quote.quantity !== quantity ||
      !quote.unitAmount ||
      !quote.totalAmount ||
      quote.unitAmount.currency !== quote.totalAmount.currency
    ) {
      throw new Error("QUOTE_RESPONSE_INVALID");
    }
    if (
      offer.unitAmount?.currency &&
      quote.unitAmount.currency !== offer.unitAmount.currency
    ) {
      throw new Error("QUOTE_CURRENCY_MISMATCH");
    }
    state.quote = quote;
    const maximum = Math.max(
      1,
      Math.min(Number(quote.maxPerReservation) || 1, Number(quote.availableQuantity) || 1),
    );
    elements.quantity.max = String(maximum);
    updatePurchaseSummary();
    const pendingCheckout = pendingCheckoutState();
    elements.reserve.disabled = state.submitting;
    elements.reserve.textContent = state.submitting
      ? copy.static.finalizing
      : pendingCheckout
        ? copy.static.resumePayment
        : copy.static.reserveAndPay;
    if (announce) setMessage(copy.static.priceUpdated);
    return quote;
  } catch (error) {
    if (requestId !== state.quoteRequest) return null;
    state.quote = null;
    updatePurchaseSummary();
    elements.reserve.disabled = true;
    elements.reserve.textContent = copy.static.reserveAndPay;
    setMessage(friendlyError(error), true);
    elements.refresh.hidden = false;
    return null;
  }
}

function updateProductPresentation(offer) {
  elements.heroTitle.textContent = offer.label || productKindLabel(offer);
  elements.productLead.textContent = `${productKindLabel(offer)} · ${dateTime(offer.startsAt)}`;
  elements.productLocation.textContent = destinationLabel(offer);
  const rating = Number(offer.rating ?? offer.product?.rating);
  elements.productRating.hidden = !Number.isFinite(rating) || rating <= 0;
  elements.productRating.textContent = elements.productRating.hidden
    ? ""
    : `★ ${rating.toFixed(1)}`;
  const duration = durationLabel(offer);
  elements.productDuration.hidden = !duration;
  elements.productDuration.textContent = duration;
  elements.productAvailability.hidden = false;
  elements.productAvailability.textContent = offer.sellable === false
    ? copy.static.unavailable
    : offer.availableQuantity > 0
      ? copy.availableCount(offer.availableQuantity)
      : copy.soldOut;
  elements.productAvailability.classList.toggle(
    "md-badge--success",
    offer.sellable !== false && offer.availableQuantity > 0,
  );
  elements.hero.style.setProperty(
    "--ticketing-hero-image",
    `url("${heroImageFor(offer)}")`,
  );
  elements.selectionSummary.hidden = false;
  elements.selectedSummaryTitle.textContent = offer.label;
  elements.selectedSummaryMeta.textContent = `${dateTime(offer.startsAt)} · ${destinationLabel(offer)}`;
  updatePurchaseSummary();
}

function productUnitLabel(product, quantity = 1) {
  const plural = Number(quantity) !== 1;
  if (product?.kind === "transport") {
    return plural ? copy.passPlural : copy.passSingular;
  }
  return plural ? copy.ticketPlural : copy.ticketSingular;
}

const offerIdPattern = /^[A-Za-z0-9_-]{3,120}$/u;
const placeSlugPattern = /^[a-z0-9][a-z0-9-]{2,119}$/u;

function placeSlug(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function requestedPlaceSlug() {
  const rawValue = new URLSearchParams(location.search).get("place");
  if (rawValue === null) return null;
  const value = rawValue.trim();
  return placeSlugPattern.test(value) ? value : "";
}

function offerMatchesPlace(offer, requestedPlace) {
  if (!requestedPlace) return true;
  const candidates = [
    offer?.label,
    offer?.destinationId,
    offer?.product?.reference,
  ]
    .map(placeSlug)
    .filter(Boolean);
  return candidates.some(
    (candidate) =>
      candidate === requestedPlace ||
      candidate.includes(`place-${requestedPlace}`) ||
      candidate.includes(requestedPlace),
  );
}

function requestedOfferIds() {
  const value = new URLSearchParams(location.search).get("offers");
  if (!value) return [];
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (
    ids.length === 0 ||
    ids.length > 20 ||
    ids.some((id) => !offerIdPattern.test(id))
  ) {
    return [];
  }
  return [...new Set(ids)];
}

async function json(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(text(payload?.error) || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function session() {
  const response = await fetch(commerceSessionPath, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId(),
    },
    body: "{}",
  });
  const payload = await json(response);
  if (!payload?.data?.subject || !payload?.data?.csrfToken) {
    throw new Error("COMMERCE_SESSION_INVALID");
  }
  state.session = payload.data;
  state.csrfToken = payload.data.csrfToken;
  elements.sessionLabel.textContent = copy.secureGuest;
  return payload.data;
}

async function api(path, init = {}, retry = true) {
  const method = text(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  headers.set("X-Correlation-ID", correlationId());
  if (method !== "GET" && method !== "HEAD") {
    headers.set("X-CSRF-Token", state.csrfToken);
  }
  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  if (retry && response.status === 401) {
    await session();
    return api(path, init, false);
  }
  if (retry && response.status === 403) {
    const payload = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (payload?.error === "INVALID_CSRF") {
      await session();
      return api(path, init, false);
    }
  }
  return json(response);
}

function setMessage(message, error = false) {
  elements.message.textContent = message;
  elements.message.classList.toggle("is-error", error);
}

function selectOffer(offer, { scroll = false } = {}) {
  state.selectedOffer = offer;
  state.quote = null;
  emitAnalyticsOnce(
    `offer:${offer.id}`,
    ANALYTICS_TRANSACTION_EVENTS.offerSelected,
    {
      offerId: offer.id,
      ...(requestedPlaceSlug() ? { placeId: requestedPlaceSlug() } : {}),
    },
  );
  elements.inventoryId.value = offer.id;
  elements.selectedOffer.value = `${offer.label} · ${money(offer.unitAmount)}`;
  elements.quantity.max = String(
    Math.min(offer.maxPerReservation, offer.availableQuantity),
  );
  if (Number(elements.quantity.value) > Number(elements.quantity.max))
    elements.quantity.value = "1";
  elements.reserve.disabled =
    offer.sellable === false || offer.availableQuantity < 1;
  elements.identityPanel.hidden = false;
  updateProductPresentation(offer);
  void refreshQuote();
  for (const card of elements.offers.querySelectorAll(".offer-card")) {
    card.classList.toggle("is-selected", card.dataset.inventoryId === offer.id);
  }
  if (scroll)
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createSkeletonLine(size = "medium") {
  const line = document.createElement("span");
  line.className = "md-skeleton ticketing-skeleton-line";
  line.dataset.size = size;
  line.setAttribute("aria-hidden", "true");
  return line;
}

function renderOfferSkeletons() {
  elements.offers.replaceChildren();
  elements.offers.setAttribute("aria-busy", "true");
  for (let index = 0; index < 3; index += 1) {
    const card = document.createElement("article");
    card.className = "md-card ticketing-skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.append(
      createSkeletonLine("short"),
      createSkeletonLine(),
      createSkeletonLine("medium"),
    );
    const action = document.createElement("span");
    action.className = "md-skeleton ticketing-skeleton-action";
    action.setAttribute("aria-hidden", "true");
    card.append(action);
    elements.offers.append(card);
  }
}

function renderReservationSkeletons() {
  elements.reservations.replaceChildren();
  elements.reservations.setAttribute("aria-busy", "true");
  for (let index = 0; index < 2; index += 1) {
    const card = document.createElement("article");
    card.className = "md-card ticketing-skeleton-card";
    card.setAttribute("aria-hidden", "true");
    card.append(
      createSkeletonLine("medium"),
      createSkeletonLine(),
      createSkeletonLine("short"),
    );
    elements.reservations.append(card);
  }
}

function dateKey(offer) {
  const value = new Date(offer?.startsAt || "");
  if (!Number.isFinite(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function dateLabel(key) {
  const value = new Date(`${key}T12:00:00-03:00`);
  return new Intl.DateTimeFormat(presentationLocale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(value);
}

function renderDateSelector() {
  const groups = new Map();
  for (const offer of state.offers) {
    const key = dateKey(offer);
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(offer);
    groups.set(key, group);
  }
  const keys = [...groups.keys()].sort();
  elements.dateSelector.replaceChildren();
  if (!keys.length) {
    state.selectedDate = "";
    elements.dateSelector.hidden = true;
    return;
  }
  elements.dateSelector.hidden = false;
  if (!state.selectedDate || !groups.has(state.selectedDate)) {
    state.selectedDate =
      keys.find((key) =>
        groups.get(key).some((offer) => offer.sellable !== false && offer.availableQuantity > 0),
      ) || keys[0];
  }
  for (const key of keys) {
    const offers = groups.get(key);
    const unavailable = offers.every((offer) => offer.sellable === false);
    const soldOut = !unavailable && offers.every((offer) => offer.availableQuantity < 1);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date-chip";
    button.dataset.date = key;
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(key === state.selectedDate));
    button.disabled = unavailable || soldOut;
    button.innerHTML =
      `<span>${dateLabel(key)}</span><small>${unavailable ? copy.static.unavailable : soldOut ? copy.soldOut : copy.static.available}</small>`;
    button.addEventListener("click", () => {
      state.selectedDate = key;
      const nextOffer =
        offers.find(
          (offer) => offer.sellable !== false && offer.availableQuantity > 0,
        ) || offers[0];
      if (nextOffer) selectOffer(nextOffer);
      renderDateSelector();
      renderOffers();
    });
    elements.dateSelector.append(button);
  }
}

function renderOffers() {
  elements.offers.replaceChildren();
  elements.offers.removeAttribute("aria-busy");
  const visibleOffers = state.selectedDate
    ? state.offers.filter((offer) => dateKey(offer) === state.selectedDate)
    : state.offers;
  if (visibleOffers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = copy.noOffers;
    elements.offers.append(empty);
    return;
  }
  for (const offer of visibleOffers) {
    const card = document.createElement("article");
    card.className = "offer-card md-card";
    card.dataset.inventoryId = offer.id;

    const content = document.createElement("div");
    const kind = document.createElement("span");
    kind.className = "offer-kind md-badge";
    kind.textContent = productKindLabel(offer);
    const title = document.createElement("h3");
    title.textContent = offer.label;
    const when = document.createElement("p");
    when.textContent = dateTime(offer.startsAt);
    const price = document.createElement("p");
    price.className = "offer-price";
    price.textContent = copy.pricePer(
      money(offer.unitAmount),
      productUnitLabel(offer.product),
    );
    const availability = document.createElement("p");
    availability.className = "availability md-badge";
    availability.classList.toggle(
      "md-badge--success",
      offer.sellable !== false && offer.availableQuantity > 0,
    );
    availability.textContent = offer.sellable === false
      ? copy.static.unavailable
      : offer.availableQuantity > 0
        ? copy.availableCount(offer.availableQuantity)
        : copy.soldOut;
    content.append(kind, title, when, price, availability);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const detail = document.createElement("a");
    detail.className = "button button-secondary md-button md-button--secondary";
    detail.href = `/experience.html?id=${encodeURIComponent(offer.id)}`;
    detail.textContent = copy.details;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary md-button md-button--primary";
    button.disabled = offer.sellable === false || offer.availableQuantity < 1;
    button.textContent =
      offer.sellable === false
        ? copy.static.unavailable
        : offer.availableQuantity > 0
          ? copy.reserve
          : copy.soldOut;
    button.addEventListener("click", () =>
      selectOffer(offer, { scroll: true }),
    );
    actions.append(detail, button);
    card.append(content, actions);
    elements.offers.append(card);
  }
}

async function loadOffers() {
  const payload = await api("/api/ticketing/v1/inventory");
  const inventory = Array.isArray(payload.data) ? payload.data : [];
  const requestedOffers = requestedOfferIds();
  const requestedPlace = requestedPlaceSlug();
  state.offers =
    requestedOffers.length > 0
      ? inventory.filter((entry) => requestedOffers.includes(entry.id))
      : requestedPlace === null
        ? inventory
        : requestedPlace
          ? inventory.filter((entry) =>
              offerMatchesPlace(entry, requestedPlace),
            )
          : [];
  renderDateSelector();
  renderOffers();

  if (state.offers.length === 0) {
    state.selectedOffer = null;
    state.quote = null;
    elements.selectionSummary.hidden = true;
    elements.identityPanel.hidden = true;
    elements.productRating.hidden = true;
    elements.productDuration.hidden = true;
    elements.productAvailability.hidden = true;
    elements.heroTitle.textContent = copy.static.emptyTitle;
    elements.productLead.textContent = copy.static.emptyHelp;
    elements.reserve.disabled = true;
    updatePurchaseSummary();
    return;
  }

  const requestedOffer = new URLSearchParams(location.search).get("offer");
  if (requestedOffer && offerIdPattern.test(requestedOffer)) {
    const offer = state.offers.find((entry) => entry.id === requestedOffer);
    if (offer) selectOffer(offer);
  } else if (requestedPlace && state.offers.length === 1) {
    selectOffer(state.offers[0]);
  } else if (state.offers.length > 0) {
    const firstOffer =
      state.offers.find(
        (entry) => entry.sellable !== false && entry.availableQuantity > 0,
      ) || state.offers[0];
    selectOffer(firstOffer);
  }
}

function statusLabel(status) {
  return copy.status[status] || status;
}

async function showTicket(reservation) {
  const payload = await api(
    `/api/ticketing/v1/reservations/${encodeURIComponent(reservation.id)}/ticket`,
  );
  const ticket = payload.data;
  if (!ticket?.qrSvg || !ticket?.code)
    throw new Error("TICKET_RESPONSE_INVALID");
  elements.ticketTitle.textContent =
    reservation.product?.reference ||
    (reservation.product?.kind === "transport"
      ? copy.yourPass
      : copy.yourTicket);
  elements.ticketQr.replaceChildren();
  const template = document.createElement("template");
  template.innerHTML = ticket.qrSvg;
  const svg = template.content.querySelector("svg");
  if (!svg || template.content.children.length !== 1)
    throw new Error("TICKET_QR_INVALID");
  elements.ticketQr.append(svg);
  elements.ticketCode.textContent = ticket.code;
  const validity = ticket.validUntil
    ? ` · ${copy.validThrough(dateTime(ticket.validUntil))}`
    : "";
  elements.ticketMeta.textContent = `${ticket.quantity} ${productUnitLabel(
    reservation.product,
    ticket.quantity,
  )} · ${money(ticket.amount)} · ${copy.issuedAt(dateTime(ticket.issuedAt))}${validity}`;

  const analyticsContext = analyticsReservationContext(reservation.id);
  if (analyticsContext?.orderId) {
    emitAnalyticsOnce(
      `ticket:${reservation.id}`,
      ANALYTICS_TRANSACTION_EVENTS.ticketIssued,
      {
        orderId: analyticsContext.orderId,
        ticketCount: Number(ticket.quantity) || 1,
        ...(analyticsContext.ticketType
          ? { ticketType: analyticsContext.ticketType }
          : {}),
      },
    );
  }

  elements.dialog.showModal();
}

async function cancelReservation(reservation) {
  if (reservation.status !== "held") return;
  await api(
    `/api/ticketing/v1/reservations/${encodeURIComponent(reservation.id)}/cancel`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  await Promise.all([loadOffers(), loadReservations()]);
}

function renderReservations(reservations) {
  elements.reservations.replaceChildren();
  elements.reservations.removeAttribute("aria-busy");
  if (reservations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = copy.noReservations;
    elements.reservations.append(empty);
    return;
  }
  for (const reservation of reservations) {
    const card = document.createElement("article");
    card.className = "reservation-card md-card";
    const content = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent =
      reservation.product?.reference || reservation.inventoryId;
    const detail = document.createElement("p");
    detail.textContent = `${reservation.quantity} ${productUnitLabel(
      reservation.product,
      reservation.quantity,
    )} · ${copy.each(money(reservation.unitAmount))}`;
    const expiry = document.createElement("p");
    expiry.textContent =
      reservation.status === "held"
        ? copy.validUntil(dateTime(reservation.expiresAt))
        : reservation.status === "confirmed" && reservation.validUntil
          ? copy.validUntil(dateTime(reservation.validUntil))
          : copy.createdAt(dateTime(reservation.createdAt));
    const status = document.createElement("span");
    status.className = `status md-badge status-${reservation.status}`;
    status.textContent = statusLabel(reservation.status);
    content.append(title, detail, expiry, status);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (reservation.status === "confirmed") {
      const ticket = document.createElement("button");
      ticket.type = "button";
      ticket.className = "button button-primary md-button md-button--primary";
      ticket.textContent =
        reservation.product?.kind === "transport"
          ? copy.viewPass
          : copy.viewTicket;
      ticket.addEventListener(
        "click",
        () =>
          void showTicket(reservation).catch((error) => {
            setMessage(
              error.message ||
                (reservation.product?.kind === "transport"
                  ? copy.passUnavailable
                  : copy.ticketUnavailable),
              true,
            );
          }),
      );
      actions.append(ticket);
    }
    if (reservation.status === "held") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className =
        "button button-secondary md-button md-button--secondary";
      cancel.textContent = copy.cancelReservation;
      cancel.addEventListener(
        "click",
        () =>
          void cancelReservation(reservation).catch((error) => {
            setMessage(error.message || copy.cancelFailed, true);
          }),
      );
      actions.append(cancel);
    }
    card.append(content, actions);
    elements.reservations.append(card);
  }
}

async function loadReservations() {
  const payload = await api("/api/ticketing/v1/reservations");
  const reservations = Array.isArray(payload.data) ? payload.data : [];
  renderReservations(reservations);
  return reservations;
}

function checkoutState() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(checkoutStorageKey) || "null",
    );
    if (!value?.checkoutId || !value?.statusToken || !value?.reservationId)
      return null;
    return value;
  } catch {
    return null;
  }
}

function saveCheckout(value) {
  sessionStorage.setItem(checkoutStorageKey, JSON.stringify(value));
}

function clearCheckout() {
  sessionStorage.removeItem(checkoutStorageKey);
}

function pendingCheckoutState() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(pendingCheckoutStorageKey) || "null",
    );
    if (
      !value?.reservation?.id ||
      !value?.checkout?.reservationReference ||
      value.checkout.reservationReference !== value.reservation.id
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function savePendingCheckout(value) {
  sessionStorage.setItem(pendingCheckoutStorageKey, JSON.stringify(value));
}

function clearPendingCheckout() {
  sessionStorage.removeItem(pendingCheckoutStorageKey);
}

function reservationAttemptReference(inventoryId, quantity) {
  const fingerprint = `${inventoryId}:${quantity}`;
  try {
    const current = JSON.parse(
      sessionStorage.getItem(reservationAttemptStorageKey) || "null",
    );
    if (
      current?.fingerprint === fingerprint &&
      typeof current.reference === "string" &&
      current.reference.startsWith("web_")
    ) {
      return current.reference;
    }
  } catch {
    // A corrupt retry hint must never become transaction authority.
  }
  const reference = `web_${crypto.randomUUID().replaceAll("-", "")}`;
  sessionStorage.setItem(
    reservationAttemptStorageKey,
    JSON.stringify({ fingerprint, reference }),
  );
  return reference;
}

function clearReservationAttempt() {
  sessionStorage.removeItem(reservationAttemptStorageKey);
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForTicket(reservationId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const reservations = await loadReservations();
    const reservation = reservations.find(
      (entry) => entry.id === reservationId,
    );
    if (reservation?.status === "confirmed") {
      try {
        await showTicket(reservation);
        return;
      } catch (error) {
        if (error?.status !== 404 && error?.status !== 409) throw error;
      }
    }
    await wait(500);
  }
  setMessage(copy.paymentConfirmedFinalizing);
}

async function resumeCheckout() {
  const active = checkoutState();
  if (!active) return;
  if (
    active.statusExpiresAt &&
    Date.parse(active.statusExpiresAt) <= Date.now()
  ) {
    clearCheckout();
    return;
  }
  setMessage(copy.checkingPayment);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(
      `/api/payments/v1/checkouts/${encodeURIComponent(active.checkoutId)}`,
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "X-Checkout-Token": active.statusToken,
          "X-Correlation-ID": correlationId(),
        },
      },
    );
    const payload = await json(response);
    const status = payload.data?.status;
    if (
      status === "CONFIRMED" &&
      payload.data?.verifiedPayment?.verified === true
    ) {
      emitAnalyticsOnce(
        `payment:${active.checkoutId}`,
        ANALYTICS_TRANSACTION_EVENTS.paymentApproved,
        {
          orderId: active.checkoutId,
          ...(active.currency ? { currency: active.currency } : {}),
        },
      );
      clearCheckout();
      setMessage(copy.paymentConfirmedIssuing);
      await waitForTicket(active.reservationId);
      return;
    }
    if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(status)) {
      clearCheckout();
      setMessage(copy.paymentNotCompleted, true);
      await loadReservations();
      return;
    }
    await wait(2_500);
  }
  setMessage(copy.confirmationPending);
}

async function createCheckout(reservationPayload) {
  const descriptor = reservationPayload.checkout;
  if (
    descriptor?.path !== canonicalCheckoutPath ||
    !descriptor?.idempotencyKey ||
    !descriptor?.handoffToken ||
    !descriptor?.handoff ||
    descriptor.handoff.reservationReference !== descriptor.reservationReference
  )
    throw new Error("CHECKOUT_HANDOFF_INVALID");

  const response = await fetch(canonicalCheckoutPath, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId(),
      "X-Checkout-Handoff-Token": descriptor.handoffToken,
      "Idempotency-Key": descriptor.idempotencyKey,
    },
    body: JSON.stringify(descriptor.handoff),
  });
  const payload = await json(response);
  const checkout = payload.data;
  if (
    !checkout?.checkoutId ||
    !checkout?.statusToken ||
    !checkout?.statusExpiresAt
  ) {
    throw new Error("CHECKOUT_RESPONSE_INVALID");
  }
  const currency = text(checkout.plan?.amount?.currency);
  const reservation = reservationPayload.reservation;
  const ticketType = text(reservation?.product?.kind);
  clearPendingCheckout();
  saveCheckout({
    checkoutId: checkout.checkoutId,
    statusToken: checkout.statusToken,
    statusExpiresAt: checkout.statusExpiresAt,
    reservationId: descriptor.reservationReference,
    currency,
  });
  rememberAnalyticsReservationContext(descriptor.reservationReference, {
    orderId: checkout.checkoutId,
    currency,
    ticketType,
  });
  emitAnalyticsOnce(
    `checkout:${checkout.checkoutId}`,
    ANALYTICS_TRANSACTION_EVENTS.checkoutStarted,
    {
      orderId: checkout.checkoutId,
      itemCount: Number(reservation?.quantity) || 1,
      ...(currency ? { currency } : {}),
    },
  );
  if (checkout.checkoutUrl) {
    location.assign(checkout.checkoutUrl);
    return;
  }
  await resumeCheckout();
}

async function submitReservation(event) {
  event.preventDefault();
  if (state.submitting) return;

  const resumableCheckout = pendingCheckoutState();
  if (resumableCheckout) {
    state.submitting = true;
    elements.reserve.disabled = true;
    elements.reserve.textContent = copy.static.resumingPayment;
    setMessage(copy.static.resumingPayment);
    try {
      await createCheckout(resumableCheckout);
    } catch (error) {
      setMessage(
        friendlyError(
          error,
          copy.static.retryPaymentPreserved,
        ),
        true,
      );
    } finally {
      state.submitting = false;
      const stillPending = pendingCheckoutState();
      elements.reserve.textContent = stillPending
        ? copy.static.resumePayment
        : copy.static.reserveAndPay;
      elements.reserve.disabled = stillPending ? false : !state.quote;
    }
    return;
  }

  if (!state.selectedOffer) {
    setMessage(copy.selectExperienceFirst, true);
    return;
  }
  const holder = {
    name: elements.holderName.value.trim(),
    email: elements.holderEmail.value.trim().toLowerCase(),
    phone: elements.holderPhone.value.trim() || null,
    document: elements.holderDocument.value.trim() || null,
  };
  const quantity = Number(elements.quantity.value);
  if (
    !holder.name ||
    !holder.email ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  ) {
    setMessage(copy.fillFields, true);
    return;
  }

  state.submitting = true;
  elements.reserve.disabled = true;
  elements.reserve.textContent = copy.static.finalizing;
  setMessage(copy.creatingReservation);
  try {
    const previousQuote = quoteIdentity(state.quote);
    const freshQuote = await refreshQuote();
    if (!freshQuote) return;
    if (previousQuote && previousQuote !== quoteIdentity(freshQuote)) {
      setMessage(
        copy.static.priceChanged,
        true,
      );
      return;
    }
    if (
      freshQuote.expiresAt &&
      Date.parse(freshQuote.expiresAt) <= Date.now()
    ) {
      setMessage(
        copy.static.quoteExpired,
        true,
      );
      return;
    }
    elements.reserve.disabled = true;
    elements.reserve.textContent = copy.static.finalizing;
    const reference = reservationAttemptReference(
      state.selectedOffer.id,
      quantity,
    );
    const payload = await api("/api/ticketing/v1/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": reference,
      },
      body: JSON.stringify({
        inventoryId: state.selectedOffer.id,
        quantity,
        holder,
        returnUrl: `${location.origin}/tickets.html`,
      }),
    });
    if (!payload.data?.reservation || !payload.data?.checkout)
      throw new Error("RESERVATION_RESPONSE_INVALID");
    clearReservationAttempt();
    savePendingCheckout(payload.data);
    emitAnalyticsOnce(
      `reservation:${payload.data.reservation.id}`,
      ANALYTICS_TRANSACTION_EVENTS.reservationStarted,
      {
        offerId: state.selectedOffer.id,
        quantity,
        ...(requestedPlaceSlug() ? { placeId: requestedPlaceSlug() } : {}),
      },
    );
    setMessage(copy.reservationCreated);
    await createCheckout(payload.data);
  } catch (error) {
    setMessage(friendlyError(error, copy.createReservationFailed), true);
    await Promise.allSettled([loadOffers(), loadReservations()]);
  } finally {
    state.submitting = false;
    const pendingCheckout = pendingCheckoutState();
    elements.reserve.textContent = pendingCheckout
      ? copy.static.resumePayment
      : copy.static.reserveAndPay;
    elements.reserve.disabled = !state.quote && !pendingCheckout;
  }
}

elements.form.addEventListener(
  "submit",
  (event) => void submitReservation(event),
);
elements.privacySettings?.addEventListener("click", () => {
  privacyPreferences.open();
});

elements.refresh.addEventListener("click", () => {
  elements.refresh.hidden = true;
  setMessage(copy.static.updatingAvailability);
  void Promise.all([loadOffers(), loadReservations()])
    .then(() => {
      setMessage("");
      if (state.selectedOffer) void refreshQuote({ announce: true });
    })
    .catch((error) => {
      elements.refresh.hidden = false;
      setMessage(friendlyError(error, copy.updateFailed), true);
    });
});
elements.dialogClose.addEventListener("click", () => elements.dialog.close());

function changeQuantity(delta) {
  if (!state.selectedOffer) return;
  const min = Math.max(1, Number(elements.quantity.min) || 1);
  const max = Math.max(min, Number(elements.quantity.max) || min);
  const current = Math.min(
    max,
    Math.max(min, Number(elements.quantity.value) || min),
  );
  elements.quantity.value = String(
    Math.min(max, Math.max(min, current + delta)),
  );
  state.quote = null;
  updatePurchaseSummary();
  void refreshQuote();
}

elements.quantityDecrease.addEventListener("click", () => changeQuantity(-1));
elements.quantityIncrease.addEventListener("click", () => changeQuantity(1));
elements.quantity.addEventListener("input", () => {
  state.quote = null;
  updatePurchaseSummary();
  void refreshQuote();
});

elements.returnLink.addEventListener("click", (event) => {
  if (history.length <= 1 || !document.referrer) return;
  try {
    const previous = new URL(document.referrer);
    if (previous.origin !== location.origin) return;
    event.preventDefault();
    history.back();
  } catch {
    // The canonical "/" fallback preserves the stored tourist snapshot.
  }
});

(async () => {
  renderOfferSkeletons();
  renderReservationSkeletons();
  try {
    await session();
    await Promise.all([loadOffers(), loadReservations()]);
    elements.refresh.hidden = true;
    await resumeCheckout();
  } catch (error) {
    elements.refresh.hidden = false;
    setMessage(friendlyError(error, copy.ticketingUnavailable), true);
  }
})();
