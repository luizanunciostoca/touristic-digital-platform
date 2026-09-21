import { createDashboardAuthClient } from "@touristic/auth-browser";

const navItems = [
  ["overview", "Visão Geral", "◫"],
  ["businesses", "Empresas", "▦"],
  ["users", "Usuários", "●"],
  ["affiliates", "Afiliados", "◇"],
  ["crm", "CRM", "◈"],
  ["products", "Produtos e Ofertas", "▤"],
  ["reservations", "Reservas", "▣"],
  ["ticketing", "Ticketing", "◉"],
  ["orders", "Pedidos", "≡"],
  ["financial", "Financeiro", "◐"],
  ["content", "Conteúdo", "✦"],
  ["destinations", "Destinos", "⌖"],
  ["support", "Suporte", "◎"],
  ["audit", "Auditoria", "⌁"],
  ["system", "Sistema", "⚙"],
  ["settings", "Configurações", "⋯"],
];

const pageCopy = {
  overview: [
    "Visão Geral",
    "Estado operacional e administrativo da plataforma em uma única visão.",
  ],
  businesses: [
    "Empresas",
    "Diretório administrativo e contexto de tenants sem quebrar o domínio Business.",
  ],
  users: [
    "Usuários",
    "Identidades, papéis, capabilities e vínculos empresariais.",
  ],
  affiliates: [
    "Afiliados",
    "Programa de afiliados mantendo Financial como autoridade monetária.",
  ],
  crm: [
    "CRM",
    "Leads, pipeline, reuniões, propostas, contratos, follow-ups, referrals e trials.",
  ],
  products: [
    "Produtos e Ofertas",
    "Catálogo administrativo através dos contratos do domínio owner.",
  ],
  reservations: [
    "Reservas",
    "Reservas, disponibilidade e estados operacionais.",
  ],
  ticketing: [
    "Ticketing",
    "Tickets, check-in, validação, cancelamentos e histórico.",
  ],
  orders: ["Pedidos", "Pedidos e vínculos transacionais com pagamento."],
  financial: [
    "Financeiro",
    "Consulta financeira segura; nenhuma edição arbitrária de saldo.",
  ],
  content: ["Conteúdo", "Conteúdo editorial e publicação governada."],
  destinations: [
    "Destinos",
    "Configuração e visão administrativa dos destinos da plataforma.",
  ],
  support: ["Suporte", "Sessões de suporte preservando actor e effectiveUser."],
  audit: [
    "Auditoria",
    "Trilha administrativa de ações e decisões de autorização.",
  ],
  system: [
    "Sistema",
    "Health, readiness, providers, versão e identidade do deployment.",
  ],
  settings: [
    "Configurações",
    "Preferências administrativas sem exposição de secrets.",
  ],
};

const app = document.querySelector("#app");
const boot = document.querySelector("#boot");
const nav = document.querySelector("#main-nav");
const content = document.querySelector("#content");
const title = document.querySelector("#page-title");
const description = document.querySelector("#page-description");
const breadcrumb = document.querySelector("#breadcrumb");
const actorCard = document.querySelector("#actor-card");
const healthChip = document.querySelector("#health-chip");
const releaseChip = document.querySelector("#release-chip");
const searchInput = document.querySelector("#global-search");
const searchResults = document.querySelector("#search-results");
const supportBanner = document.querySelector("#support-banner");
const supportContext = document.querySelector("#support-context");
const menuButton = document.querySelector("#menu-button");

const auth = createDashboardAuthClient({
  fetchFn: globalThis.fetch.bind(globalThis),
  storage: globalThis.sessionStorage,
  location: globalThis.location,
});

const state = {
  session: null,
  adminSession: null,
  dashboard: null,
  view: "overview",
};

const controlCenterPreferencesKey = "md_control_center_preferences_v1";
const allowedDefaultViews = new Set(pageCopy ? Object.keys(pageCopy) : []);

function readControlCenterPreferences() {
  try {
    const parsed = JSON.parse(
      globalThis.localStorage.getItem(controlCenterPreferencesKey) || "{}",
    );
    return Object.freeze({
      defaultView: allowedDefaultViews.has(parsed.defaultView)
        ? parsed.defaultView
        : "overview",
      density: parsed.density === "compact" ? "compact" : "comfortable",
      motion: parsed.motion === "reduced" ? "reduced" : "system",
    });
  } catch {
    return Object.freeze({
      defaultView: "overview",
      density: "comfortable",
      motion: "system",
    });
  }
}

function applyControlCenterPreferences(
  preferences = readControlCenterPreferences(),
) {
  document.documentElement.dataset.controlDensity = preferences.density;
  document.documentElement.dataset.controlMotion = preferences.motion;
  return preferences;
}

function saveControlCenterPreferences(preferences) {
  const normalized = Object.freeze({
    defaultView: allowedDefaultViews.has(preferences.defaultView)
      ? preferences.defaultView
      : "overview",
    density: preferences.density === "compact" ? "compact" : "comfortable",
    motion: preferences.motion === "reduced" ? "reduced" : "system",
  });
  globalThis.localStorage.setItem(
    controlCenterPreferencesKey,
    JSON.stringify(normalized),
  );
  applyControlCenterPreferences(normalized);
  return normalized;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, init = {}) {
  const response = await auth.secureFetch(`/api/admin/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "CONTROL_CENTER_REQUEST_FAILED");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function actorHasCapability(capability) {
  return (state.adminSession?.actor?.capabilities ?? []).includes(capability);
}

function contentField(document, key) {
  const value = document?.fields?.[key];
  return typeof value === "string" ? value : "";
}

function renderNav() {
  nav.innerHTML = navItems
    .map(
      ([id, label, icon]) =>
        `<button type="button" class="nav-item ${state.view === id ? "active" : ""}" data-view="${id}">
          <span class="nav-icon">${icon}</span><span>${label}</span>
        </button>`,
    )
    .join("");
}

function setHeading(view) {
  const [label, copy] = pageCopy[view] ?? pageCopy.overview;
  title.textContent = label;
  description.textContent = copy;
  breadcrumb.textContent = `Control Center / ${label}`;
}

function statusBadge(value) {
  const normalized =
    value === "available" ||
    value === "pass" ||
    value === "success" ||
    value === "ready" ||
    value === "active"
      ? "pass"
      : value === "partial" || value === "runtime-projection"
        ? "partial"
        : "gap";
  return `<span class="badge ${normalized}">${escapeHtml(value)}</span>`;
}

function entityTabs(group, tabs) {
  const availableTabs = tabs.filter(
    (tab) => tab && typeof tab.content === "string" && tab.content.trim(),
  );
  if (!availableTabs.length) return "";

  const buttons = availableTabs
    .map(
      (tab, index) =>
        `<button type="button" class="secondary-button" role="tab" id="${escapeHtml(
          `${group}-tab-${tab.id}`,
        )}" aria-controls="${escapeHtml(`${group}-panel-${tab.id}`)}" aria-selected="${
          index === 0 ? "true" : "false"
        }" tabindex="${index === 0 ? "0" : "-1"}" data-entity-tab="${escapeHtml(
          tab.id,
        )}">${escapeHtml(tab.label)}</button>`,
    )
    .join("");

  const panels = availableTabs
    .map(
      (tab, index) =>
        `<section id="${escapeHtml(`${group}-panel-${tab.id}`)}" role="tabpanel" aria-labelledby="${escapeHtml(
          `${group}-tab-${tab.id}`,
        )}" data-entity-panel="${escapeHtml(tab.id)}" ${
          index === 0 ? "" : "hidden"
        }>${tab.content}</section>`,
    )
    .join("");

  return `<div class="entity-360" data-entity-tabs="${escapeHtml(group)}">
    <div role="tablist" aria-label="Seções da visão 360" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">${buttons}</div>
    ${panels}
  </div>`;
}

function bindEntityTabs(root = content) {
  root.querySelectorAll("[data-entity-tabs]").forEach((shell) => {
    const buttons = [...shell.querySelectorAll("[data-entity-tab]")];
    const activate = (button, focus = false) => {
      buttons.forEach((candidate) => {
        const selected = candidate === button;
        candidate.setAttribute("aria-selected", selected ? "true" : "false");
        candidate.tabIndex = selected ? 0 : -1;
        const panel = shell.querySelector(
          `[data-entity-panel="${candidate.dataset.entityTab}"]`,
        );
        if (panel) panel.hidden = !selected;
      });
      if (focus) button.focus();
    };

    shell.addEventListener("click", (event) => {
      const button = event.target.closest("[data-entity-tab]");
      if (button) activate(button);
    });
    shell.addEventListener("keydown", (event) => {
      const current = event.target.closest("[data-entity-tab]");
      if (!current || !buttons.length) return;
      const currentIndex = buttons.indexOf(current);
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % buttons.length;
      else if (event.key === "ArrowLeft")
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = buttons.length - 1;
      else return;
      event.preventDefault();
      activate(buttons[nextIndex], true);
    });
  });
}

function supportEntityContext() {
  const support = state.adminSession?.support;
  if (!support) return "";
  return `<div class="callout" data-entity-support-context>
    <strong>Support Mode:</strong>
    actor real ${escapeHtml(state.adminSession?.actor?.email ?? "—")} ·
    effectiveUser ${escapeHtml(
      support.effectiveUser?.email ?? support.effectiveUser?.id ?? "—",
    )}.
    Leituras delegadas preservam o effectiveUser; ações privilegiadas continuam
    sujeitas à autoridade, capabilities e políticas do actor real.
  </div>`;
}

function canonicalEntityAudit(entries, relation) {
  const source = Array.isArray(entries) ? entries : [];
  const relatedEntityIds = new Set(relation.relatedEntityIds ?? []);
  return source.filter((entry) => {
    if (relation.kind === "business") {
      return (
        entry.tenantId === relation.id ||
        (entry.entityType === "business" && entry.entityId === relation.id) ||
        relatedEntityIds.has(entry.entityId)
      );
    }
    if (relation.kind === "user") {
      return (
        entry.effectiveUserId === relation.id ||
        (entry.entityType === "auth_principal" && entry.entityId === relation.id)
      );
    }
    if (relation.kind === "affiliate") {
      return (
        (entry.entityType === "affiliate" && entry.entityId === relation.id) ||
        relatedEntityIds.has(entry.entityId)
      );
    }
    return false;
  });
}

function auditDeepLink(entry) {
  const id = entry?.entityId ? encodeURIComponent(entry.entityId) : "";
  if (entry?.entityType === "auth_principal" && id) return `#users:${id}`;
  if (entry?.entityType === "payment" && id) return `#financial:${id}`;
  if (entry?.entityType === "reservation" && id) return `#reservations:${id}`;
  if (entry?.entityType === "destination" && id) return `#destinations:${id}`;
  if (entry?.entityType === "content_document" && id) return `#content:${id}`;
  if (entry?.entityType === "ticket_inventory" && id) return `#products:${id}`;
  if (entry?.entityType === "ticketing_operation") return "#ticketing";
  if (entry?.entityType === "affiliate_membership") return "#affiliates";
  if (entry?.entityType === "reconciliation_finding") return "#financial";
  if (entry?.entityType === "auth_session" && entry.effectiveUserId) {
    return `#users:${encodeURIComponent(entry.effectiveUserId)}`;
  }
  return null;
}

function auditFinancialValue(entry) {
  for (const stateValue of [entry?.newState, entry?.previousState]) {
    if (!stateValue || typeof stateValue !== "object") continue;
    for (const amount of [stateValue.amount, stateValue.pricing?.amount]) {
      if (
        amount &&
        Number.isFinite(Number(amount.minorUnits)) &&
        typeof amount.currency === "string"
      ) {
        return `${amount.minorUnits} ${amount.currency} (minor units)`;
      }
    }
    for (const field of ["commissionMinor", "eligibleRevenueMinor"]) {
      if (
        Number.isFinite(Number(stateValue[field])) &&
        typeof stateValue.currency === "string"
      ) {
        return `${stateValue[field]} ${stateValue.currency} (minor units)`;
      }
    }
  }
  return null;
}

