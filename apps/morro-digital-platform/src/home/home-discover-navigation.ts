const ASSISTANT_OPEN_REQUEST_EVENT = "morro:assistant-open-request";
const ASSISTANT_CLOSE_REQUEST_EVENT = "morro:assistant-close-request";
const EXPLORE_RESET_REQUEST_EVENT = "morro:explore-reset-requested";

type HomeLocale = "pt" | "en" | "es" | "he";

interface HomeCopy {
  readonly explore: string;
  readonly tours: string;
  readonly saved: string;
  readonly tickets: string;
  readonly profile: string;
  readonly profileEyebrow: string;
  readonly profileTitle: string;
  readonly profileDescription: string;
  readonly assistantSettings: string;
  readonly privacy: string;
  readonly closeProfile: string;
}

const COPY: Readonly<Record<HomeLocale, HomeCopy>> = Object.freeze({
  pt: Object.freeze({
    explore: "Explorar",
    tours: "Tours",
    saved: "Salvos",
    tickets: "Ingressos",
    profile: "Perfil",
    profileEyebrow: "Morro Digital",
    profileTitle: "Perfil e preferências",
    profileDescription: "Ajuste voz, idioma e privacidade sem sair do mapa.",
    assistantSettings: "Configurações do assistente",
    privacy: "Privacidade e LGPD",
    closeProfile: "Fechar perfil",
  }),
  en: Object.freeze({
    explore: "Explore",
    tours: "Tours",
    saved: "Saved",
    tickets: "Tickets",
    profile: "Profile",
    profileEyebrow: "Morro Digital",
    profileTitle: "Profile and preferences",
    profileDescription: "Adjust voice, language and privacy without leaving the map.",
    assistantSettings: "Assistant settings",
    privacy: "Privacy and LGPD",
    closeProfile: "Close profile",
  }),
  es: Object.freeze({
    explore: "Explorar",
    tours: "Tours",
    saved: "Guardados",
    tickets: "Entradas",
    profile: "Perfil",
    profileEyebrow: "Morro Digital",
    profileTitle: "Perfil y preferencias",
    profileDescription: "Ajusta voz, idioma y privacidad sin salir del mapa.",
    assistantSettings: "Configuración del asistente",
    privacy: "Privacidad y LGPD",
    closeProfile: "Cerrar perfil",
  }),
  he: Object.freeze({
    explore: "לגלות",
    tours: "סיורים",
    saved: "שמורים",
    tickets: "כרטיסים",
    profile: "פרופיל",
    profileEyebrow: "Morro Digital",
    profileTitle: "פרופיל והעדפות",
    profileDescription: "אפשר לשנות קול, שפה ופרטיות בלי לצאת מהמפה.",
    assistantSettings: "הגדרות העוזר",
    privacy: "פרטיות ו-LGPD",
    closeProfile: "סגירת הפרופיל",
  }),
});

export interface HomeDiscoverNavigationOptions {
  readonly document: Document;
  readonly openPrivacyPreferences: () => void;
}

export interface HomeDiscoverNavigationController {
  closeProfile(): void;
  destroy(): void;
}

function normalizeLocale(locale: string): HomeLocale {
  const value = locale.trim().toLowerCase();
  if (value.startsWith("en")) return "en";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("he") || value.startsWith("iw")) return "he";
  return "pt";
}

