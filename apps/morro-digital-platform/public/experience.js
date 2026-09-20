import { initializeMorroBrowserLocale } from "/runtime/browser-locale.js";
import {
  applyCommerceDocumentCopy,
  commerceIntlLocale,
  getExperiencePresentationCopy,
} from "/runtime/commerce-i18n.js";

const localeResolution = initializeMorroBrowserLocale({ document });
const presentationLocale = commerceIntlLocale(localeResolution.locale);
const copy = getExperiencePresentationCopy(presentationLocale);
applyCommerceDocumentCopy(document, "experience", presentationLocale);

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
  return new Intl.NumberFormat(presentationLocale, {
    style: "currency",
    currency: value.currency,
  }).format(value.minorUnits / 100);
}

function dateTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(presentationLocale, {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "America/Bahia",
      }).format(date)
    : copy.confirmLater;
}

function kindLabel(offer) {
  if (offer?.product?.kind === "tour") return copy.kindTour;
  if (offer?.product?.kind === "transport") return copy.kindTransport;
  return copy.kindExperience;
}

function description(offer) {
  const reference = String(offer?.product?.reference || "").replaceAll(
    "-",
    " ",
  );
  return reference
    ? copy.description(kindLabel(offer), reference)
    : copy.fallbackDescription(kindLabel(offer));
}

function showError(message) {
  elements.loading.textContent = message;
  elements.loading.hidden = false;
  elements.card.hidden = true;
}

async function load() {
  const id = new URLSearchParams(location.search).get("id")?.trim();
  if (!id) {
    showError(copy.missingExperience);
    return;
  }
  const response = await fetch("/api/ticketing/v1/inventory", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload?.error || `HTTP_${response.status}`);
  const offers = Array.isArray(payload.data) ? payload.data : [];
  const offer = offers.find((entry) => entry?.id === id);
  if (!offer) {
    showError(copy.unavailableNow);
    return;
  }

  elements.kind.textContent = kindLabel(offer);
  elements.title.textContent =
    offer.label || `Morro Digital · ${copy.kindExperience}`;
  elements.description.textContent = description(offer);
  elements.start.textContent = dateTime(offer.startsAt);
  elements.end.textContent = dateTime(offer.endsAt);
  elements.price.textContent = money(offer.unitAmount);
  elements.availability.textContent = copy.availableCount(
    Number(offer.availableQuantity || 0),
  );
  elements.salesWindow.textContent = copy.salesWindow(
    dateTime(offer.salesStartAt),
    dateTime(offer.salesEndAt),
  );
  elements.reserve.href = `/tickets.html?offer=${encodeURIComponent(offer.id)}`;
  elements.reserve.textContent =
    Number(offer.availableQuantity || 0) > 0
      ? copy.reserveNow
      : copy.viewAvailability;
  elements.loading.hidden = true;
  elements.card.hidden = false;
  document.title = copy.documentTitle(offer.label || copy.kindExperience);
}

void load().catch(() => {
  showError(copy.loadFailed);
});
