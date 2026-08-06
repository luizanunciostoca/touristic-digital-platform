import type {
  ActionViewModel,
  AppShellViewModel,
  FeedbackViewModel,
  HeaderViewModel,
  ModalViewModel,
  NavigationViewModel,
} from "@touristic/design-system";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderAction(action: ActionViewModel): string {
  if (action.hidden) return "";

  const disabled = action.disabled ? " disabled" : "";
  const busy = action.loading ? ' aria-busy="true"' : "";

  return `<button class="tdp-action tdp-action--${action.variant} tdp-action--${action.size}" type="button" aria-label="${escapeHtml(action.ariaLabel)}"${disabled}${busy}>${escapeHtml(action.label)}</button>`;
}

export function renderHeader(header: HeaderViewModel): string {
  if (header.hidden) return "";

  const subtitle = header.subtitle
    ? `<p class="tdp-header__subtitle">${escapeHtml(header.subtitle)}</p>`
    : "";
  const actions = header.actions.length
    ? `<div class="tdp-header__actions">${header.actions.map(renderAction).join("")}</div>`
    : "";

  return `<header class="tdp-header" aria-label="${escapeHtml(header.ariaLabel)}"><div class="tdp-header__brand"><h1 class="tdp-header__title">${escapeHtml(header.title)}</h1>${subtitle}</div>${actions}</header>`;
}

export function renderNavigation(navigation: NavigationViewModel): string {
  if (navigation.hidden) return "";

  const items = navigation.items
    .map((item) => {
      const current = item.active ? ' aria-current="page"' : "";
      const disabled = item.disabled ? ' aria-disabled="true" tabindex="-1"' : "";
      return `<li class="tdp-navigation__item"><a class="tdp-navigation__link${item.active ? " is-active" : ""}" href="${escapeHtml(item.href)}"${current}${disabled}>${escapeHtml(item.label)}</a></li>`;
    })
    .join("");

  return `<nav class="tdp-navigation tdp-navigation--${navigation.orientation}" aria-label="${escapeHtml(navigation.ariaLabel)}"><ul class="tdp-navigation__list">${items}</ul></nav>`;
}

export function renderFeedback(feedback: FeedbackViewModel): string {
  if (feedback.hidden) return "";

  const message = feedback.message
    ? `<p class="tdp-feedback__message">${escapeHtml(feedback.message)}</p>`
    : "";
  const action = feedback.action ? renderAction(feedback.action) : "";

  return `<section class="tdp-feedback tdp-feedback--${feedback.status}" role="status" aria-label="${escapeHtml(feedback.ariaLabel)}"><h2 class="tdp-feedback__title">${escapeHtml(feedback.title)}</h2>${message}${action}</section>`;
}

export function renderModal(modal: ModalViewModel): string {
  if (modal.hidden) return "";

  const description = modal.description
    ? `<p class="tdp-modal__description">${escapeHtml(modal.description)}</p>`
    : "";

  return `<div class="tdp-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(modal.ariaLabel)}"><div class="tdp-modal__surface"><button class="tdp-modal__close" type="button" aria-label="${escapeHtml(modal.closeLabel)}">×</button><h2 class="tdp-modal__title">${escapeHtml(modal.title)}</h2>${description}</div></div>`;
}

export function renderAppShell(
  shell: AppShellViewModel,
  mainContent: string,
): string {
  if (shell.hidden) return "";

  const header = shell.header ? renderHeader(shell.header) : "";
  const navigation = shell.navigation
    ? renderNavigation(shell.navigation)
    : "";
  const overlay = shell.overlayOpen
    ? '<div class="tdp-overlay" aria-hidden="true"></div>'
    : "";

  return `<div class="tdp-app-shell" data-destination-id="${escapeHtml(shell.destinationId)}" data-status="${shell.status}" aria-label="${escapeHtml(shell.ariaLabel)}">${header}${navigation}<main class="tdp-main" id="main-content">${mainContent}</main>${overlay}</div>`;
}
