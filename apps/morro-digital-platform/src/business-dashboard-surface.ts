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
import {
  createBusinessContextController,
  morroProModules,
  resolveMorroProModuleAccess,
  type BusinessContextController,
  type MorroProModule,
  type MorroProModuleAccess,
} from "./morro-pro-business-management.js";

export const businessDashboardViews = morroProModules;

export type BusinessDashboardView = MorroProModule;

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

const moduleDescriptions: Readonly<Record<MorroProModule, string>> =
  Object.freeze({
    dashboard: "Visão geral do seu negócio na Morro Digital.",
    profile:
      "Edite os dados públicos do negócio usando o Business/Place canônico.",
    location:
      "Gerencie a localização conforme a política geográfica e de publicação.",
    photos: "Gerencie fotos vinculadas ao Place através da autoridade de mídia.",
    products:
      "Gerencie produtos vinculados explicitamente ao negócio e aos Places.",
    offers: "Crie e acompanhe ofertas autorizadas do negócio.",
    menu: "Gerencie cardápio estruturado quando esta capacidade estiver disponível.",
    reservations: "Acompanhe reservas quando habilitadas para este Place.",
    ticketing: "Acesse ticketing e check-in quando habilitados.",
    financial:
      "Consulte projeções financeiras autorizadas em modo somente leitura.",
    content: "Gerencie conteúdo conforme sua role e capabilities.",
    preview: "Visualize a presença pública antes da publicação governada.",
    team: "Gerencie o acesso da equipe dentro do escopo deste negócio.",
    settings:
      "Ajuste preferências do Morro Pro sem receber capacidades de plataforma.",
  });

function ensureMorroProPanels(document: Document): void {
  const profilePanel = document.querySelector<HTMLElement>(
    '[data-view-panel="settings"]',
  );
  if (profilePanel) profilePanel.dataset.viewPanel = "profile";

  const main = document.querySelector<HTMLElement>(".dashboard-main");
  if (!main) throw new Error("MISSING_DASHBOARD_MAIN");

  for (const moduleId of morroProModules) {
    if (document.querySelector(`[data-view-panel="${moduleId}"]`)) continue;
    const section = document.createElement("section");
    section.className = "view";
    section.dataset.viewPanel = moduleId;
    section.innerHTML = `
      <div class="empty-state">
        <h2></h2>
        <p></p>
      </div>
    `;
    const access = section.querySelector("h2");
    const description = section.querySelector("p");
    if (access) access.textContent = moduleId;
    if (description) description.textContent = moduleDescriptions[moduleId];
    main.append(section);
  }
}

function renderMorroProNavigation(
  document: Document,
  access: readonly MorroProModuleAccess[],
  activate: (view: BusinessDashboardView) => void,
): void {
  const nav = document.querySelector<HTMLElement>(".sidebar-nav");
  if (!nav) throw new Error("MISSING_DASHBOARD_NAV");
  nav.replaceChildren();
  for (const moduleAccess of access) {
    if (!moduleAccess.visible) continue;
    const button = document.createElement("button");
    button.className = "nav-item";
    button.type = "button";
    button.dataset.dashboardView = moduleAccess.id;
    button.textContent = moduleAccess.label;
    button.setAttribute(
      "aria-label",
      moduleAccess.mutable
        ? moduleAccess.label
        : `${moduleAccess.label} — somente leitura`,
    );
    button.addEventListener("click", () => activate(moduleAccess.id));
    nav.append(button);
  }
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

function referenceSlug(value: string, maximumLength = 32): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, maximumLength)
    .replace(/-+$/gu, "");
}