function recentActivityMarkup(
  entries,
  {
    title = "Recent Activity",
    emptyMessage = "Nenhuma atividade administrativa neste recorte.",
  } = {},
) {
  const rows = Array.isArray(entries) ? entries : [];
  return `<section class="card section-card" data-recent-activity data-state="${
    rows.length ? "success" : "empty"
  }">
    <div class="section-title">
      <h2>${escapeHtml(title)}</h2>
      <span class="badge">${escapeHtml(rows.length)}</span>
    </div>
    <div class="table-wrap" tabindex="0">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th><th>Actor</th><th>Effective user</th>
            <th>Destino</th><th>Ação / resultado</th><th>Entidade</th>
            <th>Valor</th><th>Link</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows
              .map((entry) => {
                const href = auditDeepLink(entry);
                const financialValue = auditFinancialValue(entry);
                return `<tr>
                  <td>${escapeHtml(entry.timestamp ?? "—")}</td>
                  <td>${escapeHtml(entry.actorUserId ?? "—")}<br><small>${escapeHtml(
                    entry.actorRole ?? "—",
                  )}</small></td>
                  <td>${escapeHtml(entry.effectiveUserId ?? "—")}</td>
                  <td>${escapeHtml(entry.destinationId ?? "—")}</td>
                  <td>${escapeHtml(entry.action ?? "—")}<br>${statusBadge(
                    entry.result ?? "unknown",
                  )}</td>
                  <td>${escapeHtml(entry.entityType ?? "—")}<br><small>${escapeHtml(
                    entry.entityId ?? "—",
                  )}</small></td>
                  <td>${escapeHtml(financialValue ?? "—")}</td>
                  <td>${href ? `<a href="${escapeHtml(href)}">Abrir</a>` : "—"}</td>
                </tr>`;
              })
              .join("") ||
            `<tr><td colspan="8" class="empty">${escapeHtml(emptyMessage)}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  </section>`;
}

async function readOwnerProjection(path, field) {
  try {
    const payload = await api(path);
    return {
      available: true,
      data: Array.isArray(payload?.[field]) ? payload[field] : [],
      error: null,
    };
  } catch (error) {
    return { available: false, data: [], error };
  }
}

function ownerProjectionState(moduleState, available) {
  if (!available) return "unavailable";
  return moduleState === "available" || moduleState === "ready"
    ? "success"
    : "partial";
}

async function renderOverview() {
  const dashboard = state.dashboard;
  const health = dashboard.health ?? { checks: [] };
  const [affiliateOwner, destinationOwner, auditOwner] = await Promise.all([
    readOwnerProjection("/affiliates?limit=100", "data"),
    readOwnerProjection("/destinations", "destinations"),
    readOwnerProjection("/audit?limit=20", "entries"),
  ]);

  const affiliates = affiliateOwner.data;
  const destinations = destinationOwner.data;
  const affiliateSummary = affiliates.reduce(
    (summary, affiliate) => ({
      approved:
        summary.approved + Number(affiliate.approvedMembershipCount || 0),
      suspended:
        summary.suspended + Number(affiliate.suspendedMembershipCount || 0),
      conversions: summary.conversions + Number(affiliate.conversionCount || 0),
    }),
    { approved: 0, suspended: 0, conversions: 0 },
  );
  const activeDestinations = destinations.filter(
    (destination) => destination.status === "active",
  ).length;
  const destinationIssues = destinations.filter(
    (destination) => destination.status !== "active",
  );

  const attention = [];
  for (const check of health.checks ?? []) {
    if (check.status !== "pass") {
      attention.push({
        label: check.name,
        detail: check.detail ?? check.status,
        source: "system",
      });
    }
  }
  for (const [name, module] of Object.entries(dashboard.modules ?? {})) {
    if (!["available", "ready"].includes(module.state)) {
      attention.push({
        label: name,
        detail: `owner ${module.state}`,
        source: "contract",
      });
    }
  }
  for (const destination of destinationIssues) {
    attention.push({
      label: destination.branding?.name ?? destination.id,
      detail: `destino ${destination.status}`,
      source: "destination-owner",
    });
  }
  if (affiliateOwner.available && affiliateSummary.suspended > 0) {
    attention.push({
      label: "Affiliates",
      detail: `${affiliateSummary.suspended} membership(s) suspensa(s)`,
      source: "affiliates-owner",
    });
  }

  const metrics = [
    ["Empresas", dashboard.summary?.businesses ?? "—", "Identity membership owner"],
    ["Usuários", dashboard.summary?.users ?? "—", "Auth owner"],
    ["Alertas", dashboard.summary?.alerts ?? "—", "Health checks fora de PASS"],
    ["Readiness", health.readiness ?? "—", "Saúde agregada da plataforma"],
    [
      "Destinos",
      destinationOwner.available ? destinations.length : "—",
      destinationOwner.available
        ? `${activeDestinations} ativo(s) · Destination owner`
        : "Destination owner indisponível",
    ],
    [
      "Afiliados",
      affiliateOwner.available ? affiliates.length : "—",
      affiliateOwner.available
        ? `${affiliateSummary.approved} membership(s) aprovada(s)`
        : "Affiliates owner indisponível",
    ],
  ];

  content.innerHTML = `
    <div class="grid stats">
      ${metrics
        .map(
          ([label, value, hint]) =>
            `<article class="card stat">
              <span class="stat-label">${escapeHtml(label)}</span>
              <strong class="stat-value">${escapeHtml(value)}</strong>
              <small>${escapeHtml(hint)}</small>
            </article>`,
        )
        .join("")}
    </div>

    <div class="grid two-col">
      <section class="card section-card" data-dashboard-state="${
        health.readiness === "ready" ? "success" : "partial"
      }">
        <div class="section-title">
          <h2>Estado operacional</h2>
          <span class="chip">${escapeHtml(health.readiness ?? "unknown")}</span>
        </div>
        <div class="health-list">
          ${
            (health.checks ?? [])
              .map(
                (check) =>
                  `<div class="health-row">
                    <span><i class="status-dot status-${escapeHtml(
                      check.status,
                    )}"></i>${escapeHtml(check.name)}</span>
                    <small>${escapeHtml(check.detail ?? check.status)}</small>
                  </div>`,
              )
              .join("") || '<div class="empty">Nenhum check disponível.</div>'
          }
        </div>
      </section>

      <section class="card section-card" data-attention-state="${
        attention.length ? "partial" : "success"
      }">
        <div class="section-title">
          <h2>Precisa de atenção</h2>
          <span class="badge ${attention.length ? "partial" : "pass"}">${
            attention.length
          }</span>
        </div>
        <div class="module-list">
          ${
            attention
              .map(
                (item) =>
                  `<div class="module-row"><span>${escapeHtml(
                    item.label,
                  )}<br><small>${escapeHtml(
                    item.source,
                  )}</small></span><strong>${escapeHtml(
                    item.detail,
                  )}</strong></div>`,
              )
              .join("") ||
            '<div class="empty">Nenhuma atenção conhecida nas fontes consultadas.</div>'
          }
        </div>
      </section>
    </div>

    <div class="grid two-col">
      <section class="card section-card" data-owner="destinations" data-state="${ownerProjectionState(
        dashboard.modules?.destinations?.state,
        destinationOwner.available,
      )}">
        <div class="section-title">
          <h2>Destination Summary</h2>
          ${statusBadge(
            ownerProjectionState(
              dashboard.modules?.destinations?.state,
              destinationOwner.available,
            ),
          )}
        </div>
        ${
          destinationOwner.available
            ? `<div class="module-list">
                <div class="module-row"><span>Total owner-backed</span><strong>${escapeHtml(
                  destinations.length,
                )}</strong></div>
                <div class="module-row"><span>Ativos</span><strong>${escapeHtml(
                  activeDestinations,
                )}</strong></div>
                <div class="module-row"><span>Fora de active</span><strong>${escapeHtml(
                  destinationIssues.length,
                )}</strong></div>
              </div>`
            : '<div class="empty">Destination owner indisponível: nenhum valor foi inferido.</div>'
        }
      </section>

      <section class="card section-card" data-owner="affiliates" data-state="${ownerProjectionState(
        dashboard.modules?.affiliates?.state,
        affiliateOwner.available,
      )}">
        <div class="section-title">
          <h2>Affiliate Summary</h2>
          ${statusBadge(
            ownerProjectionState(
              dashboard.modules?.affiliates?.state,
              affiliateOwner.available,
            ),
          )}
        </div>
        ${
          affiliateOwner.available
            ? `<div class="module-list">
                <div class="module-row"><span>Afiliados</span><strong>${escapeHtml(
                  affiliates.length,
                )}</strong></div>
                <div class="module-row"><span>Memberships aprovadas</span><strong>${escapeHtml(
                  affiliateSummary.approved,
                )}</strong></div>
                <div class="module-row"><span>Memberships suspensas</span><strong>${escapeHtml(
                  affiliateSummary.suspended,
                )}</strong></div>
                <div class="module-row"><span>Conversões</span><strong>${escapeHtml(
                  affiliateSummary.conversions,
                )}</strong></div>
              </div>`
            : '<div class="empty">Affiliates owner indisponível: nenhum valor foi inferido.</div>'
        }
      </section>
    </div>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title"><h2>Estado dos owners</h2></div>
      <div class="module-list">
        ${Object.entries(dashboard.modules ?? {})
          .map(
            ([name, module]) =>
              `<div class="module-row"><span>${escapeHtml(
                name,
              )}</span>${statusBadge(module.state)}</div>`,
          )
          .join("")}
      </div>
    </section>

    <div style="margin-top:16px" data-owner="audit" data-state="${
      auditOwner.available
        ? auditOwner.data.length
          ? "success"
          : "empty"
        : "unavailable"
    }">
      ${
        auditOwner.available
          ? recentActivityMarkup(auditOwner.data, {
              title: "Recent Activity",
              emptyMessage: "Nenhuma atividade administrativa registrada.",
            })
          : `<section class="card empty"><strong>Recent Activity indisponível</strong><span>A fonte autoritativa de auditoria não respondeu; nenhum evento foi fabricado.</span></section>`
      }
    </div>`;
}

async function renderUsers(userId) {
  const data = await api(
    userId ? `/users/${encodeURIComponent(userId)}` : "/users",
  );
  const users = userId ? [data.user] : data.users;

  const userTable = `
    <div class="table-wrap" tabindex="0">
      <table>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Estado</th>
            <th>Papel efetivo</th>
            <th>Role configurado</th>
            <th>Empresas</th>
            <th>Capabilities</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map(
              (user) =>
                `<tr>
                  <td><strong>${
                    userId
                      ? escapeHtml(user.email)
                      : `<a href="#users:${encodeURIComponent(user.id)}">${escapeHtml(user.email)}</a>`
                  }</strong><br><small>${escapeHtml(user.id)}</small></td>
                  <td>${statusBadge(user.status ?? "active")}</td>
                  <td>
                    <span class="badge">${escapeHtml(user.canonicalRole)}</span>
                    <br><small>${escapeHtml(user.role)}</small>
                  </td>
                  <td>
                    ${escapeHtml(user.configuredCanonicalRole ?? user.canonicalRole)}
                    <br><small>${escapeHtml(user.configuredRole ?? user.role)}</small>
                  </td>
                  <td>${
                    (user.businessIds ?? [])
                      .map(
                        (businessId) =>
                          `<span class="badge">${escapeHtml(businessId)}</span>`,
                      )
                      .join(" ") || "—"
                  }</td>
                  <td>${escapeHtml((user.capabilities ?? []).join(", "))}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  if (!userId) {
    content.innerHTML = userTable;
    return;
  }

  const sessionData = await api(
    `/users/${encodeURIComponent(userId)}/sessions`,
  );
  const now = Math.floor(Date.now() / 1000);
  const sessions = sessionData.sessions ?? [];
  const selectedUser = users[0];
  const canManageUsers = actorHasCapability("users.manage");
  const supportActive = Boolean(state.adminSession?.support);
  const bootstrapProtected =
    selectedUser.configuredCanonicalRole === "PLATFORM_OWNER";
  const selfTarget = state.adminSession?.actor?.id === selectedUser.id;
  const criticalActionsDisabled =
    !canManageUsers || supportActive || bootstrapProtected;
  const roleOptions = [
    "PLATFORM_OWNER",
    "PLATFORM_ADMIN",
    "SUPPORT",
    "AUDITOR",
    "BUSINESS_OWNER",
    "BUSINESS_MANAGER",
    "BUSINESS_VIEWER",
    "AFFILIATE",
  ]
    .map(
      (role) =>
        `<option value="${role}" ${selectedUser.role === role ? "selected" : ""}>${role}</option>`,
    )
    .join("");
  const statusForSession = (session) => {
    if (session.revokedAt) return "revogada";
    if (session.expiresAt <= now) return "expirada";
    return "ativa";
  };

  content.innerHTML = `
    ${userTable}
    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h2>Estado e permissões</h2>
          <small style="color:var(--muted)">
            Autoridade efetiva persistida pelo Auth; credenciais permanecem fora desta superfície.
          </small>
        </div>
        ${statusBadge(selectedUser.status ?? "active")}
      </div>
      <div class="callout">
        ${
          bootstrapProtected
            ? "Este PLATFORM_OWNER bootstrap é protegido contra bloqueio ou rebaixamento."
            : supportActive
              ? "Ações críticas de usuário ficam bloqueadas durante Support Mode."
              : selfTarget
                ? "Autoproteção ativa: o actor não pode bloquear ou alterar o próprio perfil."
                : "Bloqueio e alteração de perfil revogam sessões ativas e exigem step-up, motivo e confirmação textual."
        }
      </div>
      <div class="grid two-col">
        <form id="user-status-form" class="form-grid">
          <div class="section-title"><h3>Estado da conta</h3></div>
          <label>Sua senha
            <input name="password" type="password" autocomplete="current-password"
              ${criticalActionsDisabled ? "disabled" : ""} required />
          </label>
          <label>Motivo obrigatório
            <textarea name="reason" minlength="8" maxlength="240"
              ${criticalActionsDisabled ? "disabled" : ""} required></textarea>
          </label>
          <label>Confirmação textual
            <input name="confirmation" autocomplete="off"
              placeholder="${selectedUser.status === "blocked" ? "REATIVAR" : "BLOQUEAR"}"
              ${criticalActionsDisabled ? "disabled" : ""} required />
          </label>
          <button class="primary-button" type="submit"
            ${criticalActionsDisabled ? "disabled" : ""}>
            ${selectedUser.status === "blocked" ? "Reativar conta" : "Bloquear conta"}
          </button>
          <p id="user-status-result" role="status" aria-live="polite"></p>
        </form>

        <form id="user-role-form" class="form-grid">
          <div class="section-title"><h3>Perfil efetivo</h3></div>
          <label>Novo perfil
            <select name="role" ${criticalActionsDisabled || selfTarget ? "disabled" : ""} required>
              ${roleOptions}
            </select>
          </label>
          <label>Sua senha
            <input name="password" type="password" autocomplete="current-password"
              ${criticalActionsDisabled || selfTarget ? "disabled" : ""} required />
          </label>
          <label>Motivo obrigatório
            <textarea name="reason" minlength="8" maxlength="240"
              ${criticalActionsDisabled || selfTarget ? "disabled" : ""} required></textarea>
          </label>
          <label>Confirmação textual
            <input name="confirmation" autocomplete="off" placeholder="ALTERAR PERFIL"
              ${criticalActionsDisabled || selfTarget ? "disabled" : ""} required />
          </label>
          <button class="primary-button" type="submit"
            ${criticalActionsDisabled || selfTarget ? "disabled" : ""}>Alterar perfil</button>
          <p id="user-role-result" role="status" aria-live="polite"></p>
        </form>
      </div>
    </section>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h2>Sessões</h2>
          <small style="color:var(--muted)">
            Handles opacos do Auth; tokens e JTI brutos nunca são exibidos.
          </small>
        </div>
        <span class="badge">${sessions.length} registrada(s)</span>
      </div>
      <div class="callout">
        Revogar uma sessão é uma ação de alto risco. Confirme sua senha,
        informe o motivo e digite <strong>REVOGAR</strong>.
      </div>
      <form id="session-revoke-form" class="form-grid">
        <label>
          Sua senha para step-up
          <input
            id="session-step-up-password"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>
        <label>
          Motivo obrigatório
          <textarea
            id="session-revoke-reason"
            minlength="8"
            maxlength="240"
            required
            placeholder="Ex.: Sessão comprometida reportada pelo usuário"
          ></textarea>
        </label>
        <label>
          Confirmação textual
          <input
            id="session-revoke-confirmation"
            type="text"
            autocomplete="off"
            placeholder="Digite REVOGAR"
            required
          />
        </label>
        <p id="session-revoke-status" role="status" style="color:var(--muted);margin:0"></p>
      </form>
      <div class="table-wrap" tabindex="0" style="margin-top:16px">
        <table>
          <thead>
            <tr>
              <th>Handle</th>
              <th>Emitida</th>
              <th>Expira</th>
              <th>Status</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            ${
              sessions
                .map((session) => {
                  const status = statusForSession(session);
                  const active = status === "ativa";
                  return `<tr>
                    <td><code>${escapeHtml(session.handle.slice(0, 12))}…</code></td>
                    <td>${escapeHtml(new Date(session.issuedAt * 1000).toLocaleString("pt-BR"))}</td>
                    <td>${escapeHtml(new Date(session.expiresAt * 1000).toLocaleString("pt-BR"))}</td>
                    <td><span class="badge ${active ? "pass" : status === "revogada" ? "partial" : "gap"}">${escapeHtml(status)}</span></td>
                    <td>
                      ${
                        active
                          ? `<button class="secondary-button" type="button" data-revoke-session="${escapeHtml(session.handle)}">Revogar sessão</button>`
                          : "—"
                      }
                    </td>
                  </tr>`;
                })
                .join("") ||
              '<tr><td colspan="5" class="empty">Nenhuma sessão registrada para este usuário.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>`;

  document
    .querySelector("#user-status-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const result = form.querySelector("#user-status-result");
      const operation =
        selectedUser.status === "blocked" ? "reactivate" : "block";
      const confirmation = operation === "block" ? "BLOQUEAR" : "REATIVAR";
      if (String(values.get("confirmation") || "").trim() !== confirmation) {
        result.textContent = `Digite ${confirmation} para confirmar.`;
        return;
      }
      try {
        result.textContent = "Reautenticando e aplicando política…";
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: String(values.get("password") || ""),
          }),
        });
        await api(`/users/${encodeURIComponent(userId)}/${operation}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: String(values.get("reason") || "").trim(),
            confirmation,
          }),
        });
        result.textContent =
          operation === "block"
            ? "Conta bloqueada e sessões ativas revogadas."
            : "Conta reativada.";
        await renderUsers(userId);
      } catch (error) {
        result.textContent =
          error.body?.error ||
          error.message ||
          "Falha ao alterar estado da conta.";
      }
    });

  document
    .querySelector("#user-role-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const result = form.querySelector("#user-role-result");
      if (
        String(values.get("confirmation") || "").trim() !== "ALTERAR PERFIL"
      ) {
        result.textContent = "Digite ALTERAR PERFIL para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando e alterando perfil…";
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: String(values.get("password") || ""),
          }),
        });
        await api(`/users/${encodeURIComponent(userId)}/role`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: String(values.get("role") || ""),
            reason: String(values.get("reason") || "").trim(),
            confirmation: "ALTERAR PERFIL",
          }),
        });
        result.textContent = "Perfil alterado e sessões ativas revogadas.";
        await renderUsers(userId);
      } catch (error) {
        result.textContent =
          error.body?.error || error.message || "Falha ao alterar perfil.";
      }
    });

  content.querySelectorAll("[data-revoke-session]").forEach((button) =>
    button.addEventListener("click", async () => {
      const password = document.querySelector(
        "#session-step-up-password",
      )?.value;
      const reason = document.querySelector("#session-revoke-reason")?.value;
      const confirmation = document.querySelector(
        "#session-revoke-confirmation",
      )?.value;
      const status = document.querySelector("#session-revoke-status");

      if (!password || !reason || confirmation !== "REVOGAR") {
        status.textContent =
          "Informe sua senha, um motivo válido e digite REVOGAR.";
        return;
      }

      button.disabled = true;
      status.textContent = "Reautenticando e revogando sessão…";
      try {
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        await api(
          `/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(
            button.dataset.revokeSession,
          )}/revoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, confirmation }),
          },
        );
        status.textContent = "Sessão revogada com sucesso.";
        await renderUsers(userId);
      } catch (error) {
        button.disabled = false;
        status.textContent =
          error.body?.error || error.message || "Falha ao revogar sessão.";
      }
    }),
  );
}
async function destinationStepUp(password) {
  if (!password)
    throw new Error("Informe sua senha para confirmar a alteração.");
  await api("/step-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
}

function destinationPayload(form, id) {
  const values = new FormData(form);
  let featureFlags;
  try {
    featureFlags = JSON.parse(String(values.get("featureFlags") || "{}"));
  } catch {
    throw new Error("Feature flags devem ser um objeto JSON válido.");
  }
  if (
    !featureFlags ||
    Array.isArray(featureFlags) ||
    Object.values(featureFlags).some((value) => typeof value !== "boolean")
  ) {
    throw new Error("Feature flags aceitam somente valores booleanos.");
  }
  const modules = String(values.get("modules") || "")
    .split(/[\\n,]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    id,
    status: String(values.get("status") || "active"),
    locale: String(values.get("locale") || "").trim(),
    timezone: String(values.get("timezone") || "").trim(),
    currency: String(values.get("currency") || "")
      .trim()
      .toUpperCase(),
    branding: {
      name: String(values.get("name") || "").trim(),
      shortName: String(values.get("shortName") || "").trim(),
      tagline: String(values.get("tagline") || "").trim(),
    },
    center: {
      lat: Number(values.get("lat")),
      lng: Number(values.get("lng")),
      zoom: Number(values.get("zoom")),
    },
    modules: [...new Set(modules)],
    featureFlags,
  };
}

function destinationEditor(destination = {}) {
  const center = destination.center ?? {};
  return `
    <form id="destination-editor" class="form-grid">
      <label>ID do destino
        <input name="id" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxlength="80"
          value="${escapeHtml(destination.id ?? "")}" ${destination.id ? "readonly" : ""}
          placeholder="novo-destino">
      </label>
      <label>Nome <input name="name" required maxlength="160" value="${escapeHtml(destination.branding?.name ?? "")}"></label>
      <label>Nome curto <input name="shortName" required maxlength="80" value="${escapeHtml(destination.branding?.shortName ?? "")}"></label>
      <label>Tagline <input name="tagline" maxlength="240" value="${escapeHtml(destination.branding?.tagline ?? "")}"></label>
      <label>Locale <input name="locale" required value="${escapeHtml(destination.locale ?? "pt-BR")}" placeholder="pt-BR"></label>
      <label>Timezone <input name="timezone" required value="${escapeHtml(destination.timezone ?? "America/Bahia")}"></label>
      <label>Moeda <input name="currency" required minlength="3" maxlength="3" value="${escapeHtml(destination.currency ?? "BRL")}"></label>
      <label>Status
        <select name="status">
          <option value="active" ${destination.status !== "suspended" ? "selected" : ""}>active</option>
          <option value="suspended" ${destination.status === "suspended" ? "selected" : ""}>suspended</option>
        </select>
      </label>
      <label>Latitude <input name="lat" type="number" step="any" min="-90" max="90" required value="${escapeHtml(center.lat ?? "")}"></label>
      <label>Longitude <input name="lng" type="number" step="any" min="-180" max="180" required value="${escapeHtml(center.lng ?? "")}"></label>
      <label>Zoom <input name="zoom" type="number" step="any" min="0" max="24" required value="${escapeHtml(center.zoom ?? 13)}"></label>
      <label>Módulos
        <textarea name="modules" required placeholder="map, navigation, assistant">${escapeHtml((destination.modules ?? []).join(", "))}</textarea>
      </label>
      <label>Feature flags (JSON booleano)
        <textarea name="featureFlags" required spellcheck="false">${escapeHtml(JSON.stringify(destination.featureFlags ?? {}, null, 2))}</textarea>
      </label>
      <label>Motivo obrigatório
        <textarea name="reason" minlength="8" maxlength="240" required placeholder="Descreva por que esta alteração é necessária"></textarea>
      </label>
      <label>Senha para step-up
        <input name="password" type="password" autocomplete="current-password" required>
      </label>
      <button class="primary-button" type="submit">${destination.id ? "Salvar configuração governada" : "Criar destino governado"}</button>
      <p id="destination-editor-result" role="status" aria-live="polite"></p>
    </form>`;
}

async function renderDestinations(destinationId) {
  const list = await api("/destinations");
  const destinations = list.destinations ?? [];
  const selected = destinationId
    ? (await api(`/destinations/${encodeURIComponent(destinationId)}`)).data
    : null;

  content.innerHTML = `
    <div class="callout">
      <strong>Destination Owner:</strong> configuração governada pelo domínio da plataforma.
      O fallback estático público permanece ativo até a qualificação final da projeção dinâmica.
    </div>
    ${
      selected
        ? `
      <section class="card section-card">
        <div class="section-title">
          <div><h2>${escapeHtml(selected.branding?.name ?? selected.id)}</h2><small>${escapeHtml(selected.id)} · versão ${escapeHtml(selected.version)}</small></div>
          ${statusBadge(selected.status)}
        </div>
        ${destinationEditor(selected)}
      </section>
    `
        : `
      <section class="card section-card">
        <div class="section-title"><h2>Novo destino</h2></div>
        ${destinationEditor()}
      </section>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead><tr><th>Destino</th><th>Status</th><th>Locale</th><th>Timezone</th><th>Versão</th></tr></thead>
          <tbody>${
            destinations
              .map(
                (item) => `<tr>
            <td><a href="#destinations:${encodeURIComponent(item.id)}"><strong>${escapeHtml(item.branding?.name ?? item.id)}</strong></a><br><small>${escapeHtml(item.id)}</small></td>
            <td>${statusBadge(item.status)}</td><td>${escapeHtml(item.locale)}</td>
            <td>${escapeHtml(item.timezone)}</td><td>${escapeHtml(item.version)}</td>
          </tr>`,
              )
              .join("") ||
            '<tr><td colspan="5" class="empty">Nenhum destino governado disponível.</td></tr>'
          }</tbody>
        </table>
      </div>
    `
    }`;

  document
    .querySelector("#destination-editor")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const result = form.querySelector("#destination-editor-result");
      const submit = form.querySelector('button[type="submit"]');
      try {
        const reason = String(new FormData(form).get("reason") ?? "").trim();
        if (reason.length < 8)
          throw new Error("Informe um motivo com pelo menos 8 caracteres.");
        const id =
          selected?.id ?? String(new FormData(form).get("id") ?? "").trim();
        const destination = destinationPayload(form, id);
        submit.disabled = true;
        result.textContent = "Reautenticando e aplicando alteração…";
        await destinationStepUp(
          String(new FormData(form).get("password") ?? ""),
        );
        await api(
          selected
            ? `/destinations/${encodeURIComponent(id)}`
            : "/destinations",
          {
            method: selected ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ destination, reason }),
          },
        );
        result.textContent = selected
          ? "Configuração atualizada com sucesso."
          : "Destino criado com sucesso.";
        await renderDestinations(id);
      } catch (error) {
        submit.disabled = false;
        result.textContent =
          error.body?.error || error.message || "Falha ao atualizar destino.";
      }
    });
}

