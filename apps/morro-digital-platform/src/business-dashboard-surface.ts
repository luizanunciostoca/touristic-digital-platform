import type { DashboardAuthClient } from "@touristic/auth-browser";
import {
  normalizeBusinessProfile,
  type BusinessProfile,
} from "@touristic/business";
import type { BusinessDashboardClient } from "./business-dashboard-client.js";
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
