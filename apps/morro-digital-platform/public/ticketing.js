import {
  initializeMorroBrowserLocale,
} from "/apps/morro-digital-platform/dist/runtime/browser-locale.js";
import {
  applyCommerceDocumentCopy,
  commerceIntlLocale,
  getTicketingPresentationCopy,
} from "/apps/morro-digital-platform/dist/runtime/commerce-i18n.js";

const localeResolution = initializeMorroBrowserLocale({ document });
const presentationLocale = commerceIntlLocale(localeResolution.locale);
const copy = getTicketingPresentationCopy(presentationLocale);
applyCommerceDocumentCopy(document, "ticketing", presentationLocale);

const state = {
  session: null,
  csrfToken: "",
  offers: [],
  selectedOffer: null,
};

const checkoutStorageKey = "morro_ticketing_checkout_v1";
const canonicalCheckoutPath = "/api/payments/v1/checkouts";
const commerceSessionPath = "/api/ticketing/v1/consumer-session";
const elements = {
  offers: document.querySelector("#offers"),
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
};

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
  elements.inventoryId.value = offer.id;
  elements.selectedOffer.value = `${offer.label} · ${money(offer.unitAmount)}`;
  elements.quantity.max = String(
    Math.min(offer.maxPerReservation, offer.availableQuantity),
  );
  if (Number(elements.quantity.value) > Number(elements.quantity.max))
    elements.quantity.value = "1";
  elements.reserve.disabled = offer.availableQuantity < 1;
  for (const card of elements.offers.querySelectorAll(".offer-card")) {
    card.classList.toggle("is-selected", card.dataset.inventoryId === offer.id);
  }
  if (scroll)
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderOffers() {
  elements.offers.replaceChildren();
  if (state.offers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = copy.noOffers;
    elements.offers.append(empty);
    return;
  }
  for (const offer of state.offers) {
    const card = document.createElement("article");
    card.className = "offer-card";
    card.dataset.inventoryId = offer.id;

    const content = document.createElement("div");
    const kind = document.createElement("span");
    kind.className = "offer-kind";
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
    availability.className = "availability";
    availability.textContent = copy.availableCount(offer.availableQuantity);
    content.append(kind, title, when, price, availability);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const detail = document.createElement("a");
    detail.className = "button button-secondary";
    detail.href = `/experience.html?id=${encodeURIComponent(offer.id)}`;
    detail.textContent = copy.details;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-primary";
    button.disabled = offer.availableQuantity < 1;
    button.textContent = offer.availableQuantity > 0 ? copy.reserve : copy.soldOut;
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
  renderOffers();

  const requestedOffer = new URLSearchParams(location.search).get("offer");
  if (requestedOffer && offerIdPattern.test(requestedOffer)) {
    const offer = state.offers.find((entry) => entry.id === requestedOffer);
    if (offer) selectOffer(offer);
  } else if (requestedPlace && state.offers.length === 1) {
    selectOffer(state.offers[0]);
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
      ? copy.viewPass
      : copy.viewTicket);
  elements.ticketQr.replaceChildren();
  const template = document.createElement("template");
  template.innerHTML = ticket.qrSvg;
  const svg = template.content.querySelector("svg");
  if (!svg || template.content.children.length !== 1)
    throw new Error("TICKET_QR_INVALID");
  elements.ticketQr.append(svg);
  elements.ticketCode.textContent = ticket.code;
  elements.ticketMeta.textContent = `${ticket.quantity} ${productUnitLabel(
    reservation.product,
    ticket.quantity,
  )} · ${money(ticket.amount)} · ${copy.issuedAt(dateTime(ticket.issuedAt))}`;
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
  if (reservations.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = copy.noReservations;
    elements.reservations.append(empty);
    return;
  }
  for (const reservation of reservations) {
    const card = document.createElement("article");
    card.className = "reservation-card";
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
        : copy.createdAt(dateTime(reservation.createdAt));
    const status = document.createElement("span");
    status.className = `status status-${reservation.status}`;
    status.textContent = statusLabel(reservation.status);
    content.append(title, detail, expiry, status);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    if (reservation.status === "confirmed") {
      const ticket = document.createElement("button");
      ticket.type = "button";
      ticket.className = "button button-primary";
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
      cancel.className = "button button-secondary";
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
  setMessage(
    copy.paymentConfirmedFinalizing,
  );
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
      clearCheckout();
      setMessage(copy.paymentConfirmedIssuing);
      await waitForTicket(active.reservationId);
      return;
    }
    if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(status)) {
      clearCheckout();
      setMessage(
        copy.paymentNotCompleted,
        true,
      );
      await loadReservations();
      return;
    }
    await wait(2_500);
  }
  setMessage(
    copy.confirmationPending,
  );
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
  saveCheckout({
    checkoutId: checkout.checkoutId,
    statusToken: checkout.statusToken,
    statusExpiresAt: checkout.statusExpiresAt,
    reservationId: descriptor.reservationReference,
  });
  if (checkout.checkoutUrl) {
    location.assign(checkout.checkoutUrl);
    return;
  }
  await resumeCheckout();
}

async function submitReservation(event) {
  event.preventDefault();
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

  elements.reserve.disabled = true;
  setMessage(copy.creatingReservation);
  try {
    const reference = `web_${crypto.randomUUID().replaceAll("-", "")}`;
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
    setMessage(copy.reservationCreated);
    await createCheckout(payload.data);
  } catch (error) {
    setMessage(error.message || copy.createReservationFailed, true);
    elements.reserve.disabled = false;
    await Promise.allSettled([loadOffers(), loadReservations()]);
  }
}

elements.form.addEventListener(
  "submit",
  (event) => void submitReservation(event),
);
elements.refresh.addEventListener("click", () => {
  void Promise.all([loadOffers(), loadReservations()]).catch((error) => {
    setMessage(error.message || copy.updateFailed, true);
  });
});
elements.dialogClose.addEventListener("click", () => elements.dialog.close());

(async () => {
  try {
    await session();
    await Promise.all([loadOffers(), loadReservations()]);
    await resumeCheckout();
  } catch (error) {
    setMessage(error.message || copy.ticketingUnavailable, true);
  }
})();
