const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "table_reservation";
const businessIdPattern = /^[a-z0-9][a-z0-9_-]{0,119}$/u;
const placeIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{1,119}$/u;
const canonicalCheckoutPath = "/api/payments/v1/checkouts";
const commerceSessionPath = "/api/ticketing/v1/consumer-session";
const checkoutStorageKey = "morro_commerce_restaurant_checkout_v1";
const attemptStorageKey = "morro_commerce_restaurant_attempt_v1";

if (mode !== "table_reservation") {
  const target = new URL("/tickets.html", location.origin);
  for (const [key, value] of params.entries()) {
    if (key !== "mode") target.searchParams.append(key, value);
  }
  if (mode === "activity_reservation") target.searchParams.set("mode", "tour");
  location.replace(target);
}

let businessId = params.get("businessId") || "";
const placeId = params.get("placeId") || "";
const title = (params.get("title") || "").trim().slice(0, 160);
const placeLabel = (params.get("place") || "").trim().slice(0, 160);

const state = {
  session: null,
  csrfToken: "",
  date: "",
  slots: [],
  selected: null,
  partySize: 2,
  submitting: false,
};

const elements = {
  back: document.querySelector("[data-commerce-back]"),
  title: document.querySelector("#commerce-title"),
  place: document.querySelector("[data-commerce-place]"),
  dateFact: document.querySelector("[data-commerce-date-fact]"),
  depositFact: document.querySelector("[data-commerce-deposit-fact]"),
  status: document.querySelector("[data-commerce-status]"),
  date: document.querySelector("[data-commerce-date]"),
  dateChips: [...document.querySelectorAll("[data-date-offset]")],
  slots: document.querySelector("[data-commerce-slots]"),
  retry: document.querySelector("[data-commerce-retry]"),
  selection: document.querySelector("[data-commerce-selection]"),
  customer: document.querySelector("[data-commerce-customer]"),
  form: document.querySelector("[data-commerce-form]"),
  partyLabel: document.querySelector("[data-commerce-party-label]"),
  partySize: document.querySelector("[data-party-size]"),
  partyDecrease: document.querySelector("[data-party-decrease]"),
  partyIncrease: document.querySelector("[data-party-increase]"),
  seating: document.querySelector("[data-commerce-seating]"),
  summary: document.querySelector("[data-commerce-summary]"),
  summaryTitle: document.querySelector("[data-commerce-summary-title]"),
  summaryMeta: document.querySelector("[data-commerce-summary-meta]"),
  deposit: document.querySelector("[data-commerce-deposit]"),
  depositAmount: document.querySelector("[data-commerce-deposit-amount]"),
  submit: document.querySelector("[data-commerce-submit]"),
  confirmation: document.querySelector("[data-commerce-confirmation]"),
  confirmationTitle: document.querySelector("[data-confirmation-title]"),
  confirmationCopy: document.querySelector("[data-confirmation-copy]"),
};

function text(value) {
  return typeof value === "string" ? value : "";
}

function correlationId() {
  if (!globalThis.crypto?.randomUUID)
    throw new Error("BROWSER_CRYPTO_REQUIRED");
  return `browser:${globalThis.crypto.randomUUID()}`;
}

function bahiaDate(offset = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bahia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const noon = new Date(Date.UTC(year, month - 1, day + offset, 15, 0, 0));
  return noon.toISOString().slice(0, 10);
}

