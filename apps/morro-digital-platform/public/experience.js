const elements = {
  loading: document.querySelector("#experience-loading"),
  card: document.querySelector("#experience-card"),
  kind: document.querySelector("#experience-kind"),
  title: document.querySelector("#experience-title"),
  description: document.querySelector("#experience-description"),
  start: document.querySelector("#experience-start"),
  end: document.querySelector("#experience-end"),
  price: document.querySelector("#experience-price"),
  availability: document.querySelector("#experience-availability"),
  salesWindow: document.querySelector("#experience-sales-window"),
  reserve: document.querySelector("#experience-reserve"),
};

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

function dateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Bahia",
      }).format(date)
    : "A confirmar";
}

function kindLabel(offer) {
  return offer?.product?.kind === "tour" ? "Passeio" : "Experiência";
}

function description(offer) {
  const reference = String(offer?.product?.reference || "").replaceAll("-", " ");
  return reference
    ? `${kindLabel(offer)} disponível no Morro Digital. ${reference}. Reserve com disponibilidade e preço confirmados pelo inventário oficial da plataforma.`
    : "Reserve esta experiência pelo inventário oficial do Morro Digital.";
}

function showError(message) {
  elements.loading.textContent = message;
  elements.loading.hidden = false;
  elements.card.hidden = true;
}

async function load() {
  const id = new URLSearchParams(location.search).get("id")?.trim();
  if (!id) {
    showError("Experiência não informada.");
    return;
  }
  const response = await fetch("/api/ticketing/v1/inventory", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `HTTP_${response.status}`);
  const offers = Array.isArray(payload.data) ? payload.data : [];
  const offer = offers.find((entry) => entry?.id === id);
  if (!offer) {
    showError("Esta experiência não está disponível no momento.");
    return;
  }

  elements.kind.textContent = kindLabel(offer);
  elements.title.textContent = offer.label || "Experiência Morro Digital";
  elements.description.textContent = description(offer);
  elements.start.textContent = dateTime(offer.startsAt);
  elements.end.textContent = dateTime(offer.endsAt);
  elements.price.textContent = money(offer.unitAmount);
  elements.availability.textContent = `${Number(offer.availableQuantity || 0)} disponíveis`;
  elements.salesWindow.textContent = `${dateTime(offer.salesStartAt)} até ${dateTime(offer.salesEndAt)}`;
  elements.reserve.href = `/tickets.html?offer=${encodeURIComponent(offer.id)}`;
  elements.reserve.textContent =
    Number(offer.availableQuantity || 0) > 0
      ? "Reservar agora"
      : "Ver disponibilidade";
  elements.loading.hidden = true;
  elements.card.hidden = false;
  document.title = `${offer.label || "Experiência"} · Morro Digital`;
}

void load().catch(() => {
  showError(
    "Não foi possível carregar esta experiência agora. Tente novamente em instantes.",
  );
});
