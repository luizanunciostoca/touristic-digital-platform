import type {
  ActionViewModel,
  AppShellViewModel,
  FeedbackViewModel,
  HeaderViewModel,
  ModalViewModel,
  NavigationViewModel,
} from "../index.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function classes(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function renderAction(model: ActionViewModel): string {
  return `<button type="button" class="${classes("tdp-action", `tdp-action--${model.variant}`, `tdp-action--${model.size}`)}" aria-label="${escapeHtml(model.ariaLabel)}"${model.disabled ? " disabled" : ""}${model.hidden ? " hidden" : ""}>${escapeHtml(model.label)}</button>`;
}

export function renderHeader(model: HeaderViewModel): string {
  const actions = model.actions.map(renderAction).join("");
  return `<header class="tdp-header" aria-label="${escapeHtml(model.ariaLabel)}"${model.hidden ? " hidden" : ""}><div class="tdp-header__content"><div class="tdp-header__identity"><h1 class="tdp-header__title">${escapeHtml(model.title)}</h1>${model.subtitle ? `<p class="tdp-header__subtitle">${escapeHtml(model.subtitle)}</p>` : ""}</div>${actions ? `<div class="tdp-header__actions">${actions}</div>` : ""}</div></header>`;
}

export function renderNavigation(model: NavigationViewModel): string {
  const items = model.items
    .map(
      (item) =>
        `<li class="tdp-navigation__item"><a class="${classes("tdp-navigation__link", item.active && "is-active", item.disabled && "is-disabled")}" href="${escapeHtml(item.href)}"${item.active ? ' aria-current="page"' : ""}${item.disabled ? ' aria-disabled="true" tabindex="-1"' : ""}>${escapeHtml(item.label)}</a></li>`,
    )
    .join("");

  return `<nav class="${classes("tdp-navigation", `tdp-navigation--${model.orientation}`, model.expanded && "is-expanded")}" aria-label="${escapeHtml(model.ariaLabel)}"${model.hidden ? " hidden" : ""}><ul class="tdp-navigation__list">${items}</ul></nav>`;
}

export function renderFeedback(model: FeedbackViewModel): string {
  return `<section class="${classes("tdp-feedback", `tdp-feedback--${model.status}`)}" role="status" aria-label="${escapeHtml(model.ariaLabel)}"${model.hidden ? " hidden" : ""}><h2 class="tdp-feedback__title">${escapeHtml(model.title)}</h2>${model.message ? `<p class="tdp-feedback__message">${escapeHtml(model.message)}</p>` : ""}${model.action ? renderAction(model.action) : ""}</section>`;
}

export function renderModal(model: ModalViewModel): string {
  return `<section class="tdp-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(model.ariaLabel)}"${model.hidden ? " hidden" : ""}><div class="tdp-modal__panel"><header class="tdp-modal__header"><h2>${escapeHtml(model.title)}</h2><button type="button" class="tdp-modal__close" aria-label="${escapeHtml(model.closeLabel)}">×</button></header>${model.description ? `<p class="tdp-modal__description">${escapeHtml(model.description)}</p>` : ""}</div></section>`;
}

export function renderAppShell(model: AppShellViewModel, content: string): string {
  return `<div class="tdp-app-shell" data-destination-id="${escapeHtml(model.destinationId)}" aria-label="${escapeHtml(model.ariaLabel)}"${model.hidden ? " hidden" : ""}>${model.header ? renderHeader(model.header) : ""}<div class="tdp-app-shell__body">${model.navigation ? renderNavigation(model.navigation) : ""}<main class="tdp-app-shell__main" id="main-content">${content}</main></div>${model.overlayOpen ? '<div class="tdp-overlay" aria-hidden="true"></div>' : ""}</div>`;
}