async function renderBusinesses(businessId) {
  const data = await api("/businesses");
  if (businessId) {
    const business = data.businesses.find((entry) => entry.id === businessId);
    if (!business) throw new Error("BUSINESS_NOT_FOUND");

    const [profileResult, productsResult, reservationsResult, auditResult] =
      await Promise.all([
        api(`/businesses/${encodeURIComponent(businessId)}/profile`).catch(
          (error) =>
            error.status === 404 ? { profile: null } : Promise.reject(error),
        ),
        api(`/products?businessId=${encodeURIComponent(businessId)}&limit=100`)
          .then((value) => ({ ...value, available: true }))
          .catch((error) => ({ data: [], available: false, error })),
        api(
          `/reservations?businessId=${encodeURIComponent(businessId)}&limit=100`,
        )
          .then((value) => ({ ...value, available: true }))
          .catch((error) => ({ data: [], available: false, error })),
        api("/audit?limit=250")
          .then((value) => ({ ...value, available: true }))
          .catch((error) => ({ entries: [], available: false, error })),
      ]);

    const profile = profileResult.profile ?? null;
    const products = Array.isArray(productsResult.data)
      ? productsResult.data
      : [];
    const reservations = Array.isArray(reservationsResult.data)
      ? reservationsResult.data
      : [];
    const paymentIds = [
      ...new Set(
        reservations
          .map(({ reservation }) => reservation?.paymentId)
          .filter(Boolean),
      ),
    ].slice(0, 20);
    const orderIds = [
      ...new Set(
        reservations
          .map(({ reservation }) => reservation?.orderId)
          .filter(Boolean),
      ),
    ].slice(0, 20);
    const [payments, orders] = await Promise.all([
      Promise.all(
        paymentIds.map((id) =>
          api(`/payments/${encodeURIComponent(id)}`)
            .then((result) => result.data)
            .catch(() => null),
        ),
      ),
      Promise.all(
        orderIds.map((id) =>
          api(`/orders/${encodeURIComponent(id)}`)
            .then((result) => result.data)
            .catch(() => null),
        ),
      ),
    ]);
    const auditEntries = (auditResult.entries ?? []).filter(
      (entry) =>
        entry.tenantId === businessId ||
        entry.entityId === businessId ||
        String(entry.entityId ?? "").includes(businessId),
    );
    const activeOffers = products.filter(({ offer }) => offer?.enabled).length;
    const activeReservations = reservations.filter(({ reservation }) =>
      ["held", "confirmed"].includes(reservation?.status),
    ).length;
    const approvedPayments = payments.filter(
      (payment) => payment?.status === "APPROVED",
    ).length;

    content.innerHTML = `
      <div class="callout">
        <strong>Visão 360º administrativa:</strong>
        composição somente por contratos owner. Nenhum dado abaixo usa leitura
        cross-domain direta ou inferência de tenant.
      </div>
      <div class="grid stats">
        <article class="card stat">
          <span class="stat-label">Ofertas</span>
          <strong class="stat-value">${escapeHtml(products.length)}</strong>
          <small>${escapeHtml(activeOffers)} ativa(s)</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Reservas</span>
          <strong class="stat-value">${escapeHtml(reservations.length)}</strong>
          <small>${escapeHtml(activeReservations)} held/confirmada(s)</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Pagamentos ligados</span>
          <strong class="stat-value">${escapeHtml(payments.filter(Boolean).length)}</strong>
          <small>${escapeHtml(approvedPayments)} aprovado(s)</small>
        </article>
        <article class="card stat">
          <span class="stat-label">Auditoria</span>
          <strong class="stat-value">${escapeHtml(auditEntries.length)}</strong>
          <small>evento(s) no recorte atual</small>
        </article>
      </div>

      <div class="grid two-col">
        <section class="card section-card">
          <div class="section-title">
            <div>
              <h2>${escapeHtml(profile?.name ?? businessId)}</h2>
              <small>${escapeHtml(businessId)}</small>
            </div>
            <span class="badge pass">Business 360º owner-backed</span>
          </div>
          <div class="module-list">
            <div class="module-row"><span>Perfil</span>${statusBadge(profile ? "available" : "partial")}</div>
            <div class="module-row"><span>Produtos e ofertas</span>${productsResult.available ? `<strong>${escapeHtml(products.length)}</strong>` : statusBadge("unavailable")}</div>
            <div class="module-row"><span>Reservas</span>${reservationsResult.available ? `<strong>${escapeHtml(reservations.length)}</strong>` : statusBadge("unavailable")}</div>
            <div class="module-row"><span>Pedidos relacionados</span><strong>${escapeHtml(orders.filter(Boolean).length)}</strong></div>
            <div class="module-row"><span>Pagamentos relacionados</span><strong>${escapeHtml(payments.filter(Boolean).length)}</strong></div>
            <div class="module-row"><span>Auditoria relacionada</span>${auditResult.available ? `<strong>${escapeHtml(auditEntries.length)}</strong>` : statusBadge("unavailable")}</div>
            <div class="module-row"><span>CRM</span><strong>sem vínculo tenant canônico no modelo atual</strong></div>
          </div>
        </section>
        <section class="card section-card">
          <div class="section-title">
            <h2>Usuários associados</h2>
            <span class="badge">${escapeHtml((business.members ?? []).length)}</span>
          </div>
          <div class="module-list">
            ${
              (business.members ?? [])
                .map(
                  (member) =>
                    `<div class="module-row"><span>${escapeHtml(member.email)}</span><span class="badge">${escapeHtml(member.canonicalRole)}</span></div>`,
                )
                .join("") ||
              '<div class="empty">Nenhum membro encontrado.</div>'
            }
          </div>
        </section>
      </div>

      <div class="grid two-col">
        <section class="card section-card">
          <div class="section-title"><h2>Ofertas recentes</h2><a href="#products">Abrir catálogo</a></div>
          <div class="module-list">
            ${
              products
                .slice(0, 8)
                .map(
                  ({ offer, availableQuantity }) =>
                    `<div class="module-row"><span><a href="#products:${encodeURIComponent(offer.id)}">${escapeHtml(offer.label)}</a></span><strong>${escapeHtml(availableQuantity)} disponível(is)</strong></div>`,
                )
                .join("") ||
              '<div class="empty">Nenhuma oferta vinculada.</div>'
            }
          </div>
        </section>
        <section class="card section-card">
          <div class="section-title"><h2>Reservas recentes</h2><a href="#reservations">Abrir reservas</a></div>
          <div class="module-list">
            ${
              reservations
                .slice(0, 8)
                .map(
                  ({ reservation, inventoryLabel }) =>
                    `<div class="module-row"><span><a href="#reservations:${encodeURIComponent(reservation.id)}">${escapeHtml(inventoryLabel || reservation.id)}</a></span>${statusBadge(reservation.status)}</div>`,
                )
                .join("") ||
              '<div class="empty">Nenhuma reserva vinculada.</div>'
            }
          </div>
        </section>
      </div>

      <section class="card section-card" style="margin-top:16px">
        <div class="section-title"><h2>Auditoria relacionada</h2><a href="#audit">Abrir auditoria completa</a></div>
        <div class="module-list">
          ${
            auditEntries
              .slice(0, 10)
              .map(
                (entry) =>
                  `<div class="module-row"><span>${escapeHtml(entry.action)}</span><strong>${escapeHtml(entry.result)} · ${escapeHtml(entry.timestamp)}</strong></div>`,
              )
              .join("") ||
            '<div class="empty">Nenhum evento de tenant neste recorte.</div>'
          }
        </div>
      </section>`;
    return;
  }

  content.innerHTML = `
    <div class="callout">
      <strong>Fronteira preservada:</strong>
      o diretório vem do Identity; cada visão 360º compõe apenas contratos owner
      registrados para aquele tenant.
    </div>
    <div class="table-wrap" tabindex="0">
      <table>
        <thead><tr><th>Business ID</th><th>Membros</th><th>Fonte</th><th>Visão 360º</th></tr></thead>
        <tbody>
          ${data.businesses
            .map(
              (business) =>
                `<tr>
                  <td><strong>${escapeHtml(business.id)}</strong></td>
                  <td>${business.members.map((member) => escapeHtml(member.email)).join("<br>")}</td>
                  <td>${escapeHtml(business.source)}</td>
                  <td><a href="#businesses:${encodeURIComponent(business.id)}">Abrir empresa</a></td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function renderAffiliates(affiliateId) {
  if (!affiliateId) {
    const response = await api("/affiliates?limit=100");
    const affiliates = response.data ?? [];
    content.innerHTML = `
      <section class="card section-card">
        <div class="section-title">
          <h2>Afiliados</h2>
          <span class="badge">${affiliates.length} registro(s)</span>
        </div>
        <p style="color:var(--muted)">
          Leitura pelo domínio Affiliates. Comissões e materializações são somente leitura;
          payout e settlement permanecem autoridade exclusiva de Financial.
        </p>
        <form id="affiliate-search-form" class="form-grid">
          <label>
            Buscar afiliado
            <input id="affiliate-search-query" autocomplete="off" placeholder="Affiliate ID, identidade ou categoria" />
          </label>
          <div><button class="secondary-button" type="submit">Buscar</button></div>
        </form>
        <div class="table-wrap" tabindex="0" style="margin-top:16px">
          <table>
            <thead>
              <tr><th>Afiliado</th><th>Status</th><th>Perfil</th><th>Memberships</th><th>Conversões</th></tr>
            </thead>
            <tbody id="affiliate-list-body">
              ${
                affiliates
                  .map(
                    (affiliate) => `<tr>
                    <td>
                      <a href="#affiliates:${encodeURIComponent(affiliate.affiliateId)}">
                        <strong>${escapeHtml(affiliate.identityReference || affiliate.affiliateId)}</strong>
                      </a>
                      <br /><small>${escapeHtml(affiliate.affiliateId)}</small>
                    </td>
                    <td>${escapeHtml(affiliate.status)}</td>
                    <td>${escapeHtml(affiliate.roleCategory)}</td>
                    <td>${escapeHtml(affiliate.approvedMembershipCount)} aprovado(s) · ${escapeHtml(affiliate.suspendedMembershipCount)} suspenso(s)</td>
                    <td>${escapeHtml(affiliate.conversionCount)}</td>
                  </tr>`,
                  )
                  .join("") ||
                '<tr><td colspan="5" class="empty">Nenhum afiliado encontrado.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>`;

    document
      .querySelector("#affiliate-search-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const query = document
          .querySelector("#affiliate-search-query")
          ?.value?.trim();
        const body = document.querySelector("#affiliate-list-body");
        if (!body) return;
        body.innerHTML =
          '<tr><td colspan="5" class="empty">Buscando…</td></tr>';
        try {
          const result = await api(
            `/affiliates?limit=100&query=${encodeURIComponent(query || "")}`,
          );
          const rows = result.data ?? [];
          body.innerHTML =
            rows
              .map(
                (affiliate) => `<tr>
                  <td>
                    <a href="#affiliates:${encodeURIComponent(affiliate.affiliateId)}">
                      <strong>${escapeHtml(affiliate.identityReference || affiliate.affiliateId)}</strong>
                    </a>
                    <br /><small>${escapeHtml(affiliate.affiliateId)}</small>
                  </td>
                  <td>${escapeHtml(affiliate.status)}</td>
                  <td>${escapeHtml(affiliate.roleCategory)}</td>
                  <td>${escapeHtml(affiliate.approvedMembershipCount)} aprovado(s) · ${escapeHtml(affiliate.suspendedMembershipCount)} suspenso(s)</td>
                  <td>${escapeHtml(affiliate.conversionCount)}</td>
                </tr>`,
              )
              .join("") ||
            '<tr><td colspan="5" class="empty">Nenhum afiliado encontrado.</td></tr>';
        } catch (error) {
          body.innerHTML = `<tr><td colspan="5" class="empty">${escapeHtml(
            error.body?.error || error.message,
          )}</td></tr>`;
        }
      });
    return;
  }

  const response = await api(`/affiliates/${encodeURIComponent(affiliateId)}`);
  const detail = response.data;
  const affiliate = detail.affiliate;
  const memberships = detail.memberships ?? [];
  const summaries = detail.summaryByCurrency ?? [];
  const conversions = detail.conversions ?? [];
  const supportActive = Boolean(state.adminSession?.support);
  const actionOptions = memberships
    .filter(
      (membership) =>
        membership.status === "approved" || membership.status === "suspended",
    )
    .map((membership) => {
      const operation =
        membership.status === "approved" ? "suspend" : "reactivate";
      const label = operation === "suspend" ? "Suspender" : "Reativar";
      return `<option value="${escapeHtml(
        `${membership.programId}:${operation}`,
      )}">${label} — ${escapeHtml(membership.programId)} · ${escapeHtml(
        membership.destinationId,
      )}</option>`;
    })
    .join("");

  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat">
        <span class="stat-label">Afiliado</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(affiliate.identityReference)}</strong>
        <small>${escapeHtml(affiliate.affiliateId)}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Status da conta</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(affiliate.status)}</strong>
        <small>${escapeHtml(affiliate.accountType)} · ${escapeHtml(affiliate.roleCategory)}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Verificações</span>
        <strong class="stat-value" style="font-size:18px">${affiliate.identityVerified && affiliate.contactVerified ? "OK" : "Pendente"}</strong>
        <small>fraud block: ${affiliate.fraudBlocked ? "sim" : "não"}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Atribuições</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(detail.attribution?.count ?? 0)}</strong>
        <small>última: ${escapeHtml(detail.attribution?.latestAt ?? "—")}</small>
      </article>
    </div>

    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title">
          <h2>Memberships</h2>
          <span class="badge">${memberships.length}</span>
        </div>
        <div class="table-wrap" tabindex="0">
          <table>
            <thead><tr><th>Programa</th><th>Destino</th><th>Status</th><th>Elegível</th><th>Financial onboarding</th></tr></thead>
            <tbody>
              ${
                memberships
                  .map(
                    (membership) => `<tr>
                    <td><strong>${escapeHtml(membership.programId)}</strong></td>
                    <td>${escapeHtml(membership.destinationId)}</td>
                    <td>${escapeHtml(membership.status)}</td>
                    <td>${membership.eligibleForAttribution ? "sim" : "não"}</td>
                    <td>${escapeHtml(membership.financialOnboardingStatus)}</td>
                  </tr>`,
                  )
                  .join("") ||
                '<tr><td colspan="5" class="empty">Nenhuma membership.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card section-card">
        <div class="section-title">
          <h2>Comissões</h2>
          <span class="badge">read-only</span>
        </div>
        <div class="module-list">
          ${
            summaries
              .map(
                (summary) => `<div class="module-row">
                <span>${escapeHtml(summary.currency)}</span>
                <span>pendente ${escapeHtml(summary.pendingMinor)} · ganho ${escapeHtml(summary.earnedMinor)} · revertido ${escapeHtml(summary.reversedMinor)} · disputado ${escapeHtml(summary.disputedMinor)}</span>
              </div>`,
              )
              .join("") ||
            '<div class="module-row"><span>Nenhum entitlement</span><span>—</span></div>'
          }
        </div>
        <div class="callout" style="margin-top:14px">
          Payout authority: <strong>${escapeHtml(detail.payoutAuthority?.owner ?? "Financial")}</strong>.
          O Control Center não cria saldo, wallet, settlement ou payout.
        </div>
      </section>
    </div>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <h2>Conversões recentes</h2>
        <span class="badge">${conversions.length}</span>
      </div>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead><tr><th>Conversão</th><th>Pedido</th><th>Receita elegível</th><th>Comissão</th><th>Estado</th></tr></thead>
          <tbody>
            ${
              conversions
                .map(
                  (conversion) => `<tr>
                  <td><code>${escapeHtml(conversion.conversionId)}</code></td>
                  <td>${escapeHtml(conversion.orderId)}</td>
                  <td>${escapeHtml(conversion.eligibleRevenueMinor)} ${escapeHtml(conversion.currency)}</td>
                  <td>${escapeHtml(conversion.commissionMinor)} ${escapeHtml(conversion.currency)}</td>
                  <td>${escapeHtml(conversion.entitlementStatus)} / ${escapeHtml(conversion.materializationState)}</td>
                </tr>`,
                )
                .join("") ||
              '<tr><td colspan="5" class="empty">Nenhuma conversão.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <h2>Suspensão / reativação</h2>
        <span class="badge gap">step-up obrigatório</span>
      </div>
      ${
        supportActive
          ? '<div class="callout">Ações críticas de afiliados ficam bloqueadas durante Support Mode. Encerre a sessão de suporte para operar como actor real.</div>'
          : '<div class="callout">A mudança de membership usa o serviço owner de Affiliates, exige capability dedicada, reautenticação, motivo e confirmação textual.</div>'
      }
      <form id="affiliate-membership-action-form" class="form-grid">
        <label>
          Membership
          <select id="affiliate-membership-action" ${supportActive ? "disabled" : ""} required>
            <option value="">Selecione</option>
            ${actionOptions}
          </select>
        </label>
        <label>
          Sua senha
          <input id="affiliate-action-password" type="password" autocomplete="current-password" ${supportActive ? "disabled" : ""} required />
        </label>
        <label>
          Motivo obrigatório
          <textarea id="affiliate-action-reason" minlength="8" maxlength="240" ${supportActive ? "disabled" : ""} required></textarea>
        </label>
        <label>
          Confirmação textual
          <input id="affiliate-action-confirmation" autocomplete="off" placeholder="SUSPENDER ou REATIVAR" ${supportActive ? "disabled" : ""} required />
        </label>
        <p id="affiliate-action-status" role="status" style="margin:0;color:var(--muted)"></p>
        <div>
          <button class="primary-button" type="submit" ${supportActive || !actionOptions ? "disabled" : ""}>
            Executar ação governada
          </button>
        </div>
      </form>
    </section>
    <div style="margin-top:16px"><a href="#affiliates">← Voltar para afiliados</a></div>`;

  document
    .querySelector("#affiliate-membership-action-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#affiliate-action-status");
      try {
        const selected = document.querySelector(
          "#affiliate-membership-action",
        )?.value;
        const [programId, operation] = String(selected || "").split(":");
        if (!programId || !["suspend", "reactivate"].includes(operation)) {
          throw new Error("MEMBERSHIP_ACTION_REQUIRED");
        }
        const confirmationExpected =
          operation === "suspend" ? "SUSPENDER" : "REATIVAR";
        const confirmation = document
          .querySelector("#affiliate-action-confirmation")
          ?.value?.trim();
        if (confirmation !== confirmationExpected) {
          throw new Error(`Digite ${confirmationExpected} para confirmar.`);
        }
        const reason = document
          .querySelector("#affiliate-action-reason")
          ?.value?.trim();
        if (!reason || reason.length < 8) throw new Error("REASON_REQUIRED");
        const password = document.querySelector(
          "#affiliate-action-password",
        )?.value;
        if (!password) throw new Error("PASSWORD_REQUIRED");

        status.textContent = "Reautenticando…";
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        status.textContent = "Executando ação governada…";
        await api(
          `/affiliates/${encodeURIComponent(
            affiliateId,
          )}/memberships/${encodeURIComponent(programId)}/${operation}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, confirmation }),
          },
        );
        status.textContent = "Membership atualizada.";
        await renderAffiliates(affiliateId);
      } catch (error) {
        status.textContent = error.body?.error || error.message;
      }
    });
}

