const POSITIVE_STATUSES = new Set([
  "active",
  "available",
  "ready",
  "pass",
  "success",
  "approved",
  "operational",
]);

const PARTIAL_STATUSES = new Set([
  "warning",
  "partial",
  "runtime-projection",
  "pending",
]);

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function statusBadge(value, { label = value } = {}) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  const tone = POSITIVE_STATUSES.has(normalized)
    ? "pass"
    : PARTIAL_STATUSES.has(normalized)
      ? "partial"
      : "gap";
  return `<span class="badge ${tone}">${escapeHtml(label || "indisponível")}</span>`;
}

function statePanel(
  kind,
  title,
  description,
  { actions = "", compact = false } = {},
) {
  const role = kind === "error" ? ' role="alert"' : "";
  const busy = kind === "loading" ? ' aria-busy="true"' : "";
  return `<section class="card state-panel state-panel--${escapeHtml(kind)} ${compact ? "state-panel--compact" : ""}"${role}${busy}>
    <strong>${escapeHtml(title)}</strong>
    ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    ${actions ? `<div class="state-actions">${actions}</div>` : ""}
  </section>`;
}

export function loadingState(
  title = "Carregando…",
  description = "Aguarde enquanto os dados administrativos são consultados.",
) {
  return statePanel("loading", title, description);
}

export function emptyState(title, description = "", options = {}) {
  return statePanel("empty", title, description, options);
}

export function errorState(title, description = "", options = {}) {
  return statePanel("error", title, description, options);
}

export function partialState(title, description = "", options = {}) {
  return statePanel("partial", title, description, options);
}

export function sectionHeader({
  title,
  description = "",
  meta = "",
  action = "",
}) {
  return `<div class="section-title">
    <div>
      <h2>${escapeHtml(title)}</h2>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
    </div>
    ${meta || action ? `<div class="section-title__actions">${meta}${action}</div>` : ""}
  </div>`;
}

export function entityHeader({ entityType, entityId, scope, tabs = [] }) {
  const tabMarkup = tabs
    .map(
      (tab, index) =>
        `<span class="entity-tab ${index === 0 ? "active" : ""}" ${index === 0 ? 'aria-current="page"' : ""}>${escapeHtml(tab)}</span>`,
    )
    .join("");
  const tabNavigation = tabMarkup
    ? `<nav class="entity-tabs" aria-label="Visão 360°" tabindex="0">${tabMarkup}</nav>`
    : "";
  return `<section class="card entity-header" data-ux-v1="true">
    <div class="entity-header__top">
      <div>
        <h2>${escapeHtml(entityType + " · " + entityId)}</h2>
        <div class="entity-header__meta">
          <span>${escapeHtml(scope)}</span>
          <span>Visão 360° administrativa</span>
        </div>
      </div>
    </div>
    ${tabNavigation}
  </section>`;
}

function tableLabel(wrap, index) {
  if (wrap.getAttribute("aria-label")) return wrap.getAttribute("aria-label");
  const section = wrap.closest("section");
  const heading = section?.querySelector("h2, h3");
  if (heading?.textContent?.trim()) return heading.textContent.trim();
  const pageTitle = document.querySelector("#page-title")?.textContent?.trim();
  return pageTitle
    ? `${pageTitle} — tabela ${index + 1}`
    : `Tabela administrativa ${index + 1}`;
}

export function enhanceDataTables(root = document) {
  root.querySelectorAll(".table-wrap").forEach((wrap, wrapIndex) => {
    wrap.classList.add("responsive-cards");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", tableLabel(wrap, wrapIndex));

    const table = wrap.querySelector("table");
    if (!table) return;

    const headers = [...table.querySelectorAll("thead th")];
    headers.forEach((header) => header.setAttribute("scope", "col"));
    const labels = headers.map((header) => header.textContent?.trim() ?? "");

    table.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName !== "TD") return;
        if (labels[index]) cell.dataset.label = labels[index];
        cell
          .querySelectorAll("code")
          .forEach((node) => node.classList.add("long-token"));
        cell
          .querySelectorAll("button, a")
          .forEach((node) => node.classList.add("table-action"));
      });
    });
  });
}

export function enhanceCriticalActions(root = document) {
  root.querySelectorAll("form").forEach((form) => {
    const confirmation = form.querySelector(
      'input[name="confirmation"], #session-revoke-confirmation',
    );
    const stepUp = form.querySelector(
      'input[type="password"][autocomplete="current-password"]',
    );
    if (!confirmation || !stepUp) return;

    form.classList.add("critical-action-form");
    form.dataset.criticalAction = "true";
    if (!form.getAttribute("aria-label")) {
      const heading =
        form.querySelector("h2, h3") ??
        form.closest("section")?.querySelector("h2, h3");
      form.setAttribute(
        "aria-label",
        heading?.textContent?.trim() || "Ação administrativa crítica",
      );
    }
  });
}

export function enhanceControlCenterSurface(root = document) {
  enhanceDataTables(root);
  enhanceCriticalActions(root);
}
