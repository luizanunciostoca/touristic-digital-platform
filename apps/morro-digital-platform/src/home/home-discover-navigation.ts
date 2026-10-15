import {
  createManualPlaceSearch,
  type ManualSearchSnapshot,
} from "./manual-place-search.js";
import { getMorroDigitalApplication } from "../main.js";
import { createAssistantUserProfileManager } from "@touristic/assistant";
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
  readonly profilePreferences: string;
  readonly profileQuickActions: string;
  readonly profileExpandedNote: string;
  readonly expandProfile: string;
  readonly collapseProfile: string;
  readonly closeProfile: string;
}

const COPY: Readonly<Record<HomeLocale, HomeCopy>> = Object.freeze({
  pt: Object.freeze({
    explore: "Mapa",
    tours: "Buscar",
    saved: "Roteiro",
    tickets: "Reservas",
    profile: "Perfil",
    profileEyebrow: "Morro Digital",
    profileTitle: "Perfil e preferências",
    profileDescription: "Ajuste sua experiência sem tirar o mapa de cena.",
    assistantSettings: "Configurações do assistente",
    privacy: "Privacidade e LGPD",
    profilePreferences: "Preferências",
    profileQuickActions: "Atalhos do perfil",
    profileExpandedNote:
      "Idioma, voz e privacidade continuam acessíveis sem tirar você do mapa.",
    expandProfile: "Expandir perfil",
    collapseProfile: "Recolher perfil",
    closeProfile: "Fechar perfil",
  }),
  en: Object.freeze({
    explore: "Map",
    tours: "Search",
    saved: "Itinerary",
    tickets: "Bookings",
    profile: "Profile",
    profileEyebrow: "Morro Digital",
    profileTitle: "Profile and preferences",
    profileDescription:
      "Adjust your experience without taking the map out of view.",
    assistantSettings: "Assistant settings",
    privacy: "Privacy and LGPD",
    profilePreferences: "Preferences",
    profileQuickActions: "Profile shortcuts",
    profileExpandedNote:
      "Language, voice and privacy stay accessible without taking you away from the map.",
    expandProfile: "Expand profile",
    collapseProfile: "Collapse profile",
    closeProfile: "Close profile",
  }),
  es: Object.freeze({
    explore: "Mapa",
    tours: "Buscar",
    saved: "Itinerario",
    tickets: "Reservas",
    profile: "Perfil",
    profileEyebrow: "Morro Digital",
    profileTitle: "Perfil y preferencias",
    profileDescription: "Ajusta tu experiencia sin quitar el mapa de escena.",
    assistantSettings: "Configuración del asistente",
    privacy: "Privacidad y LGPD",
    profilePreferences: "Preferencias",
    profileQuickActions: "Atajos del perfil",
    profileExpandedNote:
      "Idioma, voz y privacidad siguen accesibles sin sacarte del mapa.",
    expandProfile: "Expandir perfil",
    collapseProfile: "Contraer perfil",
    closeProfile: "Cerrar perfil",
  }),
  he: Object.freeze({
    explore: "מפה",
    tours: "חיפוש",
    saved: "מסלול",
    tickets: "הזמנות",
    profile: "פרופיל",
    profileEyebrow: "Morro Digital",
    profileTitle: "פרופיל והעדפות",
    profileDescription: "אפשר להתאים את החוויה בלי להסתיר את המפה.",
    assistantSettings: "הגדרות העוזר",
    privacy: "פרטיות ו-LGPD",
    profilePreferences: "העדפות",
    profileQuickActions: "קיצורי דרך בפרופיל",
    profileExpandedNote:
      "שפה, קול ופרטיות נשארים נגישים בלי להוציא אותך מהמפה.",
    expandProfile: "הרחבת הפרופיל",
    collapseProfile: "כיווץ הפרופיל",
    closeProfile: "סגירת הפרופיל",
  }),
});