async function renderCrm() {
  const data = await api("/crm/leads?limit=100");
  const leads = Array.isArray(data.data) ? data.data : [];
  content.innerHTML = `
    <div class="callout">
      CRM é reutilizado por adapter sobre o domínio existente; nenhuma tabela foi movida para o Control Center.
    </div>
    <div class="table-wrap" tabindex="0">
      <table>
        <thead><tr><th>Empresa</th><th>Contato</th><th>Etapa</th><th>Status</th><th>Valor mensal</th></tr></thead>
        <tbody>
          ${
            leads
              .map(
                (lead) =>
                  `<tr>
                  <td><strong>${escapeHtml(lead.companyName ?? "—")}</strong><br><small>#${escapeHtml(lead.id)}</small></td>
                  <td>${escapeHtml(lead.contactName ?? lead.email ?? "—")}</td>
                  <td><span class="badge">${escapeHtml(lead.stage ?? "—")}</span></td>
                  <td>${escapeHtml(lead.status ?? "—")}</td>
                  <td>${escapeHtml(lead.monthlyValue ?? "—")}</td>
                </tr>`,
              )
              .join("") ||
            '<tr><td colspan="5" class="empty">Nenhum lead encontrado ou CRM sem dados.</td></tr>'
          }
        </tbody>
      </table>
    </div>`;
}

