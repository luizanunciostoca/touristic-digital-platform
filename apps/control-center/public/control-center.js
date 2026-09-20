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
    value === "available" || value === "pass" || value === "success"
      ? "pass"
      : value === "partial" || value === "runtime-projection"
        ? "partial"
        : "gap";
  return `<span class="badge ${normalized}">${escapeHtml(value)}</span>`;
}

function renderOverview() {
  const dashboard = state.dashboard;
  const health = dashboard.health ?? { checks: [] };
  const metrics = [
    [
      "Empresas",
      dashboard.summary?.businesses ?? "—",
      "Memberships conhecidas pelo Identity",
    ],
    ["Usuários", dashboard.summary?.users ?? "—", "Identidades configuradas"],
    ["Alertas", dashboard.summary?.alerts ?? "—", "Checks fora de PASS"],
    ["Readiness", health.readiness ?? "—", "Saúde agregada da plataforma"],
  ];

  content.innerHTML = `
    <div class="grid stats">
      ${metrics
        .map(
          ([label, value, hint]) =>
            `<article class="card stat">
              <span class="stat-label">${label}</span>
              <strong class="stat-value">${escapeHtml(value)}</strong>
              <small>${hint}</small>
            </article>`,
        )
        .join("")}
    </div>
    <div class="grid two-col">
      <section class="card section-card">
        <div class="section-title">
          <h2>Saúde operacional</h2>
          <span class="chip">${escapeHtml(health.readiness ?? "unknown")}</span>
        </div>
        <div class="health-list">
          ${
            (health.checks ?? [])
              .map(
                (check) =>
                  `<div class="health-row">
                  <span><i class="status-dot status-${escapeHtml(check.status)}"></i>${escapeHtml(check.name)}</span>
                  <small>${escapeHtml(check.detail ?? check.status)}</small>
                </div>`,
              )
              .join("") || '<div class="empty">Nenhum check disponível.</div>'
          }
        </div>
      </section>
      <section class="card section-card">
        <div class="section-title"><h2>Contratos administrativos</h2></div>
        <div class="module-list">
          ${Object.entries(dashboard.modules ?? {})
            .map(
              ([name, module]) =>
                `<div class="module-row"><span>${escapeHtml(name)}</span>${statusBadge(module.state)}</div>`,
            )
            .join("")}
        </div>
      </section>
    </div>`;
}

async function renderUsers(userId) {
  const data = await api(
    userId ? `/users/${encodeURIComponent(userId)}` : "/users",
  );
  const users = userId ? [data.user] : data.users;

  const userTable = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Usuário</th>
            <th>Papel canônico</th>
            <th>Role runtime</th>
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
                  <td><span class="badge">${escapeHtml(user.canonicalRole)}</span></td>
                  <td>${escapeHtml(user.role)}</td>
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
      <div class="table-wrap" style="margin-top:16px">
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
                    <td>${statusBadge(active ? "pass" : status === "revogada" ? "partial" : "gap")}</td>
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

  content
    .querySelectorAll("[data-revoke-session]")
    .forEach((button) =>
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
async function renderBusinesses(businessId) {
  const data = await api("/businesses");
  if (businessId) {
    const business = data.businesses.find((entry) => entry.id === businessId);
    let profile = null;
    try {
      profile = (
        await api(`/businesses/${encodeURIComponent(businessId)}/profile`)
      ).profile;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    content.innerHTML = `
      <div class="callout">
        <strong>Visão 360º administrativa:</strong>
        os dados abaixo são compostos por contratos owner; se um domínio ainda
        não possui adapter administrativo, ele permanece identificado como parcial.
      </div>
      <div class="grid two-col">
        <section class="card section-card">
          <div class="section-title">
            <h2>${escapeHtml(profile?.name ?? businessId)}</h2>
            <span class="badge partial">Business 360º parcial</span>
          </div>
          <div class="module-list">
            <div class="module-row"><span>Business ID</span><strong>${escapeHtml(businessId)}</strong></div>
            <div class="module-row"><span>Perfil</span>${statusBadge(profile ? "available" : "partial")}</div>
            <div class="module-row"><span>Produtos e ofertas</span>${statusBadge("contract-required")}</div>
            <div class="module-row"><span>Reservas</span>${statusBadge("contract-required")}</div>
            <div class="module-row"><span>Financeiro</span>${statusBadge("contract-required")}</div>
            <div class="module-row"><span>CRM relacionado</span>${statusBadge("contract-required")}</div>
            <div class="module-row"><span>Auditoria</span>${statusBadge("partial")}</div>
          </div>
        </section>
        <section class="card section-card">
          <div class="section-title"><h2>Usuários associados</h2></div>
          <div class="module-list">
            ${
              (business?.members ?? [])
                .map(
                  (member) =>
                    `<div class="module-row"><span>${escapeHtml(member.email)}</span><span class="badge">${escapeHtml(member.canonicalRole)}</span></div>`,
                )
                .join("") ||
              '<div class="empty">Nenhum membro encontrado.</div>'
            }
          </div>
        </section>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="callout">
      <strong>Fronteira preservada:</strong>
      a lista vem de memberships do domínio Identity; o perfil é carregado
      pelo Business owner contract e os demais módulos serão compostos por adapters próprios.
    </div>
    <div class="table-wrap">
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

async function renderCrm() {
  const data = await api("/crm/leads?limit=100");
  const leads = Array.isArray(data.data) ? data.data : [];
  content.innerHTML = `
    <div class="callout">
      CRM é reutilizado por adapter sobre o domínio existente; nenhuma tabela foi movida para o Control Center.
    </div>
    <div class="table-wrap">
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

async function renderTicketing() {
  const data = await api("/ticketing/inventory");
  const inventory = Array.isArray(data.data) ? data.data : [];
  content.innerHTML = `
    <div class="callout">
      O contrato owner atual permite inventário e operações específicas de check-in/dispositivos.
      A listagem administrativa global de reservas ainda não existe e permanece GAP.
    </div>
    <div class="table-wrap">
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
    </div>`;
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
      A projeção abaixo é append-only durante o runtime atual.
      Persistência imutável durável permanece um gate aberto e não é apresentada como concluída.
    </div>
    <div class="table-wrap">
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
      <div class="section-title"><h2>Readiness checks</h2></div>
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
  content.innerHTML = '<section class="card empty">Carregando…</section>';

  try {
    if (view === "overview") renderOverview();
    else if (view === "users") await renderUsers(detail);
    else if (view === "businesses") await renderBusinesses(detail);
    else if (view === "crm") await renderCrm();
    else if (view === "ticketing") await renderTicketing();
    else if (view === "audit") await renderAudit();
    else if (view === "system") await renderSystem();
    else if (view === "support") await renderSupport();
    else renderContractGap(view);
  } catch (error) {
    content.innerHTML = `
      <section class="card empty">
        <strong>Não foi possível carregar este módulo</strong>
        <span>${escapeHtml(error.body?.error || error.message)}</span>
      </section>`;
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
  const raw = hash.replace(/^#/, "") || "overview";
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