function dateLabel(value) {
  const date = new Date(`${value}T12:00:00-03:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "America/Bahia",
  }).format(date);
}

function timeLabel(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bahia",
  }).format(date);
}

function money(value) {
  if (
    !value ||
    typeof value.minorUnits !== "number" ||
    typeof value.currency !== "string"
  ) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: value.currency,
  }).format(value.minorUnits / 100);
}

function setStatus(message, stateName = "") {
  elements.status.textContent = message;
  if (stateName) elements.status.dataset.state = stateName;
  else delete elements.status.dataset.state;
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
    const payload = await response.clone().json().catch(() => ({}));
    if (payload?.error === "INVALID_CSRF") {
      await session();
      return api(path, init, false);
    }
  }
  return json(response);
}

function renderSkeletons() {
  elements.slots.replaceChildren();
  elements.slots.setAttribute("aria-busy", "true");
  for (let index = 0; index < 4; index += 1) {
    const skeleton = document.createElement("span");
    skeleton.className = "md-skeleton commerce-skeleton";
    skeleton.setAttribute("aria-hidden", "true");
    elements.slots.append(skeleton);
  }
}

function resetSelection() {
  state.selected = null;
  elements.selection.hidden = true;
  elements.customer.hidden = true;
  elements.summary.hidden = true;
  elements.submit.disabled = true;
  elements.deposit.hidden = true;
  elements.depositFact.hidden = true;
}

function updateParty() {
  if (!state.selected) return;
  const min = state.selected.slot.minPartySize;
  const max = Math.min(
    state.selected.slot.maxPartySize,
    state.selected.availability.remainingGuests,
  );
  state.partySize = Math.max(min, Math.min(state.partySize, max));
  elements.partySize.textContent = String(state.partySize);
  elements.partyLabel.textContent =
    state.partySize === 1 ? "1 pessoa" : `${state.partySize} pessoas`;
  elements.partyDecrease.disabled = state.partySize <= min;
  elements.partyIncrease.disabled = state.partySize >= max;
  elements.summaryTitle.textContent = `${timeLabel(
    state.selected.slot.startsAt,
  )} · ${elements.partyLabel.textContent}`;
  elements.summaryMeta.textContent =
    state.selected.slot.seatingArea || "Área definida pelo restaurante";
  elements.submit.disabled = false;
}

function selectSlot(entry) {
  state.selected = entry;
  state.partySize = Math.max(2, entry.slot.minPartySize);
  for (const button of elements.slots.querySelectorAll("[data-slot-id]")) {
    button.setAttribute(
      "aria-selected",
      String(button.dataset.slotId === entry.slot.id),
    );
  }
  elements.selection.hidden = false;
  elements.customer.hidden = false;
  elements.summary.hidden = false;
  elements.seating.textContent = entry.slot.seatingArea || "";
  if (entry.slot.depositPolicy?.kind === "required") {
    elements.deposit.hidden = false;
    elements.depositAmount.textContent = money(entry.slot.depositPolicy.amount);
    elements.depositFact.hidden = false;
    elements.depositFact.textContent = `Depósito: ${money(
      entry.slot.depositPolicy.amount,
    )}`;
    elements.submit.textContent = "Reservar e pagar depósito";
  } else {
    elements.deposit.hidden = true;
    elements.depositFact.hidden = true;
    elements.submit.textContent = "Reservar mesa";
  }
  updateParty();
}

function renderSlots() {
  elements.slots.replaceChildren();
  elements.slots.removeAttribute("aria-busy");
  const available = state.slots.filter(
    (entry) =>
      entry?.availability?.bookable === true &&
      Number(entry.availability.remainingGuests) >= entry.slot.minPartySize,
  );
  if (!available.length) {
    const empty = document.createElement("p");
    empty.className = "commerce-empty";
    empty.textContent = "Não há mesas disponíveis para esta data.";
    elements.slots.append(empty);
    resetSelection();
    return;
  }

  for (const entry of state.slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "commerce-slot";
    button.dataset.slotId = entry.slot.id;
    button.setAttribute("role", "option");
    button.setAttribute(
      "aria-selected",
      String(state.selected?.slot?.id === entry.slot.id),
    );
    const remaining = Number(entry.availability.remainingGuests) || 0;
    const bookable =
      entry.availability.bookable === true &&
      remaining >= entry.slot.minPartySize;
    button.disabled = !bookable;

    const time = document.createElement("strong");
    time.textContent = timeLabel(entry.slot.startsAt);
    const meta = document.createElement("small");
    meta.textContent = bookable
      ? entry.slot.seatingArea || "Disponível"
      : "Indisponível";
    button.append(time, meta);
    button.addEventListener("click", () => selectSlot(entry));
    elements.slots.append(button);
  }
}

async function resolveRestaurantIdentity() {
  if (businessIdPattern.test(businessId)) return true;
  if (!placeId || !placeIdPattern.test(placeId)) return false;

  setStatus("Localizando opções de reserva…");
  try {
    const payload = await api(
      `/api/commerce/v1/places/${encodeURIComponent(placeId)}/offerings`,
    );
    const restaurants = Array.isArray(payload.data)
      ? payload.data.filter(
          (offer) =>
            offer?.commerceMode === "table_reservation" &&
            offer?.placeId === placeId &&
            businessIdPattern.test(offer?.businessId || ""),
        )
      : [];

    if (restaurants.length === 0) return false;
    if (restaurants.length === 1) {
      businessId = restaurants[0].businessId;
      return true;
    }

    elements.slots.replaceChildren();
    elements.slots.removeAttribute("aria-busy");
    elements.date.disabled = true;
    for (const chip of elements.dateChips) chip.disabled = true;
    setStatus("Escolha a opção de reserva deste local.");

    restaurants.forEach((offer, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "commerce-slot";
      button.setAttribute("role", "option");
      button.dataset.businessId = offer.businessId;
      const title = document.createElement("strong");
      title.textContent =
        typeof offer.title === "string" &&
        offer.title.trim() &&
        offer.title !== "Reservar mesa"
          ? offer.title.trim()
          : `Opção ${index + 1}`;
      const meta = document.createElement("small");
      meta.textContent = offer.sellable ? "Disponível" : "Em breve";
      button.disabled = offer.sellable !== true;
      button.append(title, meta);
      button.addEventListener("click", () => {
        businessId = offer.businessId;
        elements.date.disabled = false;
        for (const chip of elements.dateChips) chip.disabled = false;
        void loadAvailability();
      });
      elements.slots.append(button);
    });
    return null;
  } catch {
    return false;
  }
}

async function loadAvailability() {
  resetSelection();
  renderSkeletons();
  elements.retry.hidden = true;
  setStatus("Consultando disponibilidade…");
  const query = new URLSearchParams({ date: state.date });
  if (placeId && placeIdPattern.test(placeId)) query.set("placeId", placeId);

  try {
    const payload = await api(
      `/api/commerce/v1/restaurants/${encodeURIComponent(
        businessId,
      )}/availability?${query}`,
    );
    state.slots = Array.isArray(payload.data) ? payload.data : [];
    renderSlots();
    elements.dateFact.hidden = false;
    elements.dateFact.textContent = dateLabel(state.date);
    setStatus(
      state.slots.length
        ? "Escolha um horário disponível."
        : "Nenhuma disponibilidade encontrada.",
    );
  } catch (error) {
    state.slots = [];
    renderSlots();
    elements.retry.hidden = false;
    setStatus(
      error?.message === "COMMERCE_FEATURE_DISABLED"
        ? "Reservas ainda não estão habilitadas para este restaurante."
        : "Não foi possível consultar a disponibilidade agora.",
      "error",
    );
  }
}

function setDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return;
  state.date = value;
  elements.date.value = value;
  for (const chip of elements.dateChips) {
    chip.setAttribute(
      "aria-pressed",
      String(bahiaDate(Number(chip.dataset.dateOffset || "0")) === value),
    );
  }
  void loadAvailability();
}

function attemptKey() {
  if (!state.selected) throw new Error("COMMERCE_SLOT_REQUIRED");
  const fingerprint = [
    businessId,
    state.selected.slot.id,
    state.partySize,
    state.date,
  ].join(":");
  try {
    const current = JSON.parse(
      sessionStorage.getItem(attemptStorageKey) || "null",
    );
    if (
      current?.fingerprint === fingerprint &&
      typeof current?.key === "string"
    ) {
      return current.key;
    }
  } catch {
    sessionStorage.removeItem(attemptStorageKey);
  }
  const key = `restaurant_${crypto.randomUUID().replaceAll("-", "")}`;
  sessionStorage.setItem(
    attemptStorageKey,
    JSON.stringify({ fingerprint, key }),
  );
  return key;
}

function clearAttempt() {
  sessionStorage.removeItem(attemptStorageKey);
}

function saveCheckout(value) {
  sessionStorage.setItem(checkoutStorageKey, JSON.stringify(value));
}

function readCheckout() {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(checkoutStorageKey) || "null",
    );
    return value?.checkoutId &&
      value?.statusToken &&
      value?.reservationId &&
      value?.businessId === businessId
      ? value
      : null;
  } catch {
    return null;
  }
}

function clearCheckout() {
  sessionStorage.removeItem(checkoutStorageKey);
}

async function readReservation(reservationId) {
  const payload = await api(
    `/api/commerce/v1/restaurants/${encodeURIComponent(
      businessId,
    )}/reservations/${encodeURIComponent(reservationId)}`,
  );
  return payload.data;
}

function showConfirmation(reservation, message) {
  elements.confirmation.hidden = false;
  elements.confirmationTitle.textContent =
    reservation?.status === "confirmed"
      ? "Reserva confirmada"
      : "Reserva em processamento";
  elements.confirmationCopy.textContent =
    message ||
    `${dateLabel(reservation.serviceDate)} · ${timeLabel(
      reservation.startsAt,
    )} · ${reservation.partySize} ${
      reservation.partySize === 1 ? "pessoa" : "pessoas"
    }`;
  elements.confirmation.scrollIntoView({ block: "nearest" });
}

async function waitForReservation(reservationId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const reservation = await readReservation(reservationId);
    if (reservation?.status === "confirmed") return reservation;
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return readReservation(reservationId);
}

async function resumeCheckout() {
  const active = readCheckout();
  if (!active) return;
  if (
    active.statusExpiresAt &&
    Date.parse(active.statusExpiresAt) <= Date.now()
  ) {
    clearCheckout();
    setStatus("A sessão de pagamento expirou. Faça uma nova reserva.", "error");
    return;
  }

  setStatus("Verificando pagamento…");
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
      setStatus("Pagamento confirmado. Finalizando sua reserva…", "success");
      const reservation = await waitForReservation(active.reservationId);
      clearCheckout();
      if (reservation?.status === "confirmed") {
        showConfirmation(reservation);
        setStatus("Reserva confirmada.", "success");
      } else {
        showConfirmation(
          reservation,
          "Pagamento confirmado. A confirmação da reserva está sendo finalizada.",
        );
      }
      return;
    }

    if (["FAILED", "CANCELLED", "EXPIRED", "REFUNDED"].includes(status)) {
      clearCheckout();
      setStatus("O pagamento não foi concluído.", "error");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  setStatus(
    "O pagamento ainda está sendo confirmado. Você pode voltar a esta página.",
  );
}

async function startCheckout(reservationPayload) {
  const descriptor = reservationPayload.checkout;
  if (
    !descriptor?.token ||
    !descriptor?.idempotencyKey ||
    !descriptor?.handoff ||
    descriptor.handoff.reservationReference !== reservationPayload.data?.id
  ) {
    throw new Error("COMMERCE_CHECKOUT_HANDOFF_INVALID");
  }

  const response = await fetch(canonicalCheckoutPath, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId(),
      "X-Checkout-Handoff-Token": descriptor.token,
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
    throw new Error("COMMERCE_CHECKOUT_RESPONSE_INVALID");
  }

  saveCheckout({
    checkoutId: checkout.checkoutId,
    statusToken: checkout.statusToken,
    statusExpiresAt: checkout.statusExpiresAt,
    reservationId: reservationPayload.data.id,
    businessId,
  });
  clearAttempt();

  if (checkout.checkoutUrl) {
    location.assign(checkout.checkoutUrl);
    return;
  }
  await resumeCheckout();
}

async function submitReservation(event) {
  event.preventDefault();
  if (state.submitting || !state.selected) return;

  const form = new FormData(elements.form);
  const customer = {
    name: text(form.get("name")).trim(),
    email: text(form.get("email")).trim().toLowerCase(),
    phone: text(form.get("phone")).trim() || null,
    document: null,
  };
  const notes = text(form.get("notes")).trim() || null;
  if (!customer.name || !customer.email || !customer.email.includes("@")) {
    setStatus("Preencha nome e e-mail para continuar.", "error");
    return;
  }

  state.submitting = true;
  elements.submit.disabled = true;
  setStatus("Confirmando disponibilidade…");
  try {
    const payload = await api(
      `/api/commerce/v1/restaurants/${encodeURIComponent(
        businessId,
      )}/reservations`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attemptKey(),
        },
        body: JSON.stringify({
          slotId: state.selected.slot.id,
          partySize: state.partySize,
          notes,
          customer,
          returnUrl: location.href,
        }),
      },
    );
    if (!payload?.data?.id) {
      throw new Error("COMMERCE_RESERVATION_RESPONSE_INVALID");
    }

    if (payload.paymentRequired === true) {
      setStatus("Reserva mantida. Abrindo pagamento seguro…");
      await startCheckout(payload);
      return;
    }

    clearAttempt();
    showConfirmation(payload.data);
    setStatus("Reserva confirmada.", "success");
  } catch (error) {
    if (error?.status >= 400 && error?.status < 500) clearAttempt();
    const code = text(error?.message);
    const message = code.includes("CAPACITY_EXHAUSTED")
      ? "Este horário acabou de ficar indisponível. Escolha outro."
      : code.includes("PARTY_SIZE")
        ? "O número de pessoas não é válido para este horário."
        : code.includes("NOT_BOOKABLE")
          ? "Este horário não aceita mais reservas."
          : "Não foi possível concluir a reserva. Tente novamente.";
    setStatus(message, "error");
    await loadAvailability();
  } finally {
    state.submitting = false;
    if (state.selected) elements.submit.disabled = false;
  }
}

function configurePresentation() {
  elements.title.textContent = title || placeLabel || "Reserve sua mesa";
  if (placeLabel) {
    elements.place.hidden = false;
    elements.place.textContent = `📍 ${placeLabel}`;
  }

  elements.date.min = bahiaDate(0);
  elements.date.value = bahiaDate(0);

  for (const chip of elements.dateChips) {
    chip.addEventListener("click", () =>
      setDate(bahiaDate(Number(chip.dataset.dateOffset || "0"))),
    );
  }
  elements.date.addEventListener("change", () => setDate(elements.date.value));
  elements.retry.addEventListener("click", () => void loadAvailability());
  elements.partyDecrease.addEventListener("click", () => {
    state.partySize -= 1;
    updateParty();
  });
  elements.partyIncrease.addEventListener("click", () => {
    state.partySize += 1;
    updateParty();
  });
  elements.form.addEventListener("submit", (event) =>
    void submitReservation(event),
  );
  elements.back.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.assign("/");
  });
}

async function initialize() {
  configurePresentation();

  try {
    await session();
    const identity = await resolveRestaurantIdentity();
    if (identity === false) {
      setStatus(
        "Este restaurante ainda não possui uma identidade Commerce vinculada. A reserva online não pode ser aberta com segurança.",
        "error",
      );
      elements.date.disabled = true;
      for (const chip of elements.dateChips) chip.disabled = true;
      elements.slots.removeAttribute("aria-busy");
      elements.slots.replaceChildren();
      return;
    }
    if (identity === null) return;

    state.date = bahiaDate(0);
    await loadAvailability();
    await resumeCheckout();
  } catch {
    setStatus("Não foi possível iniciar a reserva agora.", "error");
  }
}

void initialize();