async function renderProducts(productId) {
  const supportActive = Boolean(state.adminSession?.support);
  const canManage = actorHasCapability("ticketing.manage") && !supportActive;

  if (!productId) {
    const [data, businessesData] = await Promise.all([
      api("/products?limit=100"),
      api("/businesses"),
    ]);
    const products = Array.isArray(data.data) ? data.data : [];
    const businesses = businessesData.businesses ?? [];
    const businessOptions = businesses
      .map(
        (business) =>
          `<option value="${escapeHtml(business.id)}">${escapeHtml(business.id)}</option>`,
      )
      .join("");

    content.innerHTML = `
      <div class="callout">
        Produtos, ofertas e inventário são governados pelo owner Ticketing.
        Criação é idempotente e desativação é uma transição explícita; não existe
        edição arbitrária de preço/capacidade nesta superfície.
      </div>
      ${
        canManage
          ? `<section class="card section-card" style="margin-bottom:16px">
              <div class="section-title">
                <h2>Nova oferta</h2>
                <span class="badge gap">step-up obrigatório</span>
              </div>
              <form id="product-create-form" class="form-grid">
                <label>Empresa
                  <select name="businessId" required>
                    <option value="">Selecione</option>
                    ${businessOptions}
                  </select>
                </label>
                <label>Tipo de produto
                  <select name="productKind" required>
                    <option value="tour">tour</option>
                    <option value="business_experience">business_experience</option>
                    <option value="transport">transport</option>
                  </select>
                </label>
                <label>Referência do produto
                  <input name="productReference" required maxlength="120" autocomplete="off" />
                </label>
                <label>Nome da oferta
                  <input name="label" required minlength="2" maxlength="160" />
                </label>
                <label>Preço em centavos
                  <input name="unitAmountMinor" type="number" min="1" step="1" required />
                </label>
                <label>Moeda
                  <input name="currency" value="BRL" minlength="3" maxlength="3" required />
                </label>
                <label>Versão de preço
                  <input name="pricingVersion" value="morro-pro-v1" maxlength="80" required />
                </label>
                <label>Capacidade
                  <input name="capacity" type="number" min="1" max="100000" step="1" required />
                </label>
                <label>Máximo por reserva
                  <input name="maxPerReservation" type="number" min="1" max="20" step="1" required />
                </label>
                <label>Início das vendas
                  <input name="salesStartAt" type="datetime-local" required />
                </label>
                <label>Fim das vendas
                  <input name="salesEndAt" type="datetime-local" required />
                </label>
                <label>Início da experiência
                  <input name="startsAt" type="datetime-local" required />
                </label>
                <label>Fim da experiência
                  <input name="endsAt" type="datetime-local" required />
                </label>
                <label>Motivo obrigatório
                  <textarea name="reason" minlength="8" maxlength="240" required></textarea>
                </label>
                <label>Sua senha
                  <input name="password" type="password" autocomplete="current-password" required />
                </label>
                <label>Confirmação textual
                  <input name="confirmation" autocomplete="off" placeholder="CRIAR OFERTA" required />
                </label>
                <button class="primary-button" type="submit">Criar oferta governada</button>
                <p id="product-create-result" role="status" aria-live="polite"></p>
              </form>
            </section>`
          : `<div class="callout">Criação de ofertas exige <strong>ticketing.manage</strong> e não é permitida durante Support Mode.</div>`
      }
      <div class="table-wrap" tabindex="0">
        <table>
          <thead><tr><th>Oferta</th><th>Empresa</th><th>Destino</th><th>Disponível</th><th>Preço</th><th>Status</th></tr></thead>
          <tbody>
            ${
              products
                .map(
                  ({ offer, businessId, availableQuantity }) => `
                  <tr>
                    <td><strong><a href="#products:${encodeURIComponent(offer.id)}">${escapeHtml(offer.label)}</a></strong><br><small>${escapeHtml(offer.product?.kind)} · ${escapeHtml(offer.product?.reference)}</small></td>
                    <td>${escapeHtml(businessId ?? "—")}</td>
                    <td>${escapeHtml(offer.destinationId)}</td>
                    <td>${escapeHtml(availableQuantity)} / ${escapeHtml(offer.capacity)}</td>
                    <td>${escapeHtml(formatMinorUnits(offer.unitAmount))}</td>
                    <td>${statusBadge(offer.enabled ? "available" : "disabled")}</td>
                  </tr>`,
                )
                .join("") ||
              '<tr><td colspan="6" class="empty">Nenhuma oferta encontrada.</td></tr>'
            }
          </tbody>
        </table>
      </div>`;

    document
      .querySelector("#product-create-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const result = form.querySelector("#product-create-result");
        const confirmation = String(values.get("confirmation") || "").trim();
        if (confirmation !== "CRIAR OFERTA") {
          result.textContent = "Digite CRIAR OFERTA para confirmar.";
          return;
        }
        const asIso = (name) => {
          const date = new Date(String(values.get(name) || ""));
          if (!Number.isFinite(date.getTime())) {
            throw new Error(`Data inválida: ${name}`);
          }
          return date.toISOString();
        };
        try {
          result.textContent = "Reautenticando…";
          await api("/step-up", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: String(values.get("password") || ""),
            }),
          });
          const requestKey = `cc_offer_${crypto.randomUUID().replaceAll("-", "_")}`;
          result.textContent = "Criando oferta pelo owner Ticketing…";
          const created = await api("/products/offers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              businessId: String(values.get("businessId") || ""),
              requestKey,
              offer: {
                productKind: String(values.get("productKind") || ""),
                productReference: String(
                  values.get("productReference") || "",
                ).trim(),
                label: String(values.get("label") || "").trim(),
                unitAmountMinor: Number(values.get("unitAmountMinor")),
                currency: String(values.get("currency") || "")
                  .trim()
                  .toUpperCase(),
                pricingVersion: String(
                  values.get("pricingVersion") || "",
                ).trim(),
                capacity: Number(values.get("capacity")),
                maxPerReservation: Number(values.get("maxPerReservation")),
                salesStartAt: asIso("salesStartAt"),
                salesEndAt: asIso("salesEndAt"),
                startsAt: asIso("startsAt"),
                endsAt: asIso("endsAt"),
              },
              reason: String(values.get("reason") || "").trim(),
              confirmation: "CRIAR OFERTA",
            }),
          });
          result.textContent = "Oferta criada com sucesso.";
          await renderProducts(created.data?.id);
        } catch (error) {
          result.textContent =
            error.body?.error || error.message || "Falha ao criar oferta.";
        }
      });
    return;
  }

  const data = await api(`/products/${encodeURIComponent(productId)}`);
  const detail = data.data;
  const projection = detail.projection;
  const offer = projection.offer;
  const availability = detail.availability;
  const canDisable =
    canManage && Boolean(projection.businessId) && Boolean(offer.enabled);
  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat"><span class="stat-label">Oferta</span><strong class="stat-value" style="font-size:18px">${escapeHtml(offer.label)}</strong><small>${escapeHtml(offer.id)}</small></article>
      <article class="card stat"><span class="stat-label">Disponibilidade</span><strong class="stat-value">${escapeHtml(availability.remainingQuantity ?? projection.availableQuantity)}</strong><small>capacidade ${escapeHtml(offer.capacity)}</small></article>
      <article class="card stat"><span class="stat-label">Preço</span><strong class="stat-value" style="font-size:18px">${escapeHtml(formatMinorUnits(offer.unitAmount))}</strong><small>${escapeHtml(offer.pricingVersion)}</small></article>
      <article class="card stat"><span class="stat-label">Estado</span><strong class="stat-value" style="font-size:18px">${escapeHtml(offer.enabled ? "ativo" : "desativado")}</strong><small>${escapeHtml(offer.product?.kind)}</small></article>
    </div>
    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title"><h2>Relações</h2><span class="badge">Ticketing owner</span></div>
        <div class="module-list">
          <div class="module-row"><span>Empresa</span><strong>${escapeHtml(projection.businessId ?? "—")}</strong></div>
          <div class="module-row"><span>Destino</span><strong>${escapeHtml(offer.destinationId)}</strong></div>
          <div class="module-row"><span>Produto</span><strong>${escapeHtml(offer.product?.reference)}</strong></div>
          <div class="module-row"><span>Reservas</span><strong>${escapeHtml(projection.reservationCount)}</strong></div>
        </div>
      </section>
      <section class="card section-card">
        <div class="section-title"><h2>Janela operacional</h2></div>
        <div class="module-list">
          <div class="module-row"><span>Vendas</span><strong>${escapeHtml(offer.salesStartAt)} → ${escapeHtml(offer.salesEndAt)}</strong></div>
          <div class="module-row"><span>Experiência</span><strong>${escapeHtml(offer.startsAt)} → ${escapeHtml(offer.endsAt)}</strong></div>
          <div class="module-row"><span>Máx. por reserva</span><strong>${escapeHtml(offer.maxPerReservation)}</strong></div>
          <div class="module-row"><span>Comprometido</span><strong>${escapeHtml(projection.committedQuantity)}</strong></div>
        </div>
      </section>
    </div>
    <div class="callout" style="margin-top:16px">
      A oferta é imutável nesta superfície. Quando precisa sair de venda, o comando
      owner desativa o inventário preservando histórico e relações existentes.
    </div>
    ${
      offer.enabled
        ? `<section class="card section-card" style="margin-top:16px">
            <div class="section-title"><h2>Desativar oferta</h2><span class="badge gap">step-up obrigatório</span></div>
            <form id="product-disable-form" class="form-grid">
              <label>Sua senha
                <input name="password" type="password" autocomplete="current-password" ${canDisable ? "" : "disabled"} required />
              </label>
              <label>Motivo obrigatório
                <textarea name="reason" minlength="8" maxlength="240" ${canDisable ? "" : "disabled"} required></textarea>
              </label>
              <label>Confirmação textual
                <input name="confirmation" autocomplete="off" placeholder="DESATIVAR OFERTA" ${canDisable ? "" : "disabled"} required />
              </label>
              <button class="primary-button" type="submit" ${canDisable ? "" : "disabled"}>Desativar oferta</button>
              <p id="product-disable-result" role="status" aria-live="polite"></p>
            </form>
          </section>`
        : ""
    }
    <div style="margin-top:16px"><a href="#products">← Voltar para Produtos e Ofertas</a></div>`;

  document
    .querySelector("#product-disable-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const result = form.querySelector("#product-disable-result");
      if (
        String(values.get("confirmation") || "").trim() !== "DESATIVAR OFERTA"
      ) {
        result.textContent = "Digite DESATIVAR OFERTA para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando…";
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: String(values.get("password") || ""),
          }),
        });
        result.textContent = "Desativando oferta pelo owner Ticketing…";
        await api(`/products/${encodeURIComponent(productId)}/disable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            businessId: projection.businessId,
            reason: String(values.get("reason") || "").trim(),
            confirmation: "DESATIVAR OFERTA",
          }),
        });
        result.textContent = "Oferta desativada.";
        await renderProducts(productId);
      } catch (error) {
        result.textContent =
          error.body?.error || error.message || "Falha ao desativar oferta.";
      }
    });
}