function dispatch(document: Document, type: string, detail?: unknown): void {
  if (detail === undefined) {
    document.dispatchEvent(new Event(type));
    return;
  }
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

export function installHomeDiscoverNavigation({
  document,
  openPrivacyPreferences,
}: HomeDiscoverNavigationOptions): HomeDiscoverNavigationController {
  const nav = document.getElementById("home-bottom-navigation");
  const profilePanel = document.getElementById("home-profile-panel");
  const profileButton = document.getElementById(
    "home-profile-button",
  ) as HTMLButtonElement | null;
  const profileClose = document.getElementById(
    "home-profile-close",
  ) as HTMLButtonElement | null;
  const privacyButton = document.getElementById(
    "home-privacy-button",
  ) as HTMLButtonElement | null;
  const configButton = document.getElementById(
    "configButton",
  ) as HTMLButtonElement | null;
  const composer = document.getElementById("assistant-input-area");
  const assistantInput = document.getElementById(
    "assistantInput",
  ) as HTMLInputElement | null;
  let destroyed = false;
  let blurTimer: number | undefined;

  const setActive = (action: string): void => {
    nav
      ?.querySelectorAll<HTMLElement>("[data-home-nav-action]")
      .forEach((item) => {
        const active = item.dataset.homeNavAction === action;
        item.classList.toggle("is-active", active);
        if (active && item.tagName !== "A") {
          item.setAttribute("aria-current", "page");
        } else {
          item.removeAttribute("aria-current");
        }
      });
  };

  const renderLocale = (): void => {
    const copy = COPY[normalizeLocale(document.documentElement.lang || "pt")];
    document
      .querySelectorAll<HTMLElement>("[data-home-copy]")
      .forEach((element) => {
        const key = element.dataset.homeCopy as keyof HomeCopy | undefined;
        if (key && copy[key]) element.textContent = copy[key];
      });
    document
      .querySelectorAll<HTMLElement>("[data-home-copy-aria]")
      .forEach((element) => {
        const key = element.dataset.homeCopyAria as keyof HomeCopy | undefined;
        if (key && copy[key]) element.setAttribute("aria-label", copy[key]);
      });
    nav?.setAttribute(
      "aria-label",
      normalizeLocale(document.documentElement.lang || "pt") === "pt"
        ? "Navegação principal"
        : copy.explore,
    );
  };

  const closeProfile = (): void => {
    if (!profilePanel || !profileButton) return;
    profilePanel.classList.add("hidden");
    profilePanel.setAttribute("aria-hidden", "true");
    profileButton.setAttribute("aria-expanded", "false");
    setActive("explore");
  };

  const openProfile = (): void => {
    if (!profilePanel || !profileButton) return;
    dispatch(document, ASSISTANT_CLOSE_REQUEST_EVENT);
    profilePanel.classList.remove("hidden");
    profilePanel.setAttribute("aria-hidden", "false");
    profileButton.setAttribute("aria-expanded", "true");
    setActive("profile");
    profileClose?.focus();
  };

  const toggleProfile = (): void => {
    if (profilePanel?.classList.contains("hidden")) openProfile();
    else closeProfile();
  };

  const expandComposer = (): void => {
    if (!composer) return;
    composer.classList.remove("is-compact");
    composer.classList.add("is-expanded");
    composer.dataset.homeAssistantEntry = "expanded";
  };

  const collapseComposer = (): void => {
    if (!composer || assistantInput?.value.trim()) return;
    composer.classList.remove("is-expanded");
    composer.classList.add("is-compact");
    composer.dataset.homeAssistantEntry = "compact";
  };

  const onComposerFocusIn = (): void => {
    if (blurTimer !== undefined) {
      document.defaultView?.clearTimeout(blurTimer);
      blurTimer = undefined;
    }
    closeProfile();
    expandComposer();
  };

  const onComposerFocusOut = (): void => {
    if (blurTimer !== undefined) document.defaultView?.clearTimeout(blurTimer);
    blurTimer = document.defaultView?.setTimeout(() => {
      blurTimer = undefined;
      const active = document.activeElement;
      if (!composer?.contains(active)) collapseComposer();
    }, 120);
  };

  const onNavClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>("[data-home-nav-action]");
    if (!item || item.tagName === "A") return;
    const action = item.dataset.homeNavAction;
    if (!action) return;

    if (action === "explore") {
      closeProfile();
      collapseComposer();
      dispatch(document, ASSISTANT_CLOSE_REQUEST_EVENT);
      dispatch(document, EXPLORE_RESET_REQUEST_EVENT);
      setActive("explore");
      return;
    }
    if (action === "tours" || action === "saved") {
      closeProfile();
      expandComposer();
      dispatch(document, ASSISTANT_OPEN_REQUEST_EVENT);
      dispatch(document, "morro:assistant-option-selected", {
        value: action === "tours" ? "tours" : "favorites",
      });
      setActive(action);
      return;
    }
    if (action === "profile") toggleProfile();
  };

  const onPrivacyClick = (): void => {
    closeProfile();
    openPrivacyPreferences();
  };

  const onConfigClick = (): void => {
    closeProfile();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || profilePanel?.classList.contains("hidden")) {
      return;
    }
    event.preventDefault();
    closeProfile();
    profileButton?.focus();
  };

  const localeObserver = new MutationObserver(renderLocale);
  localeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  renderLocale();
  setActive("explore");
  nav?.addEventListener("click", onNavClick);
  profileClose?.addEventListener("click", closeProfile);
  privacyButton?.addEventListener("click", onPrivacyClick);
  configButton?.addEventListener("click", onConfigClick);
  composer?.addEventListener("focusin", onComposerFocusIn);
  composer?.addEventListener("focusout", onComposerFocusOut);
  document.addEventListener("keydown", onKeyDown);

  return Object.freeze({
    closeProfile,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (blurTimer !== undefined) {
        document.defaultView?.clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      localeObserver.disconnect();
      nav?.removeEventListener("click", onNavClick);
      profileClose?.removeEventListener("click", closeProfile);
      privacyButton?.removeEventListener("click", onPrivacyClick);
      configButton?.removeEventListener("click", onConfigClick);
      composer?.removeEventListener("focusin", onComposerFocusIn);
      composer?.removeEventListener("focusout", onComposerFocusOut);
      document.removeEventListener("keydown", onKeyDown);
    },
  });
}