export function createMorroProOfferReference(
  businessId: string,
  placeName: string,
  label: string,
): string {
  const businessReference = referenceSlug(businessId, 32);
  const placeReference = referenceSlug(placeName, 32);
  const offerReference = referenceSlug(label, 32);
  if (!businessReference || !placeReference || !offerReference) {
    throw new Error("Referência da oferta inválida.");
  }
  return `morro-pro:${businessReference}:place-${placeReference}:${offerReference}`;
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
            <option value="transport">Transporte / passagem</option>
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
  placeName: string,
): MorroProOfferInput {
  const label = surface.label.value.trim();
  const productKind =
    surface.kind.value === "tour" || surface.kind.value === "transport"
      ? surface.kind.value
      : "business_experience";
  return Object.freeze({
    productKind,
    productReference: createMorroProOfferReference(
      businessId,
      placeName,
      label,
    ),
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
  ensureMorroProPanels(document);
  const offersSurface = createOfferSurface(document);

  let activeProfile: BusinessProfile | null = null;
  let businessId = "";
  let contextController: BusinessContextController | null = null;

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

  async function reloadOffers(signal?: AbortSignal): Promise<void> {
    if (!businessId) return;
    offersSurface.status.textContent = "Atualizando inventário…";
    const offers = await dashboardClient.listOffers(businessId, signal);
    renderOffers(document, offersSurface.list, offers, (offer) => {
      const request = contextController?.request();
      const targetBusinessId = request?.businessId ?? businessId;
      offersSurface.status.textContent = "Desativando oferta…";
      void dashboardClient
        .disableOffer(targetBusinessId, offer.id)
        .then(async () => {
          if (request && !contextController?.isCurrent(request)) return;
          await reloadOffers(request?.signal);
        })
        .then(() => {
          if (request && !contextController?.isCurrent(request)) return;
          offersSurface.status.textContent = "Oferta desativada.";
        })
        .catch((error: unknown) => {
          if (request && !contextController?.isCurrent(request)) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
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
    const request = contextController?.request();
    const targetBusinessId = request?.businessId ?? businessId;
    void dashboardClient
      .saveProfile(targetBusinessId, nextProfile)
      .then((saved) => {
        if (request && !contextController?.isCurrent(request)) return;
        renderProfile(saved);
        status.textContent = "Perfil salvo com segurança.";
      })
      .catch((error: unknown) => {
        if (request && !contextController?.isCurrent(request)) return;
        status.textContent =
          error instanceof Error ? error.message : "Falha ao salvar perfil.";
      });
  });

  let offerSubmissionPending = false;
  offersSurface.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (offerSubmissionPending) return;
    offersSurface.status.textContent = "Publicando oferta…";
    try {
      const input = offerInput(
        offersSurface,
        businessId,
        activeProfile?.name ?? nameInput.value,
      );
      const key = requestKey(document);
      const request = contextController?.request();
      const targetBusinessId = request?.businessId ?? businessId;
      offerSubmissionPending = true;
      offersSurface.form.setAttribute("aria-busy", "true");
      void dashboardClient
        .createOffer(targetBusinessId, input, key)
        .then(async () => {
          if (request && !contextController?.isCurrent(request)) return;
          await reloadOffers(request?.signal);
        })
        .then(() => {
          if (request && !contextController?.isCurrent(request)) return;
          offersSurface.form.reset();
          offersSurface.capacity.value = "20";
          offersSurface.maxPerReservation.value = "4";
          offersSurface.status.textContent = "Oferta publicada no inventário.";
        })
        .catch((error: unknown) => {
          if (request && !contextController?.isCurrent(request)) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          offersSurface.status.textContent =
            error instanceof Error
              ? error.message
              : "Falha ao publicar oferta.";
        })
        .finally(() => {
          offerSubmissionPending = false;
          offersSurface.form.removeAttribute("aria-busy");
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
    contextController = createBusinessContextController(
      bootstrap.session,
      businessId,
    );

    renderProfile(bootstrap.profile);
    const access = resolveMorroProModuleAccess(
      bootstrap.session.user.role,
      bootstrap.session.user.capabilities,
      [],
    );
    const accessByModule = new Map(
      access.map((item) => [item.id, item] as const),
    );
    const profileAccess = accessByModule.get("profile");
    if (!profileAccess?.mutable) {
      form
        .querySelectorAll<
          HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
        >("input, textarea, button[type=submit]")
        .forEach((control) => {
          control.disabled = true;
        });
      status.textContent = "Seu acesso ao perfil é somente leitura.";
    }
    const offersAccess = accessByModule.get("offers");
    if (!offersAccess?.mutable) {
      offersSurface.form
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLButtonElement
        >("input, select, button[type=submit]")
        .forEach((control) => {
          control.disabled = true;
        });
      offersSurface.status.textContent =
        offersAccess?.visible === true
          ? "Seu acesso a ofertas é somente leitura."
          : "";
    }

    const activateAuthorizedView = (view: BusinessDashboardView): void => {
      const moduleAccess = accessByModule.get(view);
      if (!moduleAccess?.visible) return;
      activateView(view);
      if (view === "offers") {
        const request = contextController?.request();
        void reloadOffers(request?.signal).catch((error: unknown) => {
          if (request && !contextController?.isCurrent(request)) return;
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          offersSurface.status.textContent =
            error instanceof Error
              ? error.message
              : "Falha ao carregar ofertas.";
        });
      }
    };

    renderMorroProNavigation(document, access, (view) => {
      activateAuthorizedView(view);
    });
    document
      .querySelectorAll<HTMLElement>("[data-dashboard-view]")
      .forEach((button) => {
        if (button.closest(".sidebar-nav")) return;
        const view = button.dataset.dashboardView as
          | BusinessDashboardView
          | undefined;
        if (!view || !businessDashboardViews.includes(view)) return;
        const moduleAccess = accessByModule.get(view);
        if (!moduleAccess?.visible) {
          button.hidden = true;
          return;
        }
        if (!moduleAccess.mutable && view === "offers") {
          button.hidden = true;
          return;
        }
        button.addEventListener("click", () => activateAuthorizedView(view));
      });

    const scopes = contextController.scopes();
    if (scopes.length > 1) {
      const header = requiredElement<HTMLElement>(
        document,
        "business-name",
      ).parentElement;
      if (!header) throw new Error("MISSING_BUSINESS_HEADER");
      const label = document.createElement("label");
      label.className = "business-context";
      label.textContent = "Negócio";
      const selector = document.createElement("select");
      selector.id = "business-context-selector";
      selector.setAttribute("aria-label", "Selecionar negócio");
      for (const scope of scopes) {
        const option = document.createElement("option");
        option.value = scope;
        option.textContent = scope;
        option.selected = scope === businessId;
        selector.append(option);
      }
      selector.addEventListener("change", () => {
        try {
          const request = contextController?.switchTo(selector.value);
          if (!request) return;
          businessId = request.businessId;
          status.textContent = "Trocando contexto do negócio…";
          offersSurface.status.textContent = "";
          offersSurface.list.replaceChildren();
          renderProfile(null);
          void dashboardClient
            .loadProfile(request.businessId, request.signal)
            .then(async (profile) => {
              if (!contextController?.isCurrent(request)) return;
              renderProfile(profile);
              const offersPanel = document.querySelector<HTMLElement>(
                '[data-view-panel="offers"]',
              );
              if (offersPanel?.classList.contains("active")) {
                await reloadOffers(request.signal);
                if (!contextController?.isCurrent(request)) return;
              }
              status.textContent = "";
            })
            .catch((error: unknown) => {
              if (!contextController?.isCurrent(request)) return;
              if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
              status.textContent =
                error instanceof Error
                  ? error.message
                  : "Falha ao trocar contexto do negócio.";
            });
        } catch (error: unknown) {
          selector.value = businessId;
          status.textContent =
            error instanceof Error ? error.message : "Negócio não autorizado.";
        }
      });
      label.append(selector);
      header.append(label);
    }

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
