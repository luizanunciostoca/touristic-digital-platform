import type { DashboardAuthClient } from "@touristic/auth-browser";
import {
  normalizeBusinessProfile,
  type BusinessProfile,
} from "@touristic/business";
import type {
  BusinessDashboardClient,
  MorroProInventoryOffer,
  MorroProOfferInput,
} from "./business-dashboard-client.js";
import {
  openBusinessProfileView,
  type BusinessProfileViewAction,
} from "./business-profile-view.js";

export const businessDashboardViews = Object.freeze([
  "dashboard",
  "performance",
  "audience",
  "offers",
  "promotions",
  "settings",
] as const);

export type BusinessDashboardView = (typeof businessDashboardViews)[number];

export function requestedBusinessId(search: string): string | undefined {
  const value = new URLSearchParams(search).get("businessId")?.trim();
  return value || undefined;
}

export function patchBusinessProfile(
  current: BusinessProfile | null,
  businessId: string,
  input: {
    readonly name: string;
    readonly categoryLabel: string;
    readonly description: string;
  },
): BusinessProfile {
  return normalizeBusinessProfile(
    {
      ...(current ?? {}),
      id: current?.id || businessId,
      name: input.name,
      categoryLabel: input.categoryLabel,
      description: input.description,
    },
    businessId,
  );
}

export interface BusinessDashboardSurfaceOptions {
  readonly document: Document;
  readonly storage: Storage;
  readonly search: string;
  readonly dashboardClient: BusinessDashboardClient;
  readonly authClient: DashboardAuthClient;
}

function requiredElement<T extends HTMLElement>(
  document: Document,
  id: string,
): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`MISSING_DASHBOARD_ELEMENT:${id}`);
  return element as T;
}

function setText(document: Document, id: string, value: string): void {
  requiredElement(document, id).textContent = value || "—";
}

function dispatchProfileAction(
  document: Document,
  action: BusinessProfileViewAction,
  profile: BusinessProfile,
): void {
  document.defaultView?.dispatchEvent(
    new CustomEvent("businessProfileAction", {
      detail: Object.freeze({ action, profile }),
    }),
  );
}

function localDateTimeToIso(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Data/hora inválida.");
  return date.toISOString();
}

function priceToMinorUnits(value: string): number {
  const normalized = Number(value.replace(",", "."));
  const minor = Math.round(normalized * 100);
  if (!Number.isSafeInteger(minor) || minor < 1) {
    throw new Error("Valor da oferta inválido.");
  }
  return minor;
}

function offerReference(businessId: string, label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40);
  if (!slug) throw new Error("Nome da oferta inválido.");
  return `morro-pro:${businessId.slice(0, 40)}:${slug}`;
}

function offerMoney(offer: MorroProInventoryOffer): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: offer.currency,
  }).format(offer.unitAmountMinor / 100);
}

interface OfferSurface {
  readonly form: HTMLFormElement;
  readonly status: HTMLElement;
  readonly list: HTMLElement;
  readonly label: HTMLInputElement;
  readonly kind: HTMLSelectElement;
  readonly price: HTMLInputElement;
  readonly capacity: HTMLInputElement;
  readonly maxPerReservation: HTMLInputElement;
  readonly salesStart: HTMLInputElement;
  readonly salesEnd: HTMLInputElement;
  readonly startsAt: HTMLInputElement;
  readonly endsAt: HTMLInputElement;
}