async function renderReservations(reservationId) {
  if (!reservationId) {
    const data = await api("/reservations?limit=100");
    const reservations = Array.isArray(data.data) ? data.data : [];
    content.innerHTML = `
      <div class="callout">
        Reservas são lidas do owner Ticketing com relações de inventário, empresa,
        pedido e pagamento. Estados confirmados só podem ser revertidos pelo fluxo financeiro autorizado.
      </div>
      <div class="table-wrap" tabindex="0">
        <table>
          <thead><tr><th>Reserva</th><th>Oferta</th><th>Cliente</th><th>Empresa</th><th>Status</th><th>Pedido / Pagamento</th></tr></thead>
          <tbody>
            ${
              reservations
                .map(
                  ({ reservation, businessId, inventoryLabel }) => `
                  <tr>
                    <td><strong><a href="#reservations:${encodeURIComponent(reservation.id)}">${escapeHtml(reservation.id)}</a></strong><br><small>${escapeHtml(reservation.createdAt)}</small></td>
                    <td>${escapeHtml(inventoryLabel)}<br><small>${escapeHtml(reservation.product?.reference)}</small></td>
                    <td>${escapeHtml(reservation.holderReference)}</td>
                    <td>${escapeHtml(businessId ?? "—")}</td>
                    <td>${statusBadge(reservation.status)}</td>
                    <td>${reservation.orderId ? `<a href="#orders:${encodeURIComponent(reservation.orderId)}">${escapeHtml(reservation.orderId)}</a>` : "—"}<br>${reservation.paymentId ? `<a href="#financial:${encodeURIComponent(reservation.paymentId)}">${escapeHtml(reservation.paymentId)}</a>` : "—"}</td>
                  </tr>`,
                )
                .join("") ||
              '<tr><td colspan="6" class="empty">Nenhuma reserva encontrada.</td></tr>'
            }
          </tbody>
        </table>
      </div>`;
    return;
  }

  const data = await api(`/reservations/${encodeURIComponent(reservationId)}`);
  const detail = data.data;
  const reservation = detail.reservation;
  const events = detail.events ?? [];
  const supportActive = Boolean(state.adminSession?.support);
  const canCancelHeld =
    reservation.status === "held" &&
    actorHasCapability("ticketing.manage") &&
    !supportActive;
  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat"><span class="stat-label">Status</span><strong class="stat-value" style="font-size:20px">${escapeHtml(reservation.status)}</strong><small>${escapeHtml(reservation.id)}</small></article>
      <article class="card stat"><span class="stat-label">Quantidade</span><strong class="stat-value">${escapeHtml(reservation.quantity)}</strong><small>${escapeHtml(formatMinorUnits(reservation.unitAmount))}</small></article>
      <article class="card stat"><span class="stat-label">Empresa</span><strong class="stat-value" style="font-size:16px">${escapeHtml(detail.businessId ?? "—")}</strong><small>${escapeHtml(reservation.destinationId)}</small></article>
      <article class="card stat"><span class="stat-label">Cliente</span><strong class="stat-value" style="font-size:16px">${escapeHtml(reservation.holderReference)}</strong><small>referência owner</small></article>
    </div>
    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title"><h2>Relações transacionais</h2></div>
        <div class="module-list">
          <div class="module-row"><span>Inventário</span><strong>${escapeHtml(detail.inventoryLabel)} · ${escapeHtml(reservation.inventoryId)}</strong></div>
          <div class="module-row"><span>Produto</span><strong>${escapeHtml(reservation.product?.kind)} · ${escapeHtml(reservation.product?.reference)}</strong></div>
          <div class="module-row"><span>Pedido</span><strong>${reservation.orderId ? `<a href="#orders:${encodeURIComponent(reservation.orderId)}">${escapeHtml(reservation.orderId)}</a>` : "—"}</strong></div>
          <div class="module-row"><span>Pagamento</span><strong>${reservation.paymentId ? `<a href="#financial:${encodeURIComponent(reservation.paymentId)}">${escapeHtml(reservation.paymentId)}</a>` : "—"}</strong></div>
        </div>
      </section>
      <section class="card section-card">
        <div class="section-title"><h2>Histórico</h2><span class="badge">append-only owner events</span></div>
        <div class="module-list">
          ${
            events
              .map(
                (event) =>
                  `<div class="module-row"><span>${escapeHtml(event.eventType)}</span><strong>${escapeHtml(event.occurredAt)} · ${escapeHtml(event.actorReference)}</strong></div>`,
              )
              .join("") || '<div class="empty">Sem eventos registrados.</div>'
          }
        </div>
      </section>
    </div>
    <div class="callout" style="margin-top:16px">
      Cancelamento de reserva confirmada não é uma mudança manual de status: exige o fluxo Financial/refund e a propagação owner já existente.
      Reservas em <strong>held</strong> podem ser canceladas aqui somente pelo comando owner governado.
    </div>
    ${
      reservation.status === "held"
        ? `<section class="card section-card" style="margin-top:16px">
            <div class="section-title">
              <h2>Cancelar hold</h2>
              <span class="badge gap">step-up obrigatório</span>
            </div>
            <div class="callout">
              ${
                supportActive
                  ? "Ação crítica bloqueada durante Support Mode."
                  : "O owner Ticketing revalida o estado de forma transacional antes de liberar o hold."
              }
            </div>
            <form id="reservation-cancel-form" class="form-grid">
              <label>Sua senha
                <input name="password" type="password" autocomplete="current-password"
                  ${canCancelHeld ? "" : "disabled"} required />
              </label>
              <label>Motivo obrigatório
                <textarea name="reason" minlength="8" maxlength="240"
                  ${canCancelHeld ? "" : "disabled"} required></textarea>
              </label>
              <label>Confirmação textual
                <input name="confirmation" autocomplete="off" placeholder="CANCELAR RESERVA"
                  ${canCancelHeld ? "" : "disabled"} required />
              </label>
              <button class="primary-button" type="submit"
                ${canCancelHeld ? "" : "disabled"}>Cancelar hold governado</button>
              <p id="reservation-cancel-result" role="status" aria-live="polite"></p>
            </form>
          </section>`
        : ""
    }
    <div style="margin-top:16px"><a href="#reservations">← Voltar para Reservas</a></div>`;

  document
    .querySelector("#reservation-cancel-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const result = form.querySelector("#reservation-cancel-result");
      if (
        String(values.get("confirmation") || "").trim() !== "CANCELAR RESERVA"
      ) {
        result.textContent = "Digite CANCELAR RESERVA para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando…";
        await api("/step-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            password: String(values.get("password") || ""),
          }),
        });
        result.textContent = "Cancelando hold pelo owner Ticketing…";
        await api(`/reservations/${encodeURIComponent(reservationId)}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: String(values.get("reason") || "").trim(),
            confirmation: "CANCELAR RESERVA",
          }),
        });
        result.textContent = "Hold cancelado com sucesso.";
        await renderReservations(reservationId);
      } catch (error) {
        result.textContent =
          error.body?.error || error.message || "Falha ao cancelar hold.";
      }
    });
}

async function renderTicketing() {
  const supportActive = Boolean(state.adminSession?.support);
  const canManage = actorHasCapability("ticketing.manage") && !supportActive;
  const data = await api("/ticketing/inventory").catch((error) => ({
    data: [],
    error,
  }));
  const inventory = Array.isArray(data.data) ? data.data : [];

  content.innerHTML = `
    <div class="callout">
      <strong>Ticketing owner:</strong>
      validação/check-in e credenciais offline permanecem no domínio Ticketing.
      Produtos/ofertas e reservas globais usam as superfícies administrativas dedicadas.
    </div>

    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title">
          <h2>Validar check-in</h2>
          <span class="badge gap">step-up obrigatório</span>
        </div>
        <form id="ticketing-checkin-form" class="form-grid">
          <label>QR payload
            <textarea name="qrPayload" ${canManage ? "" : "disabled"} required></textarea>
          </label>
          <label>Sua senha
            <input name="password" type="password" autocomplete="current-password" ${canManage ? "" : "disabled"} required />
          </label>
          <label>Motivo obrigatório
            <textarea name="reason" minlength="8" maxlength="240" ${canManage ? "" : "disabled"} required></textarea>
          </label>
          <label>Confirmação textual
            <input name="confirmation" autocomplete="off" placeholder="VALIDAR CHECK-IN" ${canManage ? "" : "disabled"} required />
          </label>
          <button class="primary-button" type="submit" ${canManage ? "" : "disabled"}>
            Validar ticket
          </button>
          <p id="ticketing-checkin-result" role="status" aria-live="polite"></p>
        </form>
      </section>

      <section class="card section-card">
        <div class="section-title">
          <h2>Provisionar dispositivo offline</h2>
          <span class="badge gap">step-up obrigatório</span>
        </div>
        <form id="ticketing-device-provision-form" class="form-grid">
          <label>Device ID
            <input name="deviceId" pattern="tdv_[A-Za-z0-9_-]{8,116}" placeholder="tdv_operacao_01" ${canManage ? "" : "disabled"} required />
          </label>
          <label>Destino
            <input name="destinationId" placeholder="morro-de-sao-paulo" ${canManage ? "" : "disabled"} required />
          </label>
          <label>TTL em segundos
            <input name="ttlSeconds" type="number" min="300" max="86400" step="1" value="14400" ${canManage ? "" : "disabled"} required />
          </label>
          <label>Sua senha
            <input name="password" type="password" autocomplete="current-password" ${canManage ? "" : "disabled"} required />
          </label>
          <label>Motivo obrigatório
            <textarea name="reason" minlength="8" maxlength="240" ${canManage ? "" : "disabled"} required></textarea>
          </label>
          <label>Confirmação textual
            <input name="confirmation" autocomplete="off" placeholder="PROVISIONAR DISPOSITIVO" ${canManage ? "" : "disabled"} required />
          </label>
          <button class="primary-button" type="submit" ${canManage ? "" : "disabled"}>
            Provisionar credencial
          </button>
          <p id="ticketing-device-provision-result" role="status" aria-live="polite"></p>
          <label id="ticketing-device-token-wrap" hidden>
            Credencial emitida — exibida somente nesta resposta
            <textarea id="ticketing-device-token" readonly></textarea>
          </label>
        </form>
      </section>
    </div>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <h2>Revogar dispositivo offline</h2>
        <span class="badge gap">step-up obrigatório</span>
      </div>
      <form id="ticketing-device-revoke-form" class="form-grid">
        <label>Device ID
          <input name="deviceId" pattern="tdv_[A-Za-z0-9_-]{8,116}" placeholder="tdv_operacao_01" ${canManage ? "" : "disabled"} required />
        </label>
        <label>Sua senha
          <input name="password" type="password" autocomplete="current-password" ${canManage ? "" : "disabled"} required />
        </label>
        <label>Motivo obrigatório
          <textarea name="reason" minlength="8" maxlength="240" ${canManage ? "" : "disabled"} required></textarea>
        </label>
        <label>Confirmação textual
          <input name="confirmation" autocomplete="off" placeholder="REVOGAR DISPOSITIVO" ${canManage ? "" : "disabled"} required />
        </label>
        <button class="primary-button" type="submit" ${canManage ? "" : "disabled"}>
          Revogar dispositivo
        </button>
        <p id="ticketing-device-revoke-result" role="status" aria-live="polite"></p>
      </form>
    </section>

    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <h2>Inventário operacional</h2>
        <span class="badge">${inventory.length}</span>
      </div>
      ${
        data.error
          ? '<div class="callout">Runtime Ticketing indisponível nesta execução; os comandos continuam fail-closed.</div>'
          : ""
      }
      <div class="table-wrap" tabindex="0">
        <table>
          <thead><tr><th>Oferta</th><th>Referência</th><th>Disponibilidade</th><th>Preço</th></tr></thead>
          <tbody>
            ${
              inventory
                .map(
                  (offer) =>
                    `<tr>
                  <td><strong>${escapeHtml(offer.label ?? offer.id ?? "—")}</strong></td>
                  <td>${escapeHtml(offer.productReference ?? offer.id ?? "—")}</td>
                  <td>${escapeHtml(offer.available ?? offer.capacity ?? "—")}</td>
                  <td>${escapeHtml(offer.unitAmount?.minorUnits ?? offer.unitAmountMinor ?? "—")} ${escapeHtml(offer.unitAmount?.currency ?? offer.currency ?? "")}</td>
                </tr>`,
                )
                .join("") ||
              '<tr><td colspan="4" class="empty">Inventário indisponível ou vazio.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>`;

  const stepUp = async (form) => {
    const values = new FormData(form);
    await api("/step-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: String(values.get("password") || ""),
      }),
    });
    return values;
  };

  document
    .querySelector("#ticketing-checkin-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const result = form.querySelector("#ticketing-checkin-result");
      const preview = new FormData(form);
      if (
        String(preview.get("confirmation") || "").trim() !== "VALIDAR CHECK-IN"
      ) {
        result.textContent = "Digite VALIDAR CHECK-IN para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando…";
        const values = await stepUp(form);
        const response = await api("/ticketing/operator/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrPayload: String(values.get("qrPayload") || "").trim(),
            reason: String(values.get("reason") || "").trim(),
            confirmation: "VALIDAR CHECK-IN",
          }),
        });
        result.textContent = `Check-in validado: ${response.data?.status ?? "OK"}.`;
      } catch (error) {
        result.textContent =
          error.body?.error || error.message || "Falha ao validar check-in.";
      }
    });

  document
    .querySelector("#ticketing-device-provision-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const result = form.querySelector("#ticketing-device-provision-result");
      const preview = new FormData(form);
      if (
        String(preview.get("confirmation") || "").trim() !==
        "PROVISIONAR DISPOSITIVO"
      ) {
        result.textContent = "Digite PROVISIONAR DISPOSITIVO para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando…";
        const values = await stepUp(form);
        const response = await api("/ticketing/operator/offline-devices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId: String(values.get("deviceId") || "").trim(),
            destinationId: String(values.get("destinationId") || "").trim(),
            ttlSeconds: Number(values.get("ttlSeconds")),
            reason: String(values.get("reason") || "").trim(),
            confirmation: "PROVISIONAR DISPOSITIVO",
          }),
        });
        result.textContent =
          "Credencial provisionada. Armazene-a no dispositivo autorizado.";
        const wrap = form.querySelector("#ticketing-device-token-wrap");
        const token = form.querySelector("#ticketing-device-token");
        if (response.data?.token && wrap && token) {
          token.value = response.data.token;
          wrap.hidden = false;
        }
      } catch (error) {
        result.textContent =
          error.body?.error ||
          error.message ||
          "Falha ao provisionar dispositivo.";
      }
    });

  document
    .querySelector("#ticketing-device-revoke-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const result = form.querySelector("#ticketing-device-revoke-result");
      const preview = new FormData(form);
      if (
        String(preview.get("confirmation") || "").trim() !==
        "REVOGAR DISPOSITIVO"
      ) {
        result.textContent = "Digite REVOGAR DISPOSITIVO para confirmar.";
        return;
      }
      try {
        result.textContent = "Reautenticando…";
        const values = await stepUp(form);
        const deviceId = String(values.get("deviceId") || "").trim();
        const response = await api(
          `/ticketing/operator/offline-devices/${encodeURIComponent(
            deviceId,
          )}/revoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reason: String(values.get("reason") || "").trim(),
              confirmation: "REVOGAR DISPOSITIVO",
            }),
          },
        );
        result.textContent = response.data?.revokedAt
          ? `Dispositivo revogado em ${response.data.revokedAt}.`
          : "Dispositivo já estava revogado.";
      } catch (error) {
        result.textContent =
          error.body?.error || error.message || "Falha ao revogar dispositivo.";
      }
    });
}

function formatMinorUnits(money) {
  const minor = Number(money?.minorUnits);
  const currency = String(money?.currency ?? "");
  if (!Number.isFinite(minor) || !currency) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${minor} ${currency}`;
  }
}

function createReconciliationRunId() {
  const time = Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 10);
  return `rrn_admin_${time}_${suffix}`;
}

async function renderOrders(orderId) {
  if (!orderId) {
    content.innerHTML = `
      <section class="card section-card">
        <div class="section-title">
          <h2>Consultar pedido</h2>
          <span class="badge">read-only</span>
        </div>
        <p style="color:var(--muted)">
          A consulta usa o repositório owner do domínio Ordering. O Control Center
          não lê a tabela de pedidos diretamente.
        </p>
        <form id="order-lookup-form" class="form-grid">
          <label>
            Order ID
            <input id="order-lookup-id" required autocomplete="off" placeholder="ord_..." />
          </label>
          <div><button class="primary-button" type="submit">Consultar pedido</button></div>
        </form>
      </section>`;
    document
      .querySelector("#order-lookup-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const id = document.querySelector("#order-lookup-id")?.value?.trim();
        if (id) globalThis.location.hash = `#orders:${encodeURIComponent(id)}`;
      });
    return;
  }

  const data = await api(`/orders/${encodeURIComponent(orderId)}`);
  const order = data.data;
  content.innerHTML = `
    <div class="callout">
      <strong>Ordering owner:</strong> projeção administrativa somente leitura.
    </div>
    <div class="grid stats">
      <article class="card stat">
        <span class="stat-label">Order ID</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(order.id)}</strong>
        <small>${escapeHtml(order.source?.kind ?? "—")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Status</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(order.status)}</strong>
        <small>Atualizado ${escapeHtml(order.updatedAt ?? "—")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Valor</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(formatMinorUnits(order.pricing?.amount))}</strong>
        <small>${escapeHtml(order.pricing?.planName ?? "—")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Referência</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(order.source?.reference ?? "—")}</strong>
        <small>Fonte do pedido</small>
      </article>
    </div>
    <div style="margin-top:16px">
      <a href="#orders">← Consultar outro pedido</a>
    </div>`;
}

