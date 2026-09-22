const app = document.querySelector("#app");
const menuButton = document.querySelector("#menu-button");
const sidebar = document.querySelector("#sidebar");
const notificationButton = document.querySelector("#notification-button");
const notificationPanel = document.querySelector("#notification-panel");
const profileButton = document.querySelector("#profile-button");
const userMenuPanel = document.querySelector("#user-menu-panel");

const popovers = [
  [notificationButton, notificationPanel],
  [profileButton, userMenuPanel],
];

function sidebarIsOpen() {
  return Boolean(
    app?.classList.contains("menu-open") ||
      app?.classList.contains("sidebar-open"),
  );
}

function focusFirstSidebarControl() {
  if (!sidebar || !sidebarIsOpen()) return;
  const target = sidebar.querySelector(
    ".nav-item:not([disabled]), button:not([disabled]), a[href]",
  );
  target?.focus({ preventScroll: true });
}

function closePopoverAndRestoreFocus() {
  for (const [button, panel] of popovers) {
    if (!button || !panel || panel.hidden) continue;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus({ preventScroll: true });
    return true;
  }
  return false;
}

menuButton?.addEventListener("click", () => {
  queueMicrotask(() => {
    if (
      globalThis.matchMedia("(max-width: 1199px)").matches &&
      sidebarIsOpen()
    ) {
      focusFirstSidebarControl();
    }
  });
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape" || sidebarIsOpen()) return;
    if (closePopoverAndRestoreFocus()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);

for (const [, panel] of popovers) {
  panel?.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [
      ...panel.querySelectorAll(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])",
      ),
    ].filter((node) => !node.hidden && node.getClientRects().length > 0);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

const tableObserver = new MutationObserver(() => {
  document.querySelectorAll(".home-table-wrap").forEach((wrapper) => {
    if (!wrapper.hasAttribute("tabindex")) wrapper.tabIndex = 0;
    if (!wrapper.hasAttribute("aria-label")) {
      wrapper.setAttribute("aria-label", "Tabela com rolagem horizontal");
    }
  });
});

tableObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.querySelectorAll(".home-table-wrap").forEach((wrapper) => {
  if (!wrapper.hasAttribute("tabindex")) wrapper.tabIndex = 0;
  if (!wrapper.hasAttribute("aria-label")) {
    wrapper.setAttribute("aria-label", "Tabela com rolagem horizontal");
  }
});
