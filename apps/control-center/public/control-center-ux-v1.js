import { createDashboardAuthClient } from "@touristic/auth-browser";

const auth = createDashboardAuthClient({
  fetchFn: globalThis.fetch.bind(globalThis),
  storage: globalThis.sessionStorage,
  location: globalThis.location,
});

const app = document.querySelector("#app");
const nav = document.querySelector("#main-nav");
const contentRoot = document.querySelector("#content");
const pageTitle = document.querySelector("#page-title");
const pageDescription = document.querySelector("#page-description");
const breadcrumb = document.querySelector("#breadcrumb");
const pageDate = document.querySelector("#page-date");
const pageHealth = document.querySelector("#page-health");
const destinationSelector = document.querySelector("#destination-selector");
const globalScope = document.querySelector("#global-scope");
const notificationBadge = document.querySelector("#notification-badge");
const profileName = document.querySelector("#profile-name");
const profileAvatar = document.querySelector("#profile-avatar");
const searchInput = document.querySelector("#global-search");
const searchResults = document.querySelector("#search-results");

const destinationStorageKey = "md_control_center_destination_v1";
const state = {
  actor: null,
  dashboard: null,
  destinations: [],
  destinationId: "global",
  generation: 0,
};

const navGroups = [
  ["Principal", [["Visão Global", "#overview", "◎", "global"]]],
  ["Operação", [["Visão Geral", "#overview", "◫", "overview"]]],
  ["Relacionamentos", [
    ["Empresas", "#businesses", "▦", "businesses"],
    ["Usuários", "#users", "●", "users"],
    ["Afiliados", "#affiliates", "◇", "affiliates"],
  ]],
  ["Comercial", [
    ["CRM", "#crm", "◈", "crm"],
    ["Produtos", "#products", "▤", "products"],
    ["Ofertas", "#products", "◇", "offers"],
    ["Conteúdo", "#content", "✦", "content"],
  ]],
  ["Reservas", [
    ["Reservas", "#reservations", "▣", "reservations"],
    ["Ticketing", "#ticketing", "◉", "ticketing"],
    ["Check-in", "#ticketing", "✓", "checkin"],
  ]],
  ["Financeiro", [
    ["Pedidos", "#orders", "≡", "orders"],
    ["Pagamentos", "#financial", "◐", "financial"],
    ["Reembolsos", "#financial", "↺", "refunds"],
    ["Comissões", "#affiliates", "%", "commissions"],
  ]],
  ["Controle", [
    ["Suporte", "#support", "◎", "support"],
    ["Auditoria", "#audit", "⌁", "audit"],
  ]],
  ["Plataforma", [
    ["Sistema", "#system", "⚙", "system"],
    ["Destinos", "#destinations", "⌖", "destinations"],
    ["Integrações", "#system", "⌘", "integrations"],
    ["Configurações", "#settings", "⋯", "settings"],
  ]],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path) {
  const response = await auth.secureFetch("/api/admin/v1" + path, {
    headers: { Accept: "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "CONTROL_CENTER_UX_REQUEST_FAILED");
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function actorHas(capability) {
  return Boolean(state.actor?.capabilities?.includes(capability));
}

function actorName() {
  const email = String(state.actor?.email || "");
  const local = email.split("@")[0] || "Admin";
  const first = local.split(/[._-]/u)[0] || "Admin";
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1);
}

function currentDestination() {
  if (state.destinationId === "global") return null;
  return state.destinations.find((item) => item.id === state.destinationId) || null;
}

function currentDestinationName() {
  const item = currentDestination();
  return item?.branding?.name || item?.name || state.destinationId;
}

function destinationName(id) {
  const item = state.destinations.find((candidate) => candidate.id === id);
  return item?.branding?.name || item?.name || id || "Todos os destinos";
}

function destinationMatches(id) {
  return state.destinationId === "global" || id === state.destinationId;
}

function sameLocalDay(value, reference = new Date()) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate();
}

function formattedDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function statusBadge(value) {
  const normalized = String(value || "").toLowerCase();
  const cls = ["active", "available", "ready", "pass", "success"].includes(normalized)
    ? "pass"
    : ["warning", "partial", "runtime-projection"].includes(normalized)
      ? "partial"
      : "gap";
  return '<span class="badge ' + cls + '">' + escapeHtml(value || "indisponível") + "</span>";
}

function formatMoney(money) {
  const minor = Number(money?.minorUnits);
  const currency = String(money?.currency || "");
  if (!Number.isFinite(minor) || !currency) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return String(minor) + " " + currency;
  }
}

function setDestination(id, rerender = true) {
  const valid = id === "global" || state.destinations.some((item) => item.id === id);
  state.destinationId = valid ? id : "global";
  globalThis.sessionStorage.setItem(destinationStorageKey, state.destinationId);
  document.documentElement.dataset.destinationId = state.destinationId;
  if (destinationSelector) destinationSelector.value = state.destinationId;
  if (globalScope) globalScope.setAttribute("aria-pressed", String(state.destinationId === "global"));
  if (rerender) void upgradeCurrentView();
}

function populateDestinationSelector() {
  if (!destinationSelector) return;
  const options = ['<option value="global">Todos os destinos</option>'];
  for (const item of state.destinations) {
    options.push(
      '<option value="' +
        escapeHtml(item.id) +
        '">' +
        escapeHtml(item.branding?.name || item.name || item.id) +
        "</option>",
    );
  }
  destinationSelector.innerHTML = options.join("");
  const stored = globalThis.sessionStorage.getItem(destinationStorageKey) || "global";
  setDestination(stored, false);
}

function rebuildNavigation() {
  if (!nav) return;
  if (nav.querySelector(".nav-group") && nav.dataset.uxV1 === "1") return;
  const currentHash = globalThis.location.hash || "#overview";
  nav.innerHTML = navGroups
    .map(([group, items]) => {
      const buttons = items
        .map(([label, href, icon, key]) => {
          const active =
            key === "global"
              ? state.destinationId === "global" && currentHash === "#overview"
              : currentHash === href && !(key === "offers" || key === "checkin" || key === "payments" || key === "refunds" || key === "commissions" || key === "integrations");
          const canonicalViews = new Set([
            "overview",
            "businesses",
            "users",
            "affiliates",
            "crm",
            "products",
            "reservations",
            "ticketing",
            "orders",
            "financial",
            "content",
            "destinations",
            "support",
            "audit",
            "system",
            "settings",
          ]);
          const attrs =
            key === "global"
              ? 'data-ux-global="true"'
              : canonicalViews.has(key)
                ? 'data-view="' + escapeHtml(key) + '" data-ux-href="' + escapeHtml(href) + '"'
                : 'data-ux-href="' + escapeHtml(href) + '"';
          return (
            '<button type="button" class="nav-item ' +
            (active ? "active" : "") +
            '" ' +
            attrs +
            ' data-ux-key="' +
            escapeHtml(key) +
            '">' +
            '<span class="nav-icon" aria-hidden="true">' +
            icon +
            "</span><span>" +
            escapeHtml(label) +
            "</span></button>"
          );
        })
        .join("");
      return (
        '<section class="nav-group" aria-label="' +
        escapeHtml(group) +
        '"><p class="nav-group-label">' +
        escapeHtml(group) +
        '</p><div class="nav-group-items">' +
        buttons +
        "</div></section>"
      );
    })
    .join("");
  nav.dataset.uxV1 = "1";
}

function pageContext(view) {
  const destination = state.destinationId === "global" ? "Visão Global" : currentDestinationName();
  if (view === "overview") {
    if (pageTitle) pageTitle.textContent = "Bom dia, " + actorName();
    if (pageDescription) {
      pageDescription.textContent =
        state.destinationId === "global"
          ? "Resumo da operação da plataforma."
          : "Resumo da operação de " + destination + ".";
    }
    if (breadcrumb) breadcrumb.textContent = "Morro Digital → " + destination;
  } else if (breadcrumb) {
    const label = String(pageTitle?.textContent || "").trim() || "Módulo";
    breadcrumb.textContent = "Morro Digital → " + destination + " → " + label;
  }
  if (pageDate) pageDate.textContent = formattedDate();
}

function metricCard(label, value, meta, tone, icon) {
  return (
    '<article class="card metric-card" data-tone="' +
    escapeHtml(tone) +
    '"><div class="metric-card__top"><span class="metric-card__label">' +
    escapeHtml(label) +
    '</span><span class="metric-card__icon" aria-hidden="true">' +
    escapeHtml(icon) +
    '</span></div><strong class="metric-card__value">' +
    escapeHtml(value) +
    '</strong><span class="metric-card__meta">' +
    escapeHtml(meta) +
    "</span></article>"
  );
}

async function loadHomeData() {
  const dashboard = await api("/dashboard");
  state.dashboard = dashboard;
  const destinationQuery =
    state.destinationId === "global"
      ? ""
      : "&destinationId=" + encodeURIComponent(state.destinationId);
  const reservationQuery = "/reservations?limit=100" + destinationQuery;
  const affiliateQuery = "/affiliates?limit=100" + destinationQuery;
  const requests = [
    api("/audit?limit=8").catch(() => ({ entries: [] })),
    api(reservationQuery).catch(() => ({ data: null })),
    api(affiliateQuery).catch(() => ({ data: null })),
    state.destinationId === "global"
      ? Promise.resolve(null)
      : api("/reservations?limit=100").catch(() => ({ data: null })),
  ];
  const [audit, reservations, affiliates, globalReservations] =
    await Promise.all(requests);
  return {
    dashboard,
    audit,
    reservations,
    affiliates,
    globalReservations: globalReservations || reservations,
  };
}

async function revenueForReservations(rows) {
  if (!Array.isArray(rows)) return { value: "—", meta: "Financial indisponível" };
  const paymentIds = [
    ...new Set(
      rows
        .map((item) => item?.reservation?.paymentId)
        .filter(Boolean),
    ),
  ];
  if (paymentIds.length === 0) return { value: "R$ 0,00", meta: "nenhum pagamento ligado" };
  if (paymentIds.length > 30) return { value: "—", meta: "agregado diário exige endpoint owner" };
  const payments = await Promise.all(
    paymentIds.map((id) =>
      api("/payments/" + encodeURIComponent(id))
        .then((result) => result.data)
        .catch(() => null),
    ),
  );
  const approved = payments.filter((payment) => payment?.status === "APPROVED");
  const currencies = [...new Set(approved.map((payment) => payment?.amount?.currency).filter(Boolean))];
  if (currencies.length > 1) return { value: "—", meta: "múltiplas moedas" };
  const currency = currencies[0] || "BRL";
  const total = approved.reduce(
    (sum, payment) => sum + Number(payment?.amount?.minorUnits || 0),
    0,
  );
  return {
    value: formatMoney({ minorUnits: total, currency }),
    meta: approved.length + " pagamento(s) aprovado(s)",
  };
}

function attentionItems(dashboard) {
  const health = dashboard.health || {};
  const healthItems = (health.checks || [])
    .filter((check) => check.status !== "pass")
    .map((check) => ({
      title: check.name,
      detail: check.detail || check.status,
      href: "#system",
      severity: check.status === "fail" ? "danger" : "warning",
    }));
  const moduleItems = Object.entries(dashboard.modules || {})
    .filter(([, module]) => !["available", "ready"].includes(module?.state))
    .map(([name, module]) => ({
      title: "Integração " + name,
      detail: "Estado: " + (module?.state || "indisponível"),
      href: "#system",
      severity: "warning",
    }));
  return [...healthItems, ...moduleItems].slice(0, 4);
}

function quickActions() {
  const actions = [];
  if (actorHas("business.read")) actions.push(['#businesses', "Empresas", "primary", "▦"]);
  if (actorHas("affiliate.read")) actions.push(['#affiliates', "Afiliados", "positive", "◇"]);
  if (actorHas("support.impersonate")) actions.push(['#support', "Abrir suporte", "", "◎"]);
  if (actorHas("audit.read")) actions.push(['#audit', "Ver auditoria", "", "⌁"]);
  return actions
    .slice(0, 4)
    .map(
      ([href, label, cls, icon]) =>
        '<a class="quick-action ' +
        cls +
        '" href="' +
        href +
        '"><span aria-hidden="true">' +
        icon +
        "</span>" +
        escapeHtml(label) +
        "</a>",
    )
    .join("");
}

function activityHtml(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<div class="empty"><strong>Nenhuma atividade recente</strong><span>Eventos administrativos aparecerão aqui quando existirem.</span></div>';
  }
  return entries
    .slice(0, 8)
    .map((entry) => {
      const date = new Date(entry.timestamp);
      const time = Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const result = String(entry.result || "").toLowerCase();
      const tone =
        result === "success"
          ? "success"
          : result === "denied" || result === "failure"
            ? "danger"
            : "warning";
      return (
        '<div class="timeline-item"><span class="timeline-time">' +
        escapeHtml(time) +
        '</span><span class="timeline-dot ' +
        tone +
        '" aria-hidden="true"></span><div class="timeline-body"><strong>' +
        escapeHtml(entry.action || "Ação administrativa") +
        '</strong><span class="timeline-meta">' +
        escapeHtml(entry.entityType || "") +
        " " +
        escapeHtml(entry.entityId || "") +
        "</span></div></div>"
      );
    })
    .join("");
}