async function renderFinancial(paymentId) {
  if (!paymentId) {
    content.innerHTML = `
      <div class="grid two-col">
        <section class="card section-card">
          <div class="section-title">
            <h2>Consultar pagamento</h2>
            <span class="badge">Financial owner</span>
          </div>
          <form id="payment-lookup-form" class="form-grid">
            <label>
              Payment ID
              <input id="payment-lookup-id" required autocomplete="off" placeholder="pay_..." />
            </label>
            <div><button class="primary-button" type="submit">Abrir pagamento</button></div>
          </form>
        </section>
        <section class="card section-card">
          <div class="section-title">
            <h2>Consultar ledger</h2>
            <span class="badge">read-only</span>
          </div>
          <form id="ledger-lookup-form" class="form-grid">
            <label>
              External key
              <input id="ledger-lookup-key" required autocomplete="off" placeholder="payment_approved_..." />
            </label>
            <div><button class="secondary-button" type="submit">Consultar lançamento</button></div>
          </form>
          <div id="ledger-result" style="margin-top:14px"></div>
        </section>
      </div>
      <div class="callout" style="margin-top:16px">
        Nenhuma tela do Control Center permite editar saldo, posting ou estado financeiro arbitrariamente.
      </div>`;

    document
      .querySelector("#payment-lookup-form")
      ?.addEventListener("submit", (event) => {
        event.preventDefault();
        const id = document.querySelector("#payment-lookup-id")?.value?.trim();
        if (id) {
          globalThis.location.hash = `#financial:${encodeURIComponent(id)}`;
        }
      });

    document
      .querySelector("#ledger-lookup-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const key = document.querySelector("#ledger-lookup-key")?.value?.trim();
        const result = document.querySelector("#ledger-result");
        if (!key || !result) return;
        result.textContent = "Consultando…";
        try {
          const response = await api(
            `/financial/ledger/${encodeURIComponent(key)}`,
          );
          const ledger = response.data;
          result.innerHTML = `
            <div class="module-list">
              <div class="module-row"><span>Transaction ID</span><strong>${escapeHtml(ledger.id)}</strong></div>
              <div class="module-row"><span>External key</span><span>${escapeHtml(ledger.externalKey)}</span></div>
              <div class="module-row"><span>Ocorrido em</span><span>${escapeHtml(ledger.occurredAt)}</span></div>
              <div class="module-row"><span>Postings</span><span>${escapeHtml(ledger.postings?.length ?? 0)}</span></div>
            </div>`;
        } catch (error) {
          result.textContent = error.body?.error || error.message;
        }
      });
    return;
  }

  const [paymentResponse, findingsResponse] = await Promise.all([
    api(`/payments/${encodeURIComponent(paymentId)}`),
    api(
      `/financial/reconciliation/payments/${encodeURIComponent(paymentId)}/findings`,
    ).catch((error) => ({ data: { findings: [] }, error })),
  ]);
  const payment = paymentResponse.data;
  const findings = findingsResponse.data?.findings ?? [];

  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat">
        <span class="stat-label">Payment ID</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(payment.id)}</strong>
        <small>Financial source of truth</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Status</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(payment.status)}</strong>
        <small>${escapeHtml(payment.updatedAt ?? "—")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Valor</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(formatMinorUnits(payment.amount))}</strong>
        <small>${escapeHtml(payment.subject?.reference ?? "—")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Provider reference</span>
        <strong class="stat-value" style="font-size:15px">${escapeHtml(payment.providerReference ?? "—")}</strong>
        <small>Somente leitura</small>
      </article>
    </div>

    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title">
          <h2>Reconciliation findings</h2>
          <span class="badge">${findings.length} aberta(s)</span>
        </div>
        <div class="table-wrap" tabindex="0">
          <table>
            <thead><tr><th>Finding</th><th>Tipo</th><th>Severidade</th><th>Estado</th><th>Ação</th></tr></thead>
            <tbody>
              ${
                findings
                  .map(
                    (finding) =>
                      `<tr>
                        <td><code>${escapeHtml(finding.id)}</code></td>
                        <td>${escapeHtml(finding.kind)}</td>
                        <td>${escapeHtml(finding.severity)}</td>
                        <td>${escapeHtml(finding.state)}</td>
                        <td><button class="secondary-button" type="button" data-ack-finding="${escapeHtml(finding.id)}">Reconhecer</button></td>
                      </tr>`,
                  )
                  .join("") ||
                '<tr><td colspan="5" class="empty">Nenhum finding aberto.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card section-card">
        <div class="section-title">
          <h2>Ações críticas</h2>
          <span class="badge gap">step-up obrigatório</span>
        </div>
        <div class="callout">
          Produção está bloqueada por código. Em staging/dev, cada ação exige reautenticação,
          motivo, confirmação textual, idempotência e auditoria.
        </div>
        <form id="financial-action-form" class="form-grid">
          <label>
            Sua senha
            <input id="financial-password" type="password" autocomplete="current-password" required />
          </label>
          <label>
            Motivo obrigatório
            <textarea id="financial-reason" minlength="8" maxlength="240" required placeholder="Explique por que esta ação é necessária"></textarea>
          </label>
          <label>
            Confirmação textual
            <input id="financial-confirmation" autocomplete="off" required placeholder="REFUNDAR, RECONCILIAR ou CONFIRMAR" />
          </label>
          <p id="financial-action-status" role="status" style="margin:0;color:var(--muted)"></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="financial-reconcile" class="secondary-button" type="button">Executar reconciliation</button>
            <button id="financial-refund" class="primary-button" type="button">Solicitar refund total</button>
          </div>
        </form>
      </section>
    </div>
    <div style="margin-top:16px"><a href="#financial">← Consultar outro pagamento</a></div>`;

  async function financialStepUp() {
    const password = document.querySelector("#financial-password")?.value;
    if (!password) throw new Error("PASSWORD_REQUIRED");
    await api("/step-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  }

  function actionInputs(expectedConfirmation) {
    const reason = document.querySelector("#financial-reason")?.value?.trim();
    const confirmation = document
      .querySelector("#financial-confirmation")
      ?.value?.trim();
    if (!reason || reason.length < 8) throw new Error("REASON_REQUIRED");
    if (confirmation !== expectedConfirmation) {
      throw new Error(`Digite ${expectedConfirmation} para confirmar.`);
    }
    return { reason, confirmation };
  }

  async function runAction(action) {
    const status = document.querySelector("#financial-action-status");
    if (!status) return;
    status.textContent = "Reautenticando…";
    try {
      await financialStepUp();
      const input = actionInputs(
        action === "refund" ? "REFUNDAR" : "RECONCILIAR",
      );
      status.textContent = "Executando ação governada…";
      if (action === "refund") {
        const result = await api(
          `/financial/refunds/${encodeURIComponent(paymentId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        status.textContent = `Refund aceito pelo domínio: ${result.data?.status ?? "OK"}.`;
      } else {
        const result = await api(
          `/financial/reconciliation/payments/${encodeURIComponent(paymentId)}/runs`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...input,
              runId: createReconciliationRunId(),
            }),
          },
        );
        status.textContent = `Reconciliation concluída: ${result.data?.findingCount ?? 0} finding(s).`;
      }
      await renderFinancial(paymentId);
    } catch (error) {
      status.textContent = error.body?.error || error.message;
    }
  }

  document
    .querySelector("#financial-refund")
    ?.addEventListener("click", () => runAction("refund"));
  document
    .querySelector("#financial-reconcile")
    ?.addEventListener("click", () => runAction("reconcile"));

  content.querySelectorAll("[data-ack-finding]").forEach((button) =>
    button.addEventListener("click", async () => {
      const status = document.querySelector("#financial-action-status");
      if (!status) return;
      try {
        const input = actionInputs("CONFIRMAR");
        await financialStepUp();
        status.textContent = "Reconhecendo finding…";
        await api(
          `/financial/reconciliation/findings/${encodeURIComponent(
            button.dataset.ackFinding,
          )}/acknowledge`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        status.textContent = "Finding reconhecido.";
        await renderFinancial(paymentId);
      } catch (error) {
        status.textContent = error.body?.error || error.message;
      }
    }),
  );
}