const MANUAL_COPY = {
  pt: [
    "Buscar lugares",
    "Nome do lugar",
    "Todas as categorias",
    "Praias",
    "Restaurantes",
    "Passeios",
    "Buscar",
    "Fechar",
    "Buscando…",
    "Catálogo publicado",
    "Catálogo local; serviço indisponível. Dados podem estar desatualizados.",
    "Nenhum lugar encontrado.",
    "Salvos neste dispositivo",
    "Não há salvos neste dispositivo. Itinerários e percursos salvos ainda não estão disponíveis nesta tela.",
    "Mapa indisponível. Tente novamente após carregar o mapa.",
    "Não foi possível ler os salvos deste dispositivo.",
    "Itinerários e percursos salvos ainda não estão disponíveis nesta tela.",
    "Anterior",
    "Próxima",
  ],
  en: [
    "Find places",
    "Place name",
    "All categories",
    "Beaches",
    "Restaurants",
    "Tours",
    "Search",
    "Close",
    "Searching…",
    "Published catalog",
    "Local catalog; service unavailable. Data may be outdated.",
    "No places found.",
    "Saved on this device",
    "Nothing saved on this device. Saved itineraries and routes are not available here yet.",
    "Map unavailable. Try again after the map loads.",
    "Could not read saved places on this device.",
    "Saved itineraries and routes are not available here yet.",
    "Previous",
    "Next",
  ],
  es: [
    "Buscar lugares",
    "Nombre del lugar",
    "Todas las categorías",
    "Playas",
    "Restaurantes",
    "Paseos",
    "Buscar",
    "Cerrar",
    "Buscando…",
    "Catálogo publicado",
    "Catálogo local; servicio no disponible. Los datos pueden estar desactualizados.",
    "No se encontraron lugares.",
    "Guardados en este dispositivo",
    "Sin guardados en este dispositivo. Los itinerarios y recorridos guardados aún no están disponibles aquí.",
    "Mapa no disponible. Inténtalo cuando cargue el mapa.",
    "No se pudieron leer los guardados del dispositivo.",
    "Los itinerarios y recorridos guardados aún no están disponibles aquí.",
    "Anterior",
    "Siguiente",
  ],
  he: [
    "חיפוש מקומות",
    "שם המקום",
    "כל הקטגוריות",
    "חופים",
    "מסעדות",
    "סיורים",
    "חיפוש",
    "סגירה",
    "מחפש…",
    "קטלוג מפורסם",
    "קטלוג מקומי; השירות אינו זמין. הנתונים עשויים להיות לא עדכניים.",
    "לא נמצאו מקומות.",
    "שמורים במכשיר זה",
    "אין שמורים במכשיר זה. מסלולים שמורים עדיין אינם זמינים כאן.",
    "המפה אינה זמינה. נסו שוב לאחר טעינת המפה.",
    "לא ניתן לקרוא מקומות שמורים במכשיר זה.",
    "מסלולים שמורים עדיין אינם זמינים כאן.",
    "הקודם",
    "הבא",
  ],
} as const;

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
  const profileExpand = document.getElementById(
    "home-profile-expand",
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

  const currentCopy = (): HomeCopy =>
    COPY[normalizeLocale(document.documentElement.lang || "pt")];

  const syncProfileExpansionCopy = (): void => {
    if (!profilePanel || !profileExpand) return;
    const expanded = profilePanel.dataset.profileExpanded === "true";
    const copy = currentCopy();
    const label = expanded ? copy.collapseProfile : copy.expandProfile;
    profileExpand.setAttribute("aria-label", label);
    profileExpand.setAttribute("title", label);
  };

  const setProfileExpanded = (expanded: boolean): void => {
    if (!profilePanel || !profileExpand) return;
    profilePanel.dataset.profileExpanded = expanded ? "true" : "false";
    profileExpand.setAttribute("aria-expanded", expanded ? "true" : "false");
    syncProfileExpansionCopy();
  };

  const renderLocale = (): void => {
    const copy = currentCopy();
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
    syncProfileExpansionCopy();
  };

  const closeProfile = (): void => {
    if (!profilePanel || !profileButton) return;
    setProfileExpanded(false);
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
    setProfileExpanded(false);
    setActive("profile");
    profileClose?.focus();
  };

  const toggleProfile = (): void => {
    if (profilePanel?.classList.contains("hidden")) openProfile();
    else closeProfile();
  };

  const toggleProfileExpansion = (): void => {
    if (!profilePanel) return;
    setProfileExpanded(profilePanel.dataset.profileExpanded !== "true");
  };

  const searchPlaces = createManualPlaceSearch();
  const manualPanel = document.createElement("section");
  manualPanel.id = "home-manual-panel";
  manualPanel.className = "md-home-manual-panel";
  manualPanel.hidden = true;
  manualPanel.setAttribute("aria-labelledby", "home-manual-title");
  document.body.append(manualPanel);
  let searchAbort: AbortController | undefined;
  let manualAction = "tours";
  let manualPanelGeneration = 0;
  let manualSearchState:
    | {
        query: string;
        category: string;
        snapshot: ManualSearchSnapshot;
        page: number;
      }
    | undefined;
  const manualCopy = () =>
    MANUAL_COPY[normalizeLocale(document.documentElement.lang || "pt")];
  const closeManual = (restoreFocus = false): void => {
    manualPanelGeneration += 1;
    searchAbort?.abort();
    manualPanel.hidden = true;
    if (restoreFocus)
      nav
        ?.querySelector<HTMLElement>(`[data-home-nav-action="${manualAction}"]`)
        ?.focus();
  };
  const openManual = (action: string, preserveSearch = false): void => {
    closeProfile();
    closeManual();
    const panelGeneration = manualPanelGeneration;
    const panelIsCurrent = () =>
      !destroyed &&
      panelGeneration === manualPanelGeneration &&
      !manualPanel.hidden;
    manualAction = action;
    if (!preserveSearch) manualSearchState = undefined;
    setActive(action);
    const copy = manualCopy();
    manualPanel.replaceChildren();
    const heading = document.createElement("h2");
    heading.id = "home-manual-title";
    heading.textContent = action === "saved" ? copy[12] : copy[0];
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = copy[7];
    close.onclick = () => {
      closeManual(true);
      setActive("explore");
    };
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const list = document.createElement("ul");
    manualPanel.append(heading, close, status, list);
    manualPanel.hidden = false;
    const select = async (place: {
      name: string;
      category?: string;
      placeId?: string;
    }): Promise<void> => {
      const explore = getMorroDigitalApplication(document)?.exploreLocations;
      const selected =
        explore &&
        (await explore.execute(
          place.placeId
            ? { type: "select_place_id", placeId: place.placeId }
            : {
                type: "select_place",
                place: place.name,
                ...(place.category ? { category: place.category } : {}),
              },
        ));
      if (!panelIsCurrent()) return;
      if (selected) closeManual();
      else status.textContent = copy[14];
    };
    const addRow = (place: {
      name: string;
      category?: string;
      placeId?: string;
    }): void => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = place.name;
      button.onclick = () => {
        void select(place).catch(() => {
          if (panelIsCurrent()) status.textContent = copy[14];
        });
      };
      row.append(button);
      list.append(row);
    };
    if (action === "saved") {
      try {
        const storage = document.defaultView?.localStorage;
        // Profile manager load normally updates visits; prevent writes from this read-only surface.
        const snapshot = storage?.getItem("morro_user_profile") ?? null;
        const places = createAssistantUserProfileManager({
          storage: { getItem: () => snapshot, setItem: () => {} },
        })
          .getFavoritePlaces()
          .filter(
            (place) => typeof place.name === "string" && place.name.trim(),
          );
        status.textContent = places.length ? copy[16] : copy[13];
        places.forEach((place) =>
          addRow({
            name: place.name,
            ...(place.category ? { category: place.category } : {}),
          }),
        );
      } catch {
        status.textContent = copy[15];
      }
      close.focus();
      return;
    }
    const form = document.createElement("form");
    const input = document.createElement("input");
    input.type = "search";
    input.setAttribute("aria-label", copy[1]);
    input.placeholder = copy[1];
    const category = document.createElement("select");
    category.setAttribute("aria-label", copy[2]);
    ["", "beaches", "restaurants", "tours"].forEach((value, index) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = copy[index + 2] ?? copy[2];
      category.append(option);
    });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = copy[6];
    form.append(input, category, submit);
    manualPanel.insertBefore(form, status);
    const pager = document.createElement("div");
    pager.className = "md-home-manual-pagination";
    const previous = document.createElement("button");
    const next = document.createElement("button");
    previous.type = next.type = "button";
    previous.textContent = copy[17];
    next.textContent = copy[18];
    previous.dataset.manualPage = "previous";
    next.dataset.manualPage = "next";
    pager.append(previous, next);
    pager.hidden = true;
    manualPanel.append(pager);
    let pageGeneration = 0;
    const renderPage = async (
      page: number,
      abort: AbortController,
      focusResult = false,
    ): Promise<void> => {
      const state = manualSearchState;
      if (!state || abort.signal.aborted || destroyed) return;
      const generation = ++pageGeneration;
      const valid = state.snapshot.results.filter(
        (result) =>
          result.name.trim() &&
          result.category.trim() &&
          Number.isFinite(result.latitude) &&
          Number.isFinite(result.longitude) &&
          Math.abs(result.latitude) <= 90 &&
          Math.abs(result.longitude) <= 180,
      );
      const lastPage = Math.max(0, Math.ceil(valid.length / 20) - 1);
      state.page = Math.max(0, Math.min(page, lastPage));
      const start = state.page * 20;
      const displayed = valid.slice(start, start + 20);
      previous.disabled = next.disabled = true;
      list.replaceChildren();
      const explore = getMorroDigitalApplication(document)?.exploreLocations;
      // The map indexes only 20 results: install the current UI page before selection.
      const ready =
        explore &&
        (await explore.execute({
          type: "show_search_results",
          query: state.query,
          results: displayed,
          status: displayed.length ? "ready" : "empty",
        }));
      if (abort.signal.aborted || destroyed || generation !== pageGeneration)
        return;
      status.textContent = `${state.snapshot.source === "local" ? copy[10] : copy[9]} · ${displayed.length ? start + 1 : 0}–${start + displayed.length} / ${valid.length}${displayed.length ? "" : ` · ${copy[11]}`}${ready ? "" : ` · ${copy[14]}`}`;
      displayed.forEach(addRow);
      pager.hidden = valid.length <= 20;
      previous.disabled = state.page === 0;
      next.disabled = state.page === lastPage;
      if (focusResult) list.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const changePage = (delta: number): void => {
      if (!manualSearchState || !searchAbort) return;
      void renderPage(manualSearchState.page + delta, searchAbort, true).catch(
        () => {
          status.textContent = copy[14];
        },
      );
    };
    previous.onclick = () => changePage(-1);
    next.onclick = () => changePage(1);
    form.onsubmit = (event) => {
      event.preventDefault();
      searchAbort?.abort();
      const abort = new AbortController();
      searchAbort = abort;
      const query = input.value;
      const selectedCategory = category.value;
      manualSearchState = undefined;
      status.textContent = copy[8];
      list.replaceChildren();
      pager.hidden = true;
      void searchPlaces(query, selectedCategory, abort.signal)
        .then(async (snapshot) => {
          if (abort.signal.aborted || destroyed) return;
          manualSearchState = {
            query,
            category: selectedCategory,
            snapshot,
            page: 0,
          };
          await renderPage(0, abort);
        })
        .catch(() => {
          if (!abort.signal.aborted && !destroyed)
            status.textContent = copy[14];
        });
    };
    if (preserveSearch && manualSearchState) {
      input.value = manualSearchState.query;
      category.value = manualSearchState.category;
      searchAbort = new AbortController();
      void renderPage(manualSearchState.page, searchAbort).catch(() => {
        status.textContent = copy[14];
      });
    }
    input.focus();
  };

  const onProfileAction = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionButton = target.closest<HTMLElement>("[data-profile-action]");
    const action = actionButton?.dataset.profileAction;
    if (action !== "saved" && action !== "tours") return;

    openManual(action);
  };

  const expandComposer = (): void => {
    if (!composer) return;
    composer.classList.add("is-focused");
    composer.dataset.homeAssistantEntry = "focused";
  };

  const collapseComposer = (): void => {
    if (!composer || assistantInput?.value.trim()) return;
    composer.classList.remove("is-focused");
    composer.dataset.homeAssistantEntry = "persistent";
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
      closeManual();
      closeProfile();
      collapseComposer();
      dispatch(document, ASSISTANT_CLOSE_REQUEST_EVENT);
      dispatch(document, EXPLORE_RESET_REQUEST_EVENT);
      setActive("explore");
      return;
    }
    if (action === "tours" || action === "saved") {
      openManual(action);
      return;
    }
    if (action === "profile") {
      closeManual();
      toggleProfile();
    }
  };

  const onPrivacyClick = (): void => {
    closeProfile();
    openPrivacyPreferences();
  };

  const onConfigClick = (): void => {
    closeProfile();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !manualPanel.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeManual(true);
      setActive("explore");
      return;
    }
    if (event.key !== "Escape" || profilePanel?.classList.contains("hidden")) {
      return;
    }
    event.preventDefault();
    closeProfile();
    profileButton?.focus();
  };

  const localeObserver = new MutationObserver(() => {
    renderLocale();
    if (!manualPanel.hidden) openManual(manualAction, true);
  });
  localeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  renderLocale();
  setActive("explore");
  nav?.addEventListener("click", onNavClick);
  profileClose?.addEventListener("click", closeProfile);
  profileExpand?.addEventListener("click", toggleProfileExpansion);
  profilePanel?.addEventListener("click", onProfileAction);
  privacyButton?.addEventListener("click", onPrivacyClick);
  configButton?.addEventListener("click", onConfigClick);
  composer?.addEventListener("focusin", onComposerFocusIn);
  composer?.addEventListener("focusout", onComposerFocusOut);
  document.addEventListener("keydown", onKeyDown, true);

  return Object.freeze({
    closeProfile,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (blurTimer !== undefined) {
        document.defaultView?.clearTimeout(blurTimer);
        blurTimer = undefined;
      }
      closeManual();
      manualPanel.remove();
      localeObserver.disconnect();
      nav?.removeEventListener("click", onNavClick);
      profileClose?.removeEventListener("click", closeProfile);
      profileExpand?.removeEventListener("click", toggleProfileExpansion);
      profilePanel?.removeEventListener("click", onProfileAction);
      privacyButton?.removeEventListener("click", onPrivacyClick);
      configButton?.removeEventListener("click", onConfigClick);
      composer?.removeEventListener("focusin", onComposerFocusIn);
      composer?.removeEventListener("focusout", onComposerFocusOut);
      document.removeEventListener("keydown", onKeyDown, true);
    },
  });
}