function createOfferSurface(document: Document): OfferSurface {
  const panel = document.querySelector<HTMLElement>(
    '[data-view-panel="offers"]',
  );
  if (!panel) throw new Error("MISSING_OFFERS_PANEL");
  panel.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "settings-grid";
  wrapper.innerHTML = `
    <article class="panel-card">
      <span class="eyebrow">Morro Pro Commerce</span>
      <h2>Nova oferta</h2>
      <p>Publique uma experiência diretamente no inventário público do Morro Digital.</p>
      <form id="morro-pro-offer-form">
        <label>Nome<input id="morro-pro-offer-label" maxlength="160" required /></label>
        <label>Tipo
          <select id="morro-pro-offer-kind">
            <option value="business_experience">Experiência</option>
            <option value="tour">Passeio</option>
          </select>
        </label>
        <label>Valor (BRL)<input id="morro-pro-offer-price" type="number" min="0.01" step="0.01" required /></label>
        <label>Capacidade<input id="morro-pro-offer-capacity" type="number" min="1" max="100000" value="20" required /></label>
        <label>Máximo por reserva<input id="morro-pro-offer-max" type="number" min="1" max="20" value="4" required /></label>
        <label>Início das vendas<input id="morro-pro-offer-sales-start" type="datetime-local" required /></label>
        <label>Fim das vendas<input id="morro-pro-offer-sales-end" type="datetime-local" required /></label>
        <label>Início da experiência<input id="morro-pro-offer-start" type="datetime-local" required /></label>
        <label>Fim da experiência<input id="morro-pro-offer-end" type="datetime-local" required /></label>
        <button class="button" type="submit">Publicar oferta</button>
        <p id="morro-pro-offer-status" class="form-status" role="status"></p>
      </form>
    </article>
    <article class="panel-card">
      <span class="eyebrow">Inventário do negócio</span>
      <h2>Suas ofertas</h2>
      <div id="morro-pro-offer-list" aria-live="polite"></div>
    </article>
  `;
  panel.append(wrapper);

  return Object.freeze({
    form: requiredElement<HTMLFormElement>(document, "morro-pro-offer-form"),
    status: requiredElement(document, "morro-pro-offer-status"),
    list: requiredElement(document, "morro-pro-offer-list"),
    label: requiredElement<HTMLInputElement>(document, "morro-pro-offer-label"),
    kind: requiredElement<HTMLSelectElement>(document, "morro-pro-offer-kind"),
    price: requiredElement<HTMLInputElement>(document, "morro-pro-offer-price"),
    capacity: requiredElement<HTMLInputElement>(
      document,
      "morro-pro-offer-capacity",
    ),
    maxPerReservation: requiredElement<HTMLInputElement>(
      document,
      "morro-pro-offer-max",
    ),
    salesStart: requiredElement<HTMLInputElement>(
      document,
      "morro-pro-offer-sales-start",
    ),
    salesEnd: requiredElement<HTMLInputElement>(
      document,
      "morro-pro-offer-sales-end",
    ),
    startsAt: requiredElement<HTMLInputElement>(
      document,
      "morro-pro-offer-start",
    ),
    endsAt: requiredElement<HTMLInputElement>(document, "morro-pro-offer-end"),
  });
}