async function renderContent(contentId) {
  const canManage = actorHasCapability("content.manage");

  if (!contentId) {
    const data = await api("/content?limit=100");
    const documents = data.data ?? [];
    content.innerHTML = `
      <div class="grid two-col">
        <section class="card section-card">
          <div class="section-title">
            <div>
              <h2>Biblioteca editorial</h2>
              <small style="color:var(--muted)">Persistência e lifecycle pertencem ao domínio Content.</small>
            </div>
            <span class="badge">${documents.length} item(ns)</span>
          </div>
          <div class="table-wrap" tabindex="0">
            <table>
              <thead>
                <tr><th>Conteúdo</th><th>Tipo</th><th>Status</th><th>Destino</th><th>Locale</th></tr>
              </thead>
              <tbody>
                ${
                  documents
                    .map(
                      (document) => `<tr>
                        <td>
                          <a href="#content:${encodeURIComponent(document.id)}">
                            <strong>${escapeHtml(contentField(document, "title") || document.id)}</strong>
                          </a>
                          <br><small>${escapeHtml(document.id)}</small>
                        </td>
                        <td>${escapeHtml(document.kind)}</td>
                        <td>${statusBadge(document.status)}</td>
                        <td>${escapeHtml(document.destinationId)}</td>
                        <td>${escapeHtml(document.locale)}</td>
                      </tr>`,
                    )
                    .join("") ||
                  '<tr><td colspan="5" class="empty">Nenhum conteúdo cadastrado.</td></tr>'
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="card section-card">
          <div class="section-title">
            <div>
              <h2>Novo rascunho</h2>
              <small style="color:var(--muted)">Nenhum preço ou estado financeiro pode ser criado por Content.</small>
            </div>
            <span class="badge">${canManage ? "content.manage" : "somente leitura"}</span>
          </div>
          ${
            canManage
              ? `<form id="content-create-form" class="form-grid">
                  <label>ID do conteúdo
                    <input id="content-create-id" required maxlength="160" autocomplete="off" placeholder="place-segunda-praia" />
                  </label>
                  <label>Destino
                    <input id="content-create-destination" required value="morro-de-sao-paulo" autocomplete="off" />
                  </label>
                  <label>Tipo
                    <select id="content-create-kind" required>
                      <option value="destination">Destino</option>
                      <option value="category">Categoria</option>
                      <option value="place" selected>Local</option>
                      <option value="media">Mídia</option>
                      <option value="tour">Passeio</option>
                      <option value="event">Evento</option>
                      <option value="translation">Tradução</option>
                      <option value="seo">SEO</option>
                      <option value="offer_reference">Referência de oferta</option>
                    </select>
                  </label>
                  <label>Idioma
                    <input id="content-create-locale" required value="pt-BR" autocomplete="off" />
                  </label>
                  <label>Referência de origem
                    <input id="content-create-source" maxlength="240" autocomplete="off" placeholder="place:segunda-praia" />
                  </label>
                  <label>Título
                    <input id="content-create-title" maxlength="500" required />
                  </label>
                  <label>Resumo
                    <textarea id="content-create-summary" maxlength="20000"></textarea>
                  </label>
                  <label>Motivo administrativo
                    <textarea id="content-create-reason" minlength="8" maxlength="240" required placeholder="Ex.: Criar conteúdo solicitado pela equipe editorial"></textarea>
                  </label>
                  <p id="content-create-status" role="status" style="margin:0;color:var(--muted)"></p>
                  <div><button class="primary-button" type="submit">Criar rascunho</button></div>
                </form>`
              : `<div class="callout">Seu papel pode consultar conteúdo, mas não possui a capability <strong>content.manage</strong>.</div>`
          }
        </section>
      </div>`;

    document
      .querySelector("#content-create-form")
      ?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const status = document.querySelector("#content-create-status");
        if (status) status.textContent = "Criando…";
        try {
          const title = document
            .querySelector("#content-create-title")
            ?.value?.trim();
          const summary = document
            .querySelector("#content-create-summary")
            ?.value?.trim();
          const sourceReference = document
            .querySelector("#content-create-source")
            ?.value?.trim();
          const body = {
            id: document.querySelector("#content-create-id")?.value?.trim(),
            destinationId: document
              .querySelector("#content-create-destination")
              ?.value?.trim(),
            kind: document.querySelector("#content-create-kind")?.value,
            locale: document
              .querySelector("#content-create-locale")
              ?.value?.trim(),
            ...(sourceReference ? { sourceReference } : {}),
            fields: {
              title,
              ...(summary ? { summary } : {}),
            },
            reason: document
              .querySelector("#content-create-reason")
              ?.value?.trim(),
          };
          const result = await api("/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          globalThis.location.hash = `#content:${encodeURIComponent(result.data.id)}`;
        } catch (error) {
          if (status) status.textContent = error.body?.error || error.message;
        }
      });
    return;
  }

  const data = await api(`/content/${encodeURIComponent(contentId)}`);
  const documentData = data.data;
  const fieldRows = Object.entries(documentData.fields ?? {})
    .map(
      ([key, value]) =>
        `<div class="module-row"><span>${escapeHtml(key)}</span><strong>${escapeHtml(Array.isArray(value) ? value.join(", ") : value)}</strong></div>`,
    )
    .join("");

  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat">
        <span class="stat-label">Status</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(documentData.status)}</strong>
        <small>v${escapeHtml(documentData.version)}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Tipo</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(documentData.kind)}</strong>
        <small>${escapeHtml(documentData.locale)}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Destino</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(documentData.destinationId)}</strong>
        <small>${escapeHtml(documentData.sourceReference ?? "sem referência")}</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Atualizado</span>
        <strong class="stat-value" style="font-size:15px">${escapeHtml(documentData.updatedAt)}</strong>
        <small>ID: ${escapeHtml(documentData.id)}</small>
      </article>
    </div>

    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title"><h2>Campos editoriais</h2><span class="badge">Content owner</span></div>
        <div class="module-list">${fieldRows || '<div class="empty">Sem campos.</div>'}</div>
      </section>

      <section class="card section-card">
        <div class="section-title"><h2>Lifecycle</h2><span class="badge">${canManage ? "governado" : "somente leitura"}</span></div>
        <div class="module-list">
          <div class="module-row"><span>Criado</span><strong>${escapeHtml(documentData.createdAt)}</strong></div>
          <div class="module-row"><span>Agendado</span><strong>${escapeHtml(documentData.scheduledFor ?? "—")}</strong></div>
          <div class="module-row"><span>Publicado</span><strong>${escapeHtml(documentData.publishedAt ?? "—")}</strong></div>
          <div class="module-row"><span>Arquivado</span><strong>${escapeHtml(documentData.archivedAt ?? "—")}</strong></div>
        </div>
      </section>
    </div>

    ${
      canManage
        ? `<div class="grid two-col" style="margin-top:16px">
            <section class="card section-card">
              <div class="section-title"><h2>Revisar rascunho/preview</h2></div>
              <form id="content-revise-form" class="form-grid">
                <label>Título
                  <input id="content-revise-title" maxlength="500" value="${escapeHtml(contentField(documentData, "title"))}" />
                </label>
                <label>Resumo
                  <textarea id="content-revise-summary" maxlength="20000">${escapeHtml(contentField(documentData, "summary"))}</textarea>
                </label>
                <label>Motivo administrativo
                  <textarea id="content-revise-reason" minlength="8" maxlength="240" required></textarea>
                </label>
                <p id="content-revise-status" role="status" style="margin:0;color:var(--muted)"></p>
                <div><button class="secondary-button" type="submit">Salvar revisão</button></div>
              </form>
            </section>

            <section class="card section-card">
              <div class="section-title"><h2>Alterar estado</h2><span class="badge">lifecycle owner</span></div>
              <form id="content-transition-form" class="form-grid">
                <label>Novo estado
                  <select id="content-transition-status" required>
                    <option value="preview">Preview</option>
                    <option value="draft">Rascunho</option>
                    <option value="scheduled">Agendado</option>
                    <option value="published">Publicado</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </label>
                <label>Publicar em (somente para agendamento)
                  <input id="content-scheduled-for" type="datetime-local" />
                </label>
                <label>Motivo administrativo
                  <textarea id="content-transition-reason" minlength="8" maxlength="240" required></textarea>
                </label>
                <p id="content-transition-message" role="status" style="margin:0;color:var(--muted)"></p>
                <div><button class="primary-button" type="submit">Aplicar transição</button></div>
              </form>
            </section>
          </div>`
        : `<div class="callout" style="margin-top:16px">Modo somente leitura: este actor não possui <strong>content.manage</strong>.</div>`
    }

    <div style="margin-top:16px"><a href="#content">← Voltar para Conteúdo</a></div>`;

  document
    .querySelector("#content-revise-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#content-revise-status");
      if (status) status.textContent = "Salvando…";
      try {
        await api(`/content/${encodeURIComponent(contentId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              title: document
                .querySelector("#content-revise-title")
                ?.value?.trim(),
              summary: document
                .querySelector("#content-revise-summary")
                ?.value?.trim(),
            },
            reason: document
              .querySelector("#content-revise-reason")
              ?.value?.trim(),
          }),
        });
        await renderContent(contentId);
      } catch (error) {
        if (status) status.textContent = error.body?.error || error.message;
      }
    });

  document
    .querySelector("#content-transition-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = document.querySelector("#content-transition-message");
      if (status) status.textContent = "Aplicando…";
      try {
        const target = document.querySelector(
          "#content-transition-status",
        )?.value;
        const localSchedule = document.querySelector(
          "#content-scheduled-for",
        )?.value;
        const scheduledFor =
          target === "scheduled" && localSchedule
            ? new Date(localSchedule).toISOString()
            : undefined;
        await api(`/content/${encodeURIComponent(contentId)}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: target,
            ...(scheduledFor ? { scheduledFor } : {}),
            reason: document
              .querySelector("#content-transition-reason")
              ?.value?.trim(),
          }),
        });
        await renderContent(contentId);
      } catch (error) {
        if (status) status.textContent = error.body?.error || error.message;
      }
    });
}

function renderContractGap(view) {
  content.innerHTML = `
    <section class="card empty">
      <strong>Contrato administrativo ainda não registrado</strong>
      <span>
        O Control Center não consulta tabelas deste domínio diretamente.
        A integração de <b>${escapeHtml(view)}</b> será feita pelo adapter oficial do domínio.
      </span>
    </section>`;
}

async function renderAudit() {
  const data = await api("/audit?limit=100");
  content.innerHTML = `
    <div class="callout">
      <strong>Auditoria append-only:</strong>
      persistência atual: ${escapeHtml(data.durability)}. O actor real permanece registrado,
      inclusive quando existe effectiveUser em modo suporte.
    </div>
    <div class="table-wrap" tabindex="0">
      <table>
        <thead><tr><th>Quando</th><th>Actor</th><th>Ação</th><th>Entidade</th><th>Resultado</th></tr></thead>
        <tbody>
          ${
            data.entries
              .map(
                (entry) =>
                  `<tr>
                    <td>${escapeHtml(entry.timestamp)}</td>
                    <td>${escapeHtml(entry.actorUserId)}<br><small>${escapeHtml(entry.actorRole)}</small></td>
                    <td>${escapeHtml(entry.action)}</td>
                    <td>${escapeHtml(entry.entityType ?? "—")} ${escapeHtml(entry.entityId ?? "")}</td>
                    <td>${statusBadge(entry.result)}</td>
                  </tr>`,
              )
              .join("") ||
            '<tr><td colspan="5" class="empty">Nenhuma ação administrativa registrada neste runtime.</td></tr>'
          }
        </tbody>
      </table>
    </div>`;
}

async function renderSystem() {
  const data = await api("/system");
  const checks = data.health?.checks ?? [];
  content.innerHTML = `
    <div class="grid stats">
      <article class="card stat">
        <span class="stat-label">Release SHA</span>
        <strong class="stat-value" style="font-size:16px">${escapeHtml(data.release?.sha)}</strong>
        <small>Identidade do runtime</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Versão</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(data.release?.version)}</strong>
        <small>Release version</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Deployment</span>
        <strong class="stat-value" style="font-size:20px">${escapeHtml(data.release?.deploymentId)}</strong>
        <small>Deployment ID</small>
      </article>
      <article class="card stat">
        <span class="stat-label">Secrets</span>
        <strong class="stat-value" style="font-size:20px">REDACTED</strong>
        <small>Nunca expostos pela API</small>
      </article>
    </div>
    <section class="card section-card" style="margin-top:16px">
      <div class="section-title">
        <h2>Readiness checks</h2>
        <button id="system-refresh" class="secondary-button" type="button">Atualizar status</button>
      </div>
      <div class="health-list">
        ${checks
          .map(
            (check) =>
              `<div class="health-row">
                <span><i class="status-dot status-${escapeHtml(check.status)}"></i>${escapeHtml(check.name)}</span>
                <small>${escapeHtml(check.detail)}</small>
              </div>`,
          )
          .join("")}
      </div>
    </section>`;

  document
    .querySelector("#system-refresh")
    ?.addEventListener("click", () => void render("system"));
}

function renderSettings() {
  const preferences = readControlCenterPreferences();
  const viewOptions = Object.entries(pageCopy)
    .filter(([id]) => id !== "settings")
    .map(
      ([id, [label]]) =>
        `<option value="${escapeHtml(id)}" ${preferences.defaultView === id ? "selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join("");

  content.innerHTML = `
    <div class="callout">
      <strong>Escopo seguro:</strong>
      estas preferências são locais a este navegador. Secrets, chaves, variáveis
      de ambiente, permissões e configuração de produção nunca são editados aqui.
    </div>
    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title">
          <h2>Experiência do Control Center</h2>
          <span class="badge pass">preferência local</span>
        </div>
        <form id="control-center-settings-form" class="form-grid">
          <label>Página inicial
            <select name="defaultView">${viewOptions}</select>
          </label>
          <label>Densidade
            <select name="density">
              <option value="comfortable" ${preferences.density === "comfortable" ? "selected" : ""}>Confortável</option>
              <option value="compact" ${preferences.density === "compact" ? "selected" : ""}>Compacta</option>
            </select>
          </label>
          <label>Movimento
            <select name="motion">
              <option value="system" ${preferences.motion === "system" ? "selected" : ""}>Seguir sistema</option>
              <option value="reduced" ${preferences.motion === "reduced" ? "selected" : ""}>Reduzido</option>
            </select>
          </label>
          <button class="primary-button" type="submit">Salvar preferências</button>
          <p id="settings-result" role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="card section-card">
        <div class="section-title"><h2>Fronteiras administrativas</h2></div>
        <div class="module-list">
          <div class="module-row"><span>Secrets</span><strong>somente server-side</strong></div>
          <div class="module-row"><span>Roles e bloqueios</span><a href="#users">Auth owner</a></div>
          <div class="module-row"><span>Destinos</span><a href="#destinations">Destination owner</a></div>
          <div class="module-row"><span>Conteúdo</span><a href="#content">Content owner</a></div>
          <div class="module-row"><span>Saúde do sistema</span><a href="#system">somente leitura</a></div>
        </div>
      </section>
    </div>`;

  document
    .querySelector("#control-center-settings-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      saveControlCenterPreferences({
        defaultView: String(values.get("defaultView") || "overview"),
        density: String(values.get("density") || "comfortable"),
        motion: String(values.get("motion") || "system"),
      });
      const result = form.querySelector("#settings-result");
      if (result) {
        result.textContent =
          "Preferências salvas neste navegador. Nenhuma configuração sensível foi alterada.";
      }
    });
}

async function renderSupport() {
  const data = await api("/users");
  const platformRoles = new Set([
    "PLATFORM_OWNER",
    "PLATFORM_ADMIN",
    "SUPPORT",
    "AUDITOR",
  ]);
  const eligible = data.users.filter(
    (user) => !platformRoles.has(user.canonicalRole),
  );

  content.innerHTML = `
    <section class="card section-card">
      <div class="section-title">
        <h2>Iniciar modo suporte</h2>
        <span class="badge">actor preservado</span>
      </div>
      <p style="color:var(--muted)">
        A sessão não substitui credenciais. O administrador real continua identificado,
        com effectiveUser separado e motivo obrigatório.
      </p>
      <form id="support-form" class="form-grid">
        <label>
          Usuário efetivo
          <select id="support-user" required>
            ${eligible
              .map(
                (user) =>
                  `<option value="${escapeHtml(user.id)}">${escapeHtml(user.email)} — ${escapeHtml(user.canonicalRole)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label>
          Motivo obrigatório
          <textarea id="support-reason" required minlength="8" maxlength="240" placeholder="Ex.: Reproduzir falha reportada no painel da empresa"></textarea>
        </label>
        <div><button class="primary-button" type="submit">Entrar em modo suporte</button></div>
      </form>
    </section>`;

  document
    .querySelector("#support-form")
    ?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api("/support/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            effectiveUserId: document.querySelector("#support-user").value,
            reason: document.querySelector("#support-reason").value,
          }),
        });
        state.adminSession.support = result.support;
        applySupportBanner();
      } catch (error) {
        globalThis.alert(error.body?.error || error.message);
      }
    });
}

async function render(view, detail) {
  state.view = view;
  renderNav();
  setHeading(view);
  delete content.dataset.renderedView;
  content.setAttribute("aria-busy", "true");
  content.innerHTML = '<section class="card empty">Carregando…</section>';

  try {
    if (view === "overview") await renderOverview();
    else if (view === "users") await renderUsers(detail);
    else if (view === "businesses") await renderBusinesses(detail);
    else if (view === "affiliates") await renderAffiliates(detail);
    else if (view === "destinations") await renderDestinations(detail);
    else if (view === "crm") await renderCrm();
    else if (view === "products") await renderProducts(detail);
    else if (view === "reservations") await renderReservations(detail);
    else if (view === "ticketing") await renderTicketing();
    else if (view === "orders") await renderOrders(detail);
    else if (view === "financial") await renderFinancial(detail);
    else if (view === "content") await renderContent(detail);
    else if (view === "audit") await renderAudit();
    else if (view === "system") await renderSystem();
    else if (view === "settings") renderSettings();
    else if (view === "support") await renderSupport();
    else renderContractGap(view);
  } catch (error) {
    content.innerHTML = `
      <section class="card empty">
        <strong>Não foi possível carregar este módulo</strong>
        <span>${escapeHtml(error.body?.error || error.message)}</span>
      </section>`;
  } finally {
    content.dataset.renderedView = view;
    content.setAttribute("aria-busy", "false");
  }
}

function applySupportBanner() {
  const support = state.adminSession?.support;
  supportBanner.hidden = !support;
  if (!support) return;

  supportContext.textContent =
    `Visualizando como: ${support.effectiveUser.email} · ` +
    `Empresa: ${support.effectiveUser.businessIds?.[0] ?? "sem tenant"} · ` +
    `Motivo: ${support.reason}`;
}

function openHash(hash = globalThis.location.hash) {
  const defaultView = readControlCenterPreferences().defaultView;
  const raw = hash.replace(/^#/, "") || defaultView;
  const [view, detail] = raw.split(":", 2);
  void render(pageCopy[view] ? view : "overview", detail);
}

let searchTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = searchInput.value.trim();
  if (query.length < 2) {
    searchResults.hidden = true;
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const data = await api(`/search?q=${encodeURIComponent(query)}`);
      searchResults.innerHTML =
        data.results
          .map(
            (result) =>
              `<div class="search-result" data-href="${escapeHtml(result.href ?? "")}">
                <span>
                  <strong>${escapeHtml(result.title)}</strong><br>
                  <small>${escapeHtml(result.type)} · ${escapeHtml(result.context ?? result.domain ?? "")}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </div>`,
          )
          .join("") || '<div class="empty">Nenhum resultado encontrado.</div>';
      searchResults.hidden = false;
    } catch {
      searchResults.hidden = true;
    }
  }, 180);
});

searchResults.addEventListener("click", (event) => {
  const item = event.target.closest("[data-href]");
  if (!item) return;
  globalThis.location.hash = item.dataset.href || "#overview";
  searchResults.hidden = true;
  searchInput.value = "";
});

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape") searchResults.hidden = true;
});

nav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  globalThis.location.hash = `#${button.dataset.view}`;
  app.classList.remove("menu-open");
});

menuButton?.addEventListener("click", () => app.classList.toggle("menu-open"));

document
  .querySelector("#logout-button")
  .addEventListener("click", () => auth.logout());

document.querySelector("#support-end").addEventListener("click", async () => {
  await api("/support/session", { method: "DELETE" });
  state.adminSession.support = null;
  applySupportBanner();
});

globalThis.addEventListener("hashchange", () => openHash());

async function bootApp() {
  try {
    applyControlCenterPreferences();
    state.session = await auth.getSession();
    state.adminSession = await api("/session");
    state.dashboard = await api("/dashboard");

    actorCard.innerHTML =
      `<strong>${escapeHtml(state.adminSession.actor.email)}</strong>` +
      `<span>${escapeHtml(state.adminSession.actor.canonicalRole)}</span>`;

    const releaseSha =
      state.dashboard.health?.release?.sha ??
      state.dashboard.health?.releaseSha ??
      "—";
    releaseChip.textContent = `SHA ${String(releaseSha).slice(0, 8)}`;

    const ready = state.dashboard.health?.readiness === "ready";
    healthChip.textContent = ready ? "Operacional" : "Atenção";
    healthChip.className = `chip ${ready ? "chip-success" : "chip-warning"}`;

    applySupportBanner();
    app.hidden = false;
    boot.hidden = true;
    openHash();
  } catch (error) {
    if (error?.status === 401 || error?.message === "AUTH_REQUIRED") {
      globalThis.location.replace(
        `/dashboard/login.html?return=${encodeURIComponent("/apps/control-center/public/index.html")}`,
      );
      return;
    }
    boot.innerHTML =
      `<strong>Acesso ao Control Center indisponível</strong>` +
      `<span>${escapeHtml(error.body?.error || error.message)}</span>`;
  }
}

void bootApp();
