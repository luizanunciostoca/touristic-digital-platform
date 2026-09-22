import { createDashboardAuthClient } from "@touristic/auth-browser";

const app = document.querySelector("#app");
const nav = document.querySelector("#main-nav");
const menuButton = document.querySelector("#menu-button");
const backdrop = document.querySelector("#sidebar-backdrop");
const notificationButton = document.querySelector("#notification-button");
const notificationPanel = document.querySelector("#notification-panel");
const profileButton = document.querySelector("#profile-button");
const userMenuPanel = document.querySelector("#user-menu-panel");
const userMenuLogout = document.querySelector("#user-menu-logout");
const logoutButton = document.querySelector("#logout-button");
const actorCard = document.querySelector("#actor-card");
const profileName = document.querySelector("#profile-name");
const profileAvatar = document.querySelector("#profile-avatar");
const userMenuName = document.querySelector("#user-menu-name");
const userMenuRole = document.querySelector("#user-menu-role");
const globalScope = document.querySelector("#global-scope");
const destinationSelector = document.querySelector("#destination-selector");

const shellAuth = createDashboardAuthClient({
  fetchFn: globalThis.fetch.bind(globalThis),
  storage: globalThis.sessionStorage,
  location: globalThis.location,
});

const selectedNavKey = "md_control_center_shell_nav_v1";
const destinationContextKey = "md_control_center_destination_context_v1";
const destinationScopeKey = "md_control_center_destination_scope_v1";