function destinationRows(reservations) {
  return state.destinations
    .map((destination) => {
      const allReservations = Array.isArray(reservations?.data) ? reservations.data : [];
      const today = allReservations.filter(
        (item) =>
          item?.reservation?.destinationId === destination.id &&
          sameLocalDay(item?.reservation?.createdAt),
      ).length;
      const reservationValue = Array.isArray(reservations?.data) ? String(today) : "—";
      return (
        '<tr class="destination-row" data-destination-row="' +
        escapeHtml(destination.id) +
        '" tabindex="0"><td><div class="destination-cell"><span class="destination-thumb" aria-hidden="true">⌖</span><div><strong>' +
        escapeHtml(destination.branding?.name || destination.name || destination.id) +
        '</strong><br><small>' +
        escapeHtml(destination.status || "—") +
        "</small></div></div></td><td>—</td><td>—</td><td>" +
        escapeHtml(reservationValue) +
        ' <small>hoje</small></td><td>—</td><td>' +
        (destination.status === "active"
          ? '<span class="badge pass">operacional</span>'
          : statusBadge(destination.status || "partial")) +
        "</td></tr>"
      );
    })
    .join("");
}

async function renderHome() {
  if (!contentRoot) return;
  const generation = ++state.generation;
  contentRoot.setAttribute("aria-busy", "true");
  contentRoot.innerHTML =
    '<div class="grid kpi-grid" aria-hidden="true">' +
    Array.from({ length: 5 }, () =>
      '<div class="skeleton-card"><div class="skeleton skeleton-line" style="width:42%"></div><div class="skeleton skeleton-value"></div><div class="skeleton skeleton-line" style="width:66%"></div></div>',
    ).join("") +
    "</div>";

  try {
    const data = await loadHomeData();
    if (generation !== state.generation) return;
    const reservationRows = Array.isArray(data.reservations.data) ? data.reservations.data : null;
    const todayRows = reservationRows
      ? reservationRows.filter((item) => sameLocalDay(item?.reservation?.createdAt))
      : null;
    const revenue = await revenueForReservations(todayRows);
    if (generation !== state.generation) return;
    const affiliateCount = Array.isArray(data.affiliates.data)
      ? data.affiliates.data.length === 100
        ? "100+"
        : String(data.affiliates.data.length)
      : "—";
    const reservationCount = todayRows
      ? todayRows.length === 100
        ? "100+"
        : String(todayRows.length)
      : "—";
    const alertCount = Number(data.dashboard.summary?.alerts || 0);
    const businessValue =
      state.destinationId === "global"
        ? String(data.dashboard.summary?.businesses ?? "—")
        : "—";
    const businessMeta =
      state.destinationId === "global"
        ? "cadastros conhecidos"
        : "agregado por destino não exposto pelo owner";
    const attention = attentionItems(data.dashboard);

    const attentionHtml = attention.length
      ? '<div class="attention-grid">' +
        attention
          .map(
            (item) =>
              '<a class="attention-item" href="' +
              item.href +
              '"><span class="attention-item__icon" aria-hidden="true">!</span><span class="attention-item__copy"><strong>1</strong><span>' +
              escapeHtml(item.title) +
              " · " +
              escapeHtml(item.detail) +
              '</span></span><span aria-hidden="true">›</span></a>',
          )
          .join("") +
        "</div>"
      : '<div class="attention-empty"><strong>Nenhuma pendência crítica.</strong> Tudo funcionando normalmente.</div>';

    contentRoot.innerHTML =
      '<div class="grid kpi-grid">' +
      metricCard("Empresas", businessValue, businessMeta, "info", "▦") +
      metricCard("Afiliados", affiliateCount, state.destinationId === "global" ? "cadastros retornados pelo domínio" : "atribuídos ao destino selecionado", "success", "◇") +
      metricCard("Reservas Hoje", reservationCount, todayRows ? "criadas hoje" : "fonte indisponível", "purple", "▣") +
      metricCard("Receita Hoje", revenue.value, revenue.meta, "success", "●") +
      metricCard("Alertas", String(alertCount), "itens que exigem atenção", alertCount > 0 ? "warning" : "success", "!") +
      "</div>" +
      '<section class="card section-card attention-panel"><div class="section-title"><div><h2>Precisa da sua atenção</h2><p>Itens que exigem ação imediata</p></div><a class="section-link" href="#system">Ver todos os alertas</a></div>' +
      attentionHtml +
      "</section>" +
      '<div class="grid home-lower-grid"><div class="home-stack"><section class="card section-card destination-summary"><div class="section-title"><div><h2>Resumo por destino</h2><p>Selecione uma linha para entrar no contexto daquele destino.</p></div><a class="section-link" href="#destinations">Gerenciar destinos</a></div><div class="table-wrap"><table><thead><tr><th>Destino</th><th>Empresas</th><th>Afiliados</th><th>Reservas</th><th>Receita</th><th>Alertas</th></tr></thead><tbody>' +
      (destinationRows(data.globalReservations) || '<tr><td colspan="6" class="empty">Nenhum destino disponível para este actor.</td></tr>') +
      "</tbody></table></div></section>" +
      '<section class="card section-card"><div class="section-title"><div><h2>Atividade recente</h2><p>Eventos operacionais e administrativos compreensíveis.</p></div><a class="section-link" href="#audit">Ver todos os eventos</a></div><div class="timeline">' +
      activityHtml(data.audit.entries || []) +
      "</div></section></div>" +
      '<div class="home-stack"><section class="card section-card"><div class="section-title"><h2>Ações rápidas</h2></div><div class="quick-actions">' +
      (quickActions() || '<div class="empty"><strong>Nenhuma ação disponível</strong><span>As ações respeitam as capabilities do actor.</span></div>') +
      "</div></section>" +
      '<section class="card section-card affiliate-model-card"><div class="section-title"><h2>Afiliados pertencem à Morro Digital</h2></div><div class="affiliate-model-card__body"><span class="affiliate-model-card__icon" aria-hidden="true">◇</span><p>Os afiliados são da Morro Digital e são organizados por destino, não por empresa. Eles podem promover produtos de várias empresas do mesmo destino, fortalecendo todo o ecossistema.</p></div></section></div></div>';

    contentRoot.querySelectorAll("[data-destination-row]").forEach((row) => {
      const activate = () => {
        setDestination(row.dataset.destinationRow, false);
        globalThis.location.hash = "#overview";
        void upgradeCurrentView();
      };
      row.addEventListener("click", activate);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });

    if (notificationBadge) {
      notificationBadge.hidden = alertCount <= 0;
      notificationBadge.textContent = String(alertCount);
    }
  } catch (error) {
    if (generation !== state.generation) return;
    contentRoot.innerHTML =
      '<section class="card state-panel"><strong>Não foi possível carregar a visão operacional</strong><p>Os dados administrativos não estão disponíveis agora. Tente novamente ou consulte Sistema.</p><div class="state-actions"><button id="ux-home-retry" class="secondary-button" type="button">Tentar novamente</button><a class="primary-button" href="#system">Ver sistema</a></div></section>';
    document.querySelector("#ux-home-retry")?.addEventListener("click", () => void renderHome());
  } finally {
    contentRoot.setAttribute("aria-busy", "false");
  }
}