function parsePositiveInteger(
  input: HTMLInputElement,
  maximum: number,
): number {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Valor inválido em ${input.id}.`);
  }
  return value;
}

function offerInput(
  surface: OfferSurface,
  businessId: string,
): MorroProOfferInput {
  const label = surface.label.value.trim();
  const productKind =
    surface.kind.value === "tour" ? "tour" : "business_experience";
  return Object.freeze({
    productKind,
    productReference: offerReference(businessId, label),
    label,
    unitAmountMinor: priceToMinorUnits(surface.price.value),
    currency: "BRL",
    pricingVersion: "morro-pro-v1",
    capacity: parsePositiveInteger(surface.capacity, 100_000),
    maxPerReservation: parsePositiveInteger(surface.maxPerReservation, 20),
    salesStartAt: localDateTimeToIso(surface.salesStart.value),
    salesEndAt: localDateTimeToIso(surface.salesEnd.value),
    startsAt: localDateTimeToIso(surface.startsAt.value),
    endsAt: localDateTimeToIso(surface.endsAt.value),
  });
}

function requestKey(document: Document): string {
  const uuid = document.defaultView?.crypto?.randomUUID?.();
  if (!uuid) throw new Error("Navegador sem geração segura de identificador.");
  return `mpro_${uuid.replaceAll("-", "")}`;
}

function renderOffers(
  document: Document,
  container: HTMLElement,
  offers: readonly MorroProInventoryOffer[],
  disable: (offer: MorroProInventoryOffer) => void,
): void {
  container.replaceChildren();
  if (offers.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Nenhuma oferta criada por este negócio.";
    container.append(empty);
    return;
  }
  for (const offer of offers) {
    const article = document.createElement("article");
    article.className = "panel-card";
    const title = document.createElement("h3");
    title.textContent = offer.label;
    const meta = document.createElement("p");
    meta.textContent = `${offerMoney(offer)} · ${offer.capacity} vagas · ${offer.enabled ? "ativa" : "desativada"}`;
    const id = document.createElement("small");
    id.textContent = offer.id;
    article.append(title, meta, id);
    if (offer.enabled) {
      const button = document.createElement("button");
      button.className = "button secondary";
      button.type = "button";
      button.textContent = "Desativar";
      button.addEventListener("click", () => disable(offer));
      article.append(button);
    }
    container.append(article);
  }
}

export async function mountBusinessDashboardSurface(
  options: BusinessDashboardSurfaceOptions,
): Promise<void> {
  const { document, storage, search, dashboardClient, authClient } = options;
  const entryScreen = requiredElement<HTMLElement>(document, "search-screen");
  const mainDashboard = requiredElement<HTMLElement>(
    document,
    "main-dashboard",
  );
  const entryMessage = requiredElement<HTMLElement>(document, "entry-message");
  const sidebar = requiredElement<HTMLElement>(document, "dashboard-sidebar");
  const overlay = requiredElement<HTMLElement>(document, "mobile-overlay");
  const form = requiredElement<HTMLFormElement>(document, "profile-form");
  const status = requiredElement<HTMLElement>(document, "profile-status");
  const nameInput = requiredElement<HTMLInputElement>(document, "profile-name");
  const categoryInput = requiredElement<HTMLInputElement>(
    document,
    "profile-category",
  );
  const descriptionInput = requiredElement<HTMLTextAreaElement>(
    document,
    "profile-description",
  );
  const offersSurface = createOfferSurface(document);

  let activeProfile: BusinessProfile | null = null;
  let businessId = "";

  function closeMobileMenu(): void {
    sidebar.classList.remove("mobile-open");
    overlay.hidden = true;
  }

  function activateView(view: BusinessDashboardView): void {
    document
      .querySelectorAll<HTMLElement>("[data-view-panel]")
      .forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.viewPanel === view);
      });
    document
      .querySelectorAll<HTMLElement>("[data-dashboard-view]")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.dashboardView === view,
        );
      });
    closeMobileMenu();
  }

  function renderProfile(profile: BusinessProfile | null): void {
    activeProfile = profile;
    const safeProfile =
      profile ?? normalizeBusinessProfile({ id: businessId }, businessId);
    setText(document, "business-name", safeProfile.name);
    setText(document, "summary-name", safeProfile.name);
    setText(document, "summary-category", safeProfile.categoryLabel);
    setText(document, "summary-description", safeProfile.description);
    nameInput.value = safeProfile.name;
    categoryInput.value = safeProfile.categoryLabel;
    descriptionInput.value = safeProfile.description;
  }

  async function reloadOffers(): Promise<void> {
    if (!businessId) return;
    offersSurface.status.textContent = "Atualizando inventário…";
    const offers = await dashboardClient.listOffers(businessId);
    renderOffers(document, offersSurface.list, offers, (offer) => {
      offersSurface.status.textContent = "Desativando oferta…";
      void dashboardClient
        .disableOffer(businessId, offer.id)
        .then(() => reloadOffers())
        .then(() => {
          offersSurface.status.textContent = "Oferta desativada.";
        })
        .catch((error: unknown) => {
          offersSurface.status.textContent =
            error instanceof Error
              ? error.message
              : "Falha ao desativar oferta.";
        });
    });
    offersSurface.status.textContent = "";
  }

  const profileSummary = requiredElement<HTMLElement>(
    document,
    "summary-description",
  ).closest(".panel-card");
  if (!profileSummary) throw new Error("MISSING_PROFILE_SUMMARY_PANEL");
  const previewButton = document.createElement("button");
  previewButton.id = "open-business-profile";
  previewButton.type = "button";
  previewButton.className = "button secondary";
  previewButton.textContent = "Visualizar perfil";
  previewButton.addEventListener("click", () => {
    if (!activeProfile) return;
    openBusinessProfileView(document, activeProfile, {
      onAction: (action, profile) =>
        dispatchProfileAction(document, action, profile),
    });
  });
  profileSummary.append(previewButton);

  document
    .querySelectorAll<HTMLElement>("[data-dashboard-view]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const candidate = button.dataset.dashboardView;
        if (
          businessDashboardViews.includes(candidate as BusinessDashboardView)
        ) {
          activateView(candidate as BusinessDashboardView);
          if (candidate === "offers") {
            void reloadOffers().catch((error: unknown) => {
              offersSurface.status.textContent =
                error instanceof Error
                  ? error.message
                  : "Falha ao carregar ofertas.";
            });
          }
        }
      });
    });

  requiredElement<HTMLButtonElement>(document, "mobile-menu").addEventListener(
    "click",
    () => {
      sidebar.classList.add("mobile-open");
      overlay.hidden = false;
    },
  );
  overlay.addEventListener("click", closeMobileMenu);

  requiredElement<HTMLButtonElement>(
    document,
    "sidebar-collapse",
  ).addEventListener("click", () => sidebar.classList.toggle("collapsed"));

  const storedTheme = storage.getItem("business-dashboard-theme");
  if (storedTheme === "dark") document.documentElement.dataset.theme = "dark";
  requiredElement<HTMLButtonElement>(document, "theme-toggle").addEventListener(
    "click",
    () => {
      const next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      storage.setItem("business-dashboard-theme", next);
    },
  );

  requiredElement<HTMLButtonElement>(
    document,
    "logout-button",
  ).addEventListener("click", () => {
    void authClient.logout();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.textContent = "Salvando…";
    const nextProfile = patchBusinessProfile(activeProfile, businessId, {
      name: nameInput.value,
      categoryLabel: categoryInput.value,
      description: descriptionInput.value,
    });
    void dashboardClient
      .saveProfile(businessId, nextProfile)
      .then((saved) => {
        renderProfile(saved);
        status.textContent = "Perfil salvo com segurança.";
      })
      .catch((error: unknown) => {
        status.textContent =
          error instanceof Error ? error.message : "Falha ao salvar perfil.";
      });
  });

  offersSurface.form.addEventListener("submit", (event) => {
    event.preventDefault();
    offersSurface.status.textContent = "Publicando oferta…";
    try {
      const input = offerInput(offersSurface, businessId);
      const key = requestKey(document);
      void dashboardClient
        .createOffer(businessId, input, key)
        .then(() => reloadOffers())
        .then(() => {
          offersSurface.form.reset();
          offersSurface.capacity.value = "20";
          offersSurface.maxPerReservation.value = "4";
          offersSurface.status.textContent = "Oferta publicada no inventário.";
        })
        .catch((error: unknown) => {
          offersSurface.status.textContent =
            error instanceof Error
              ? error.message
              : "Falha ao publicar oferta.";
        });
    } catch (error: unknown) {
      offersSurface.status.textContent =
        error instanceof Error ? error.message : "Oferta inválida.";
    }
  });

  try {
    const bootstrap = await dashboardClient.bootstrap(
      requestedBusinessId(search),
    );
    businessId = bootstrap.businessId;
    renderProfile(bootstrap.profile);
    entryScreen.hidden = true;
    mainDashboard.hidden = false;
    activateView("dashboard");
  } catch (error: unknown) {
    entryMessage.textContent =
      error instanceof Error
        ? `Não foi possível abrir o dashboard: ${error.message}`
        : "Não foi possível abrir o dashboard.";
    entryScreen.hidden = false;
    mainDashboard.hidden = true;
  }
}