const groups = [
  {
    label: "Principal",
    items: [
      {
        key: "global",
        label: "Visão Global",
        view: "overview",
        icon: "globe",
        canonical: true,
      },
    ],
  },
  {
    label: "Operação",
    items: [
      { key: "overview", label: "Visão Geral", view: "overview", icon: "home" },
    ],
  },
  {
    label: "Relacionamentos",
    items: [
      {
        key: "businesses",
        label: "Empresas",
        view: "businesses",
        icon: "building",
        canonical: true,
      },
      {
        key: "users",
        label: "Usuários",
        view: "users",
        icon: "users",
        canonical: true,
      },
      {
        key: "affiliates",
        label: "Afiliados",
        view: "affiliates",
        icon: "network",
        canonical: true,
      },
    ],
  },
  {
    label: "Comercial",
    items: [
      { key: "crm", label: "CRM", view: "crm", icon: "chat", canonical: true },
      {
        key: "products",
        label: "Produtos",
        view: "products",
        icon: "box",
        canonical: true,
      },
      { key: "offers", label: "Ofertas", view: "products", icon: "tag" },
    ],
  },
  {
    label: "Reservas",
    items: [
      {
        key: "reservations",
        label: "Reservas",
        view: "reservations",
        icon: "calendar",
        canonical: true,
      },
      {
        key: "ticketing",
        label: "Ticketing",
        view: "ticketing",
        icon: "ticket",
        canonical: true,
      },
      { key: "checkin", label: "Check-in", view: "ticketing", icon: "check" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      {
        key: "orders",
        label: "Pedidos",
        view: "orders",
        icon: "cart",
        canonical: true,
      },
      {
        key: "payments",
        label: "Pagamentos",
        view: "financial",
        icon: "card",
        canonical: true,
      },
      {
        key: "refunds",
        label: "Reembolsos",
        view: "financial",
        icon: "return",
      },
      {
        key: "commissions",
        label: "Comissões",
        view: "financial",
        icon: "percent",
      },
    ],
  },
  {
    label: "Controle",
    items: [
      {
        key: "support",
        label: "Suporte",
        view: "support",
        icon: "headset",
        canonical: true,
      },
      {
        key: "audit",
        label: "Auditoria",
        view: "audit",
        icon: "audit",
        canonical: true,
      },
    ],
  },
  {
    label: "Plataforma",
    items: [
      {
        key: "system",
        label: "Sistema",
        view: "system",
        icon: "server",
        canonical: true,
      },
      {
        key: "integrations",
        label: "Integrações",
        view: "settings",
        icon: "link",
      },
      {
        key: "settings",
        label: "Configurações",
        view: "settings",
        icon: "settings",
        canonical: true,
      },
    ],
  },
];

const allItems = groups.flatMap((group) => group.items);

const iconPaths = {
  globe:
    '<circle cx="12" cy="12" r="8"></circle><path d="M4 12h16M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16"></path>',
  home: '<path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"></path>',
  building: '<path d="M5 20V5h10v15M15 9h4v11M8 8h4M8 12h4M8 16h4"></path>',
  users:
    '<circle cx="9" cy="8" r="3"></circle><path d="M3.5 19c.7-3 2.5-5 5.5-5s4.8 2 5.5 5M16 6.5a2.5 2.5 0 0 1 0 5M16 14c2.2.2 3.7 1.7 4.2 4"></path>',
  network:
    '<circle cx="6" cy="7" r="2"></circle><circle cx="18" cy="7" r="2"></circle><circle cx="12" cy="18" r="2"></circle><path d="m7.7 8.1 3.1 7.6M16.3 8.1l-3.1 7.6M8 7h8"></path>',
  chat: '<path d="M5 5h14v10H9l-4 4z"></path><path d="M8 9h8M8 12h5"></path>',
  box: '<path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"></path>',
  tag: '<path d="M4 5v6l8 8 7-7-8-8H5a1 1 0 0 0-1 1Z"></path><circle cx="8" cy="8" r="1"></circle>',
  calendar:
    '<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16"></path>',
  ticket:
    '<path d="M4 8a2 2 0 0 0 0 4v5h16v-5a2 2 0 0 0 0-4V5H4z"></path><path d="M12 7v8"></path>',
  check:
    '<circle cx="12" cy="12" r="8"></circle><path d="m8.5 12 2.2 2.2 4.8-5"></path>',
  cart: '<path d="M3 5h2l2 10h10l2-7H6M9 19h.01M17 19h.01"></path>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><path d="M3 10h18M7 15h4"></path>',
  return: '<path d="M8 7H5v-3M5 7a8 8 0 1 1-1 9"></path>',
  percent:
    '<path d="m7 17 10-10"></path><circle cx="7" cy="7" r="2"></circle><circle cx="17" cy="17" r="2"></circle>',
  headset:
    '<path d="M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v6H5a1 1 0 0 1-1-1zM20 13h-3v6h2a1 1 0 0 0 1-1zM17 19c0 1.1-1.8 2-4 2"></path>',
  audit: '<path d="M7 4h10v16H7zM9 4V2h6v2M10 9h4M10 13h4M10 17h3"></path>',
  server:
    '<rect x="4" y="4" width="16" height="6" rx="1"></rect><rect x="4" y="14" width="16" height="6" rx="1"></rect><path d="M8 7h.01M8 17h.01"></path>',
  link: '<path d="M10 13a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11 6.3M14 11a4 4 0 0 0-5.7 0L6 13.3A4 4 0 0 0 11.7 19l1.3-1.3"></path>',
  settings:
    '<circle cx="12" cy="12" r="3"></circle><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2L3 14.5l2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2.1-1.5a7 7 0 0 0 .1-1Z"></path>',
};

function icon(name) {
  return (
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    (iconPaths[name] || iconPaths.home) +
    "</svg>"
  );
}

function routeFromHash() {
  const raw = (globalThis.location.hash || "#overview").slice(1);
  return raw.split(":", 1)[0] || "overview";
}

function selectedItem() {
  const route = routeFromHash();
  const stored = globalThis.sessionStorage.getItem(selectedNavKey);
  const storedItem = allItems.find((item) => item.key === stored);
  if (storedItem?.view === route) return storedItem;
  return (
    allItems.find((item) => item.view === route && item.canonical) ||
    allItems.find((item) => item.view === route) ||
    allItems[0]
  );
}

function navButton(item) {
  const active = selectedItem().key === item.key;
  const coreRoute = item.canonical ? ' data-view="' + item.view + '"' : "";
  return (
    '<button type="button" class="nav-item' +
    (active ? " active" : "") +
    '" data-shell-key="' +
    item.key +
    '" data-shell-view="' +
    item.view +
    '"' +
    coreRoute +
    (active ? ' aria-current="page"' : "") +
    '><span class="nav-icon">' +
    icon(item.icon) +
    "</span><span>" +
    item.label +
    "</span></button>"
  );
}

function rebuildNav() {
  if (!nav) return;
  if (
    nav.querySelector(".nav-group") &&
    nav.querySelector("[data-shell-key]")
  ) {
    syncActive();
    return;
  }
  nav.innerHTML = groups
    .map(
      (group) =>
        '<section class="nav-group" aria-label="' +
        group.label +
        '"><p class="nav-group-label">' +
        group.label +
        '</p><div class="nav-group-items">' +
        group.items.map(navButton).join("") +
        "</div></section>",
    )
    .join("");
  syncActive();
}

function syncActive() {
  if (!nav) return;
  const selected = selectedItem();
  nav.querySelectorAll("[data-shell-key]").forEach((button) => {
    const active = button.dataset.shellKey === selected.key;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}


function readDestinationContext() {
  return globalThis.sessionStorage.getItem(destinationContextKey) || "";
}

function syncScopeControls() {
  if (!globalScope || !destinationSelector) return;
  const scope = globalThis.sessionStorage.getItem(destinationScopeKey) || "global";
  globalScope.setAttribute("aria-pressed", String(scope === "global"));
  destinationSelector.dataset.scope = scope;
  const current = readDestinationContext();
  if (current && [...destinationSelector.options].some((option) => option.value === current)) {
    destinationSelector.value = current;
  }
}

async function hydrateDestinationSelector() {
  if (!destinationSelector) return;
  try {
    const response = await shellAuth.secureFetch("/api/admin/v1/destinations", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("DESTINATION_CONTEXT_UNAVAILABLE");
    const body = await response.json();
    const destinations = Array.isArray(body.destinations) ? body.destinations : [];
    const readable = destinations.filter((destination) => destination?.id);
    if (!readable.length) {
      syncScopeControls();
      return;
    }

    destinationSelector.innerHTML = readable
      .map((destination) => {
        const name =
          destination.branding?.name ||
          destination.branding?.shortName ||
          destination.id;
        return '<option value="' +
          String(destination.id).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") +
          '">' +
          String(name).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") +
          "</option>";
      })
      .join("");

    const stored = readDestinationContext();
    const fallback =
      readable.find((destination) => destination.status === "active")?.id ||
      readable[0].id;
    const selected = readable.some((destination) => destination.id === stored)
      ? stored
      : fallback;
    globalThis.sessionStorage.setItem(destinationContextKey, selected);
    destinationSelector.value = selected;
    syncScopeControls();
  } catch {
    destinationSelector.dataset.state = "unavailable";
    syncScopeControls();
  }
}

function selectDestinationContext(destinationId) {
  if (!destinationId) return;
  globalThis.sessionStorage.setItem(destinationContextKey, destinationId);
  globalThis.sessionStorage.setItem(destinationScopeKey, "destination");
  syncScopeControls();
  globalThis.dispatchEvent(
    new CustomEvent("md:destination-context-changed", {
      detail: { scope: "destination", destinationId },
    }),
  );
}

function closeSidebar({ restoreFocus = false } = {}) {
  if (!app) return;
  app.classList.remove("menu-open", "sidebar-open");
  if (backdrop) backdrop.hidden = true;
  if (menuButton) {
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir navegação");
    if (restoreFocus) menuButton.focus();
  }
}

function syncSidebarState() {
  if (!app || !menuButton || !backdrop) return;
  const open =
    app.classList.contains("menu-open") ||
    app.classList.contains("sidebar-open");
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute(
    "aria-label",
    open ? "Fechar navegação" : "Abrir navegação",
  );
  backdrop.hidden = !open;
}

function togglePopover(button, panel) {
  if (!button || !panel) return;
  const opening = panel.hidden;
  for (const [otherButton, otherPanel] of [
    [notificationButton, notificationPanel],
    [profileButton, userMenuPanel],
  ]) {
    if (otherPanel && otherPanel !== panel) otherPanel.hidden = true;
    if (otherButton && otherButton !== button)
      otherButton.setAttribute("aria-expanded", "false");
  }
  panel.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
}

function closePopovers() {
  for (const [button, panel] of [
    [notificationButton, notificationPanel],
    [profileButton, userMenuPanel],
  ]) {
    if (panel) panel.hidden = true;
    if (button) button.setAttribute("aria-expanded", "false");
  }
}

function syncActorIdentity() {
  if (!actorCard) return;
  const text = actorCard.textContent?.trim();
  if (!text) return;
  const strong = actorCard.querySelector("strong")?.textContent?.trim();
  const name = strong || text.split(/\s+/u)[0] || "Admin";
  if (profileName) profileName.textContent = name;
  if (profileAvatar)
    profileAvatar.textContent = name.charAt(0).toLocaleUpperCase("pt-BR");
  if (userMenuName) userMenuName.textContent = name;
  if (userMenuRole) {
    const role = [...actorCard.querySelectorAll("*")]
      .map((node) => node.textContent?.trim())
      .find((value) => value && /OWNER|ADMIN|SUPPORT|AUDITOR/u.test(value));
    userMenuRole.textContent = role || "Sessão protegida";
  }
}

nav?.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest("[data-shell-key]");
    if (!button) return;
    globalThis.sessionStorage.setItem(selectedNavKey, button.dataset.shellKey);
    syncActive();
    const view = button.dataset.shellView;
    if (!button.hasAttribute("data-view") && view) {
      globalThis.location.hash = "#" + view;
    }
    if (globalThis.matchMedia("(max-width: 1199px)").matches) closeSidebar();
  },
  true,
);

nav?.addEventListener("focusin", (event) => {
  const item = event.target.closest(".nav-item");
  item?.scrollIntoView({ block: "nearest", inline: "nearest" });
});

menuButton?.addEventListener("click", () => {
  queueMicrotask(() => {
    if (app?.classList.contains("menu-open")) app.classList.add("sidebar-open");
    else app?.classList.toggle("sidebar-open");
    syncSidebarState();
  });
});

backdrop?.addEventListener("click", () => closeSidebar({ restoreFocus: true }));

notificationButton?.addEventListener("click", () =>
  togglePopover(notificationButton, notificationPanel),
);

profileButton?.addEventListener("click", () =>
  togglePopover(profileButton, userMenuPanel),
);

userMenuLogout?.addEventListener("click", () => logoutButton?.click());

globalScope?.addEventListener("click", () => {
  globalThis.sessionStorage.setItem(selectedNavKey, "global");
  globalThis.sessionStorage.setItem(destinationScopeKey, "global");
  globalThis.location.hash = "#overview";
  syncActive();
  syncScopeControls();
  globalThis.dispatchEvent(
    new CustomEvent("md:destination-context-changed", {
      detail: {
        scope: "global",
        destinationId: readDestinationContext() || null,
      },
    }),
  );
});

destinationSelector?.addEventListener("change", (event) => {
  selectDestinationContext(event.currentTarget.value);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const sidebarOpen =
    app?.classList.contains("menu-open") ||
    app?.classList.contains("sidebar-open");
  if (sidebarOpen) {
    event.preventDefault();
    closeSidebar({ restoreFocus: true });
    return;
  }
  closePopovers();
});

document.addEventListener("click", (event) => {
  if (
    !event.target.closest(".topbar-popover-host") &&
    !event.target.closest(".topbar-popover")
  ) {
    closePopovers();
  }
});

globalThis.addEventListener("hashchange", () => {
  const current = globalThis.sessionStorage.getItem(selectedNavKey);
  const item = allItems.find((candidate) => candidate.key === current);
  if (!item || item.view !== routeFromHash()) {
    const fallback =
      allItems.find(
        (candidate) =>
          candidate.view === routeFromHash() && candidate.canonical,
      ) || allItems.find((candidate) => candidate.view === routeFromHash());
    if (fallback)
      globalThis.sessionStorage.setItem(selectedNavKey, fallback.key);
  }
  queueMicrotask(() => {
    rebuildNav();
    syncActive();
  });
});

globalThis.addEventListener("resize", () => {
  if (!globalThis.matchMedia("(max-width: 1199px)").matches) closeSidebar();
});

if (nav) {
  new MutationObserver(() => {
    if (!nav.querySelector(".nav-group")) queueMicrotask(rebuildNav);
  }).observe(nav, { childList: true });
}

if (actorCard) {
  new MutationObserver(syncActorIdentity).observe(actorCard, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

rebuildNav();
syncActorIdentity();
syncSidebarState();
syncScopeControls();
void hydrateDestinationSelector();