function entity360Header(view, detail) {
  if (!detail || !contentRoot || contentRoot.querySelector(".entity-header[data-ux-v1]")) return;
  const configs = {
    businesses: ["Empresa", ["Resumo", "Perfil", "Usuários", "Produtos", "Ofertas", "Reservas", "Financeiro", "CRM", "Histórico", "Auditoria"]],
    affiliates: ["Afiliado", ["Resumo", "Perfil", "Destinos", "Atribuições", "Conversões", "Comissões", "Histórico", "Auditoria"]],
    users: ["Usuário", ["Resumo", "Conta", "Permissões", "Empresas", "Sessões", "Histórico", "Auditoria"]],
  };
  const config = configs[view];
  if (!config) return;
  const section = document.createElement("section");
  section.className = "card entity-header";
  section.dataset.uxV1 = "true";
  section.innerHTML =
    '<div class="entity-header__top"><div><h2>' +
    escapeHtml(config[0] + " · " + decodeURIComponent(detail)) +
    '</h2><div class="entity-header__meta"><span>' +
    escapeHtml(state.destinationId === "global" ? "Visão Global" : currentDestinationName()) +
    '</span><span>Visão 360° administrativa</span></div></div></div><nav class="entity-tabs" aria-label="Visão 360°">' +
    config[1]
      .map(
        (tab, index) =>
          '<span class="entity-tab ' +
          (index === 0 ? "active" : "") +
          '">' +
          escapeHtml(tab) +
          "</span>",
      )
      .join("") +
    "</nav>";
  contentRoot.prepend(section);
}

function responsiveTables() {
  if (!contentRoot) return;
  contentRoot.querySelectorAll(".table-wrap").forEach((wrap) => {
    wrap.classList.add("responsive-cards");
    const headers = [...wrap.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    wrap.querySelectorAll("tbody tr").forEach((row) => {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === "TD" && headers[index]) cell.dataset.label = headers[index];
      });
    });
  });
}

function failClosedDestinationScope(view) {
  if (!contentRoot || state.destinationId === "global") return;
  if (["businesses", "affiliates"].includes(view) && !globalThis.location.hash.includes(":")) {
    const existing = contentRoot.querySelector("[data-ux-destination-warning]");
    if (existing) return;
    const warning = document.createElement("div");
    warning.className = "callout info";
    warning.dataset.uxDestinationWarning = "true";
    warning.innerHTML =
      "<strong>Contexto de destino protegido:</strong> " +
      escapeHtml(currentDestinationName()) +
      ". Este domínio ainda não expõe um filtro owner canônico por destinationId; o Control Center não atribui registros por inferência. Use a busca ou abra a visão 360° até a projeção owner estar disponível.";
    contentRoot.prepend(warning);
  }

  if (["reservations", "products"].includes(view) && !globalThis.location.hash.includes(":")) {
    const table = contentRoot.querySelector("table");
    if (!table) return;
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim().toLocaleLowerCase());
    const destinationIndex = headers.findIndex((header) => header.includes("destino"));
    if (destinationIndex < 0) return;
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cell = row.children[destinationIndex];
      if (!cell) return;
      const value = String(cell.textContent || "").trim();
      const match =
        value === state.destinationId ||
        value.toLocaleLowerCase().includes(currentDestinationName().toLocaleLowerCase());
      row.hidden = !match;
    });
  }
}

function searchKeyboardSupport() {
  if (!searchInput || searchInput.dataset.uxKeyboard === "1") return;
  searchInput.dataset.uxKeyboard = "1";
  let active = -1;
  const options = () => [...searchResults.querySelectorAll("[data-href]")];
  const setActive = (index) => {
    const items = options();
    if (!items.length) return;
    active = ((index % items.length) + items.length) % items.length;
    items.forEach((item, itemIndex) => {
      item.setAttribute("aria-selected", String(itemIndex === active));
    });
    items[active].scrollIntoView({ block: "nearest" });
  };
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(active - 1);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      const target = options()[active];
      if (target?.dataset.href) globalThis.location.hash = target.dataset.href;
      searchResults.hidden = true;
      searchInput.value = "";
      active = -1;
    } else if (event.key === "Escape") {
      searchResults.hidden = true;
      active = -1;
    }
  });
}

async function upgradeCurrentView() {
  if (!app || app.hidden) return;
  rebuildNavigation();
  const raw = (globalThis.location.hash || "#overview").replace(/^#/, "");
  const [view, detail] = raw.split(":", 2);
  pageContext(view || "overview");
  if ((view || "overview") === "overview") {
    await renderHome();
    return;
  }
  entity360Header(view, detail);
  responsiveTables();
  failClosedDestinationScope(view);
}

function wireNavigation() {
  nav?.addEventListener("click", (event) => {
    const globalButton = event.target.closest("[data-ux-global]");
    if (globalButton) {
      event.preventDefault();
      setDestination("global", false);
      globalThis.location.hash = "#overview";
      void upgradeCurrentView();
      return;
    }
    const button = event.target.closest("[data-ux-href]");
    if (!button) return;
    event.preventDefault();
    globalThis.location.hash = button.dataset.uxHref;
  });

  destinationSelector?.addEventListener("change", () => {
    setDestination(destinationSelector.value);
  });

  globalScope?.addEventListener("click", () => {
    setDestination("global");
  });
}

function applyTopbar() {
  const name = actorName();
  if (profileName) profileName.textContent = name;
  if (profileAvatar) profileAvatar.textContent = name.charAt(0);
  if (pageDate) pageDate.textContent = formattedDate();

  const ready = state.dashboard?.health?.readiness === "ready";
  if (pageHealth) {
    pageHealth.classList.toggle("is-warning", !ready);
    const text = pageHealth.querySelector("span");
    if (text) text.textContent = ready ? "Tudo funcionando bem" : "Operação requer atenção";
    const dot = pageHealth.querySelector(".status-dot");
    if (dot) dot.className = "status-dot " + (ready ? "status-pass" : "status-warn");
  }

  const alerts = Number(state.dashboard?.summary?.alerts || 0);
  if (notificationBadge) {
    notificationBadge.hidden = alerts <= 0;
    notificationBadge.textContent = String(alerts);
  }
}

async function initialize() {
  if (!app || !contentRoot) return;
  try {
    const [session, dashboard, destinations] = await Promise.all([
      api("/session"),
      api("/dashboard"),
      api("/destinations").catch(() => ({ destinations: [] })),
    ]);
    state.actor = session.actor;
    state.dashboard = dashboard;
    state.destinations = destinations.destinations || [];
    populateDestinationSelector();
    wireNavigation();
    searchKeyboardSupport();
    applyTopbar();
    rebuildNavigation();
    await upgradeCurrentView();

    const navObserver = new MutationObserver(() => rebuildNavigation());
    navObserver.observe(nav, { childList: true });

    const contentObserver = new MutationObserver(() => {
      const raw = (globalThis.location.hash || "#overview").replace(/^#/, "");
      const [view, detail] = raw.split(":", 2);
      if (view !== "overview") {
        entity360Header(view, detail);
        responsiveTables();
        failClosedDestinationScope(view);
      }
    });
    contentObserver.observe(contentRoot, { childList: true, subtree: false });

    globalThis.addEventListener("hashchange", () => {
      setTimeout(() => void upgradeCurrentView(), 0);
    });
  } catch {
    // The canonical Control Center runtime remains responsible for auth/error UI.
  }
}

function waitForBoot() {
  if (!app || app.hidden) {
    setTimeout(waitForBoot, 40);
    return;
  }
  void initialize();
}

waitForBoot();
