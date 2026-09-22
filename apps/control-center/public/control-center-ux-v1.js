import { createDashboardAuthClient } from "@touristic/auth-browser";
import {
  enhanceControlCenterSurface,
  enhanceDataTables,
  entityHeader,
  errorState,
  escapeHtml,
  statusBadge,
} from "./control-center-primitives.js";

const auth = createDashboardAuthClient({
  fetchFn: globalThis.fetch.bind(globalThis),
  storage: globalThis.sessionStorage,
  location: globalThis.location,
});

const app = document.querySelector("#app");
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

function actorName() {
  const email = String(state.actor?.email || "");
  const local = email.split("@")[0] || "Admin";
  const first = local.split(/[._-]/u)[0] || "Admin";
  return first.charAt(0).toLocaleUpperCase("pt-BR") + first.slice(1);
}

function currentDestination() {
  if (state.destinationId === "global") return null;
  return (
    state.destinations.find((item) => item.id === state.destinationId) || null
  );
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
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

function formattedDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
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
  const valid =
    id === "global" || state.destinations.some((item) => item.id === id);
  state.destinationId = valid ? id : "global";
  globalThis.sessionStorage.setItem(destinationStorageKey, state.destinationId);
  document.documentElement.dataset.destinationId = state.destinationId;
  if (destinationSelector) destinationSelector.value = state.destinationId;
  if (globalScope)
    globalScope.setAttribute(
      "aria-pressed",
      String(state.destinationId === "global"),
    );
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
  const stored =
    globalThis.sessionStorage.getItem(destinationStorageKey) || "global";
  setDestination(stored, false);
}

function isOverviewRoute() {
  const raw = (globalThis.location.hash || "#overview").replace(/^#/, "");
  const [view] = raw.split(":", 1);
  return (view || "overview") === "overview";
}

function pageContext(view) {
  const destination =
    state.destinationId === "global"
      ? "Visão Global"
      : currentDestinationName();
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
  const businessQuery = "/businesses?limit=100" + destinationQuery;
  const requests = [
    api("/audit?limit=20").catch(() => ({ entries: [] })),
    api(reservationQuery).catch(() => ({ data: null })),
    api(affiliateQuery).catch(() => ({ data: null })),
    api(businessQuery).catch(() => ({
      businesses: null,
      destinationScope: "unavailable",
    })),
    state.destinationId === "global"
      ? Promise.resolve(null)
      : api("/reservations?limit=100").catch(() => ({ data: null })),
  ];
  const [audit, reservations, affiliates, businesses, globalReservations] =
    await Promise.all(requests);
  return {
    dashboard,
    audit,
    reservations,
    affiliates,
    businesses,
    globalReservations: globalReservations || reservations,
  };
}

async function revenueForReservations(rows) {
  if (!Array.isArray(rows))
    return { value: "—", meta: "Financial indisponível" };
  const paymentIds = [
    ...new Set(
      rows.map((item) => item?.reservation?.paymentId).filter(Boolean),
    ),
  ];
  if (paymentIds.length === 0)
    return { value: "R$ 0,00", meta: "nenhum pagamento ligado" };
  if (paymentIds.length > 30)
    return { value: "—", meta: "agregado diário exige endpoint owner" };
  const payments = await Promise.all(
    paymentIds.map((id) =>
      api("/payments/" + encodeURIComponent(id))
        .then((result) => result.data)
        .catch(() => null),
    ),
  );
  if (payments.some((payment) => payment === null)) {
    return { value: "—", meta: "leitura financeira parcial" };
  }
  const approved = payments.filter((payment) => payment?.status === "APPROVED");
  const currencies = [
    ...new Set(
      approved.map((payment) => payment?.amount?.currency).filter(Boolean),
    ),
  ];
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
  const ownerAttention = dashboard.attention;
  if (Array.isArray(ownerAttention?.items)) {
    return ownerAttention.items.slice(0, 4).map((item) => ({
      title: item.title || item.kind || item.id || "Atenção",
      detail:
        item.detail ||
        [item.severity, item.destinationId].filter(Boolean).join(" · ") ||
        "owner-backed",
      href: "#system",
      severity: item.severity || "warning",
    }));
  }

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

function humanizeAuditAction(value) {
  const action = String(value || "").trim();
  const labels = {
    "support.session.start": "Support Mode iniciado",
    "support.session.started": "Support Mode iniciado",
    "support.session.end": "Support Mode encerrado",
    "support.session.ended": "Support Mode encerrado",
  };
  if (labels[action]) return labels[action];
  const normalized = action
    .replace(/[._:/-]+/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1)
    : "Ação administrativa";
}

function activityDeepLink(entry) {
  const id = entry?.entityId ? encodeURIComponent(entry.entityId) : "";
  if (entry?.entityType === "auth_principal" && id) return `#users:${id}`;
  if (entry?.entityType === "payment" && id) return `#financial:${id}`;
  if (entry?.entityType === "reservation" && id) return `#reservations:${id}`;
  if (entry?.entityType === "destination" && id) return `#destinations:${id}`;
  if (entry?.entityType === "content_document" && id) return `#content:${id}`;
  if (entry?.entityType === "ticket_inventory" && id) return `#products:${id}`;
  if (entry?.entityType === "ticketing_operation") return "#ticketing";
  if (entry?.entityType === "affiliate_membership" && entry.entityId) {
    const affiliateId = String(entry.entityId).split(":", 1)[0];
    return affiliateId
      ? `#affiliates:${encodeURIComponent(affiliateId)}`
      : "#affiliates";
  }
  if (entry?.entityType === "reconciliation_finding") return "#financial";
  if (entry?.entityType === "auth_session" && entry.effectiveUserId) {
    return `#users:${encodeURIComponent(entry.effectiveUserId)}`;
  }
  return null;
}

function activityFinancialValue(entry) {
  for (const stateValue of [entry?.newState, entry?.previousState]) {
    if (!stateValue || typeof stateValue !== "object") continue;
    for (const amount of [stateValue.amount, stateValue.pricing?.amount]) {
      if (
        amount &&
        Number.isFinite(Number(amount.minorUnits)) &&
        typeof amount.currency === "string"
      ) {
        return formatMoney(amount);
      }
    }
    for (const field of ["commissionMinor", "eligibleRevenueMinor"]) {
      if (
        Number.isFinite(Number(stateValue[field])) &&
        typeof stateValue.currency === "string"
      ) {
        return formatMoney({
          minorUnits: stateValue[field],
          currency: stateValue.currency,
        });
      }
    }
  }
  return null;
}

function activityHtml(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return '<div class="empty"><strong>Nenhuma atividade recente</strong><span>Eventos administrativos aparecerão aqui quando existirem.</span></div>';
  }
  return entries
    .slice(0, 20)
    .map((entry) => {
      const date = new Date(entry.timestamp);
      const time = Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
      const result = String(entry.result || "").toLowerCase();
      const tone =
        result === "success"
          ? "success"
          : result === "denied" || result === "failure"
            ? "danger"
            : "warning";
      const actor = entry.actorUserId || "—";
      const effectiveUser = entry.effectiveUserId || "—";
      const destination = entry.destinationId || "—";
      const entity = [entry.entityType, entry.entityId]\n        .filter(Boolean)\n        .join(" ");
      const financialValue = activityFinancialValue(entry);
      const href = activityDeepLink(entry);
      return (
        '<div class="timeline-item" data-audit-entry><span class="timeline-time">' +
        escapeHtml(time) +
        '</span><span class="timeline-dot ' +
        tone +
        '" aria-hidden="true"></span><div class="timeline-body"><strong title="' +
        escapeHtml(entry.action || "") +
        '">' +
        escapeHtml(humanizeAuditAction(entry.action)) +
        '</strong><span class="timeline-meta">Actor ' +
        escapeHtml(actor) +
        " · Effective user " +
        escapeHtml(effectiveUser) +
        " · Destino " +
        escapeHtml(destination) +
        (entity ? " · " + escapeHtml(entity) : "") +
        " · " +
        escapeHtml(result || "unknown") +
        " · " +
        escapeHtml(financialValue || "—") +
        "</span>" +
        (href
          ? '<a class="section-link" href="' +
            escapeHtml(href) +
            '">Abrir</a>'
          : "") +
        "</div></div>"
      );
    })
    .join("");
}

async function destinationSummary(data) {
  const reservations = Array.isArray(data.globalReservations?.data)
    ? data.globalReservations.data
    : null;
  const businesses = Array.isArray(data.businesses?.businesses)
    ? data.businesses.businesses
    : null;
  const ownerItems = Array.isArray(data.dashboard?.destinationSummary?.items)
    ? data.dashboard.destinationSummary.items
    : null;
  const ownerByDestination = new Map(
    (ownerItems || []).map((item) => [item.destinationId, item]),
  );

  return Promise.all(
    state.destinations.map(async (destination) => {
      const destinationReservations = reservations
        ? reservations.filter(
            (item) =>
              item?.reservation?.destinationId === destination.id &&
              sameLocalDay(item?.reservation?.createdAt),
          )
        : null;
      const affiliateResult = await api(
        "/affiliates?limit=100&destinationId=" +
          encodeURIComponent(destination.id),
      ).catch(() => ({ data: null }));
      const destinationBusinesses = businesses
        ? businesses.filter(
            (business) => business.destinationId === destination.id,
          ).length
        : null;
      const affiliateCount = Array.isArray(affiliateResult.data)
        ? affiliateResult.data.length
        : null;
      const ownerSummary = ownerByDestination.get(destination.id) || null;

      return {
        destination,
        businessCount: destinationBusinesses,
        affiliateCount,
        reservationCount: destinationReservations?.length ?? null,
        revenue: ownerSummary?.revenue ?? null,
        alerts: ownerSummary?.alerts ?? null,
        summaryStatus: data.dashboard?.destinationSummary?.status || "UNAVAILABLE",
      };
    }),
  );
}

function ownerRevenueSummary(revenue) {
  const status = String(revenue?.status || "UNAVAILABLE");
  const currencies = Array.isArray(revenue?.currencies) ? revenue.currencies : null;
  if (!currencies || currencies.length === 0) {
    return { value: "—", meta: status };
  }
  if (currencies.length > 1) {
    return { value: "—", meta: status + " · múltiplas moedas" };
  }
  const item = currencies[0];
  return {
    value: formatMoney({
      minorUnits: item?.minorUnits,
      currency: item?.currency,
    }),
    meta: status + " · owner-backed",
  };
}

function destinationRows(summary) {
  return summary
    .map(
      ({
        destination,
        businessCount,
        affiliateCount,
        reservationCount,
        revenue,
        alerts,
        summaryStatus,
      }) => {
        const revenueSummary = ownerRevenueSummary(revenue);
        const alertValue = Number.isSafeInteger(alerts?.count)
          ? String(alerts.count)
          : Number.isSafeInteger(alerts?.knownCount)
            ? String(alerts.knownCount) + " conhecido(s)"
            : "—";
        const alertStatus = String(alerts?.status || summaryStatus || "UNAVAILABLE");
        return (
          '<tr class="destination-row" data-destination-row="' +
          escapeHtml(destination.id) +
          '" tabindex="0"><td><div class="destination-cell"><span class="destination-thumb" aria-hidden="true">⌖</span><div><strong>' +
          escapeHtml(
            destination.branding?.name || destination.name || destination.id,
          ) +
          "</strong><br><small>" +
          escapeHtml(destination.status || "—") +
          "</small></div></div></td><td>" +
          escapeHtml(businessCount ?? "—") +
          "</td><td>" +
          escapeHtml(affiliateCount ?? "—") +
          "</td><td>" +
          escapeHtml(reservationCount ?? "—") +
          " <small>hoje</small></td><td><strong>" +
          escapeHtml(revenueSummary.value) +
          "</strong><br><small>" +
          escapeHtml(revenueSummary.meta) +
          "</small></td><td><strong>" +
          escapeHtml(alertValue) +
          "</strong><br><small>" +
          escapeHtml(alertStatus) +
          "</small></td></tr>"
        );
      },
    )
    .join("");
}

async function renderHome() {
  if (!contentRoot) return;
  const generation = ++state.generation;
  contentRoot.setAttribute("aria-busy", "true");
  contentRoot.innerHTML =
    '<div class="grid kpi-grid" aria-hidden="true">' +
    Array.from(
      { length: 5 },
      () =>
        '<div class="skeleton-card"><div class="skeleton skeleton-line" style="width:42%"></div><div class="skeleton skeleton-value"></div><div class="skeleton skeleton-line" style="width:66%"></div></div>',
    ).join("") +
    "</div>";

  try {
    const data = await loadHomeData();
    if (generation !== state.generation || !isOverviewRoute()) return;
    const reservationRows = Array.isArray(data.reservations.data)
      ? data.reservations.data
      : null;
    const todayRows = reservationRows
      ? reservationRows.filter((item) =>
          sameLocalDay(item?.reservation?.createdAt),
        )
      : null;
    const revenue = await revenueForReservations(todayRows);
    const destinationSummaryRows =
      state.destinationId === "global" ? await destinationSummary(data) : [];
    if (generation !== state.generation || !isOverviewRoute()) return;
    const affiliateRows = Array.isArray(data.affiliates.data)
      ? data.affiliates.data
      : null;
    const affiliateCount = affiliateRows
      ? affiliateRows.length === 100
        ? "100+"
        : String(affiliateRows.length)
      : "—";
    const affiliateSummary = affiliateRows
      ? affiliateRows.reduce(
          (summary, affiliate) => ({
            approved:
              summary.approved +
              Number(affiliate.approvedMembershipCount || 0),
            suspended:
              summary.suspended +
              Number(affiliate.suspendedMembershipCount || 0),
            conversions:
              summary.conversions + Number(affiliate.conversionCount || 0),
          }),
          { approved: 0, suspended: 0, conversions: 0 },
        )
      : null;
    const reservationCount = todayRows
      ? todayRows.length === 100
        ? "100+"
        : String(todayRows.length)
      : "—";
    const exactAlertCount = Number.isSafeInteger(data.dashboard.summary?.alerts)
      ? data.dashboard.summary.alerts
      : null;
    const knownAlertCount = Number.isSafeInteger(
      data.dashboard.summary?.alertsKnownCount,
    )
      ? data.dashboard.summary.alertsKnownCount
      : null;
    const alertStatus = String(
      data.dashboard.summary?.alertsStatus || "UNAVAILABLE",
    );
    const alertValue =
      exactAlertCount !== null
        ? String(exactAlertCount)
        : knownAlertCount !== null
          ? String(knownAlertCount) + " conhecido(s)"
          : "—";
    const alertMeta =
      exactAlertCount !== null
        ? "agregado owner-backed"
        : knownAlertCount !== null
          ? "estado " + alertStatus.toLowerCase() + " · total indisponível"
          : "estado " + alertStatus.toLowerCase();
    const scopedBusinesses = Array.isArray(data.businesses?.businesses)
      ? data.businesses.businesses
      : null;
    const businessValue =
      state.destinationId === "global"
        ? String(data.dashboard.summary?.businesses ?? "—")
        : scopedBusinesses
          ? String(scopedBusinesses.length)
          : "—";
    const businessMeta =
      state.destinationId === "global"
        ? "cadastros conhecidos"
        : data.businesses?.destinationScope === "owner-backed"
          ? "atribuídas ao destino selecionado"
          : "relação de destino indisponível";
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

    if (generation !== state.generation || !isOverviewRoute()) return;

    contentRoot.innerHTML =
      '<div class="grid kpi-grid">' +
      metricCard("Empresas", businessValue, businessMeta, "info", "▦") +
      metricCard(
        "Afiliados",
        affiliateCount,
        state.destinationId === "global"
          ? "cadastros retornados pelo domínio"
          : "atribuídos ao destino selecionado",
        "success",
        "◇",
      ) +
      metricCard(
        "Reservas Hoje",
        reservationCount,
        todayRows ? "criadas hoje" : "fonte indisponível",
        "purple",
        "▣",
      ) +
      metricCard("Receita Hoje", revenue.value, revenue.meta, "success", "●") +
      metricCard(
        "Alertas",
        alertValue,
        alertMeta,
        alertStatus === "READY" && exactAlertCount === 0 ? "success" : "warning",
        "!",
      ) +
      "</div>" +
      '<section class="card section-card attention-panel" data-attention-source="dashboard-owner"><div class="section-title"><div><h2>Precisa da sua atenção</h2><p>Itens que exigem ação imediata</p></div><a class="section-link" href="#system">Ver todos os alertas</a></div>' +
      attentionHtml +
      "</section>" +
      '<div class="grid home-lower-grid"><div class="home-stack"><section class="card section-card destination-summary" data-summary-source="dashboard-owner"><div class="section-title"><div><h2>Resumo por destino</h2><p>Selecione uma linha para entrar no contexto daquele destino.</p></div><a class="section-link" href="#destinations">Gerenciar destinos</a></div><div class="table-wrap"><table><thead><tr><th>Destino</th><th>Empresas</th><th>Afiliados</th><th>Reservas</th><th>Receita</th><th>Alertas</th></tr></thead><tbody>' +
      (destinationRows(destinationSummaryRows) ||
        '<tr><td colspan="6" class="empty">Nenhum destino disponível para este actor.</td></tr>') +
      "</tbody></table></div></section>" +
      '<section class="card section-card" data-recent-activity data-source="append-only-audit"><div class="section-title"><div><h2>Atividade recente</h2><p>Eventos operacionais e administrativos compreensíveis, com actor e usuário efetivo.</p></div><a class="section-link" href="#audit">Ver todos os eventos</a></div><div class="timeline">' +
      activityHtml(data.audit.entries || []) +
      "</div></section></div>" +
      '<div class="home-stack"><section class="card section-card affiliate-model-card" data-affiliate-summary data-source="affiliates-owner"><div class="section-title"><h2>Afiliados pertencem à Morro Digital</h2></div><div class="affiliate-model-card__body"><span class="affiliate-model-card__icon" aria-hidden="true">◇</span><p>Os afiliados são da Morro Digital e são organizados por destino, não por empresa. Eles podem promover produtos de várias empresas do mesmo destino, fortalecendo todo o ecossistema.</p></div>' +
      (affiliateSummary
        ? '<div class="module-list"><div class="module-row"><span>Memberships aprovadas</span><strong>' +
          escapeHtml(affiliateSummary.approved) +
          '</strong></div><div class="module-row"><span>Memberships suspensas</span><strong>' +
          escapeHtml(affiliateSummary.suspended) +
          '</strong></div><div class="module-row"><span>Conversões</span><strong>' +
          escapeHtml(affiliateSummary.conversions) +
          '</strong></div></div>'
        : '<div class="empty">Affiliates owner indisponível; nenhum total foi inferido.</div>') +
      '</section></div></div>';

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
      const notificationCount = exactAlertCount ?? knownAlertCount ?? 0;
      notificationBadge.hidden = notificationCount <= 0;
      notificationBadge.textContent = String(notificationCount);
    }
  } catch (error) {
    if (generation !== state.generation) return;
    contentRoot.innerHTML = errorState(
      "Não foi possível carregar a visão operacional",
      "Os dados administrativos não estão disponíveis agora. Tente novamente ou consulte Sistema.",
      {
        actions:
          '<button id="ux-home-retry" class="secondary-button" type="button">Tentar novamente</button><a class="primary-button" href="#system">Ver sistema</a>',
      },
    );
    document
      .querySelector("#ux-home-retry")
      ?.addEventListener("click", () => void renderHome());
  } finally {
    enhanceControlCenterSurface(contentRoot);
    contentRoot.setAttribute("aria-busy", "false");
  }
}

function entity360Header(view, detail) {
  if (
    !detail ||
    !contentRoot ||
    contentRoot.querySelector(".entity-header[data-ux-v1]")
  )
    return;
  const hasFunctionalTabs = Boolean(
    contentRoot.querySelector("[data-entity-tabs]"),
  );
  const configs = {
    businesses: [
      "Empresa",
      [
        "Resumo",
        "Perfil",
        "Usuários",
        "Produtos",
        "Ofertas",
        "Reservas",
        "Financeiro",
        "CRM",
        "Histórico",
        "Auditoria",
      ],
    ],
    affiliates: [
      "Afiliado",
      [
        "Resumo",
        "Perfil",
        "Destinos",
        "Atribuições",
        "Conversões",
        "Comissões",
        "Histórico",
        "Auditoria",
      ],
    ],
    users: [
      "Usuário",
      [
        "Resumo",
        "Conta",
        "Permissões",
        "Empresas",
        "Sessões",
        "Histórico",
        "Auditoria",
      ],
    ],
  };
  const config = configs[view];
  if (!config) return;
  contentRoot.insertAdjacentHTML(
    "afterbegin",
    entityHeader({
      entityType: config[0],
      entityId: decodeURIComponent(detail),
      scope:
        state.destinationId === "global"
          ? "Visão Global"
          : currentDestinationName(),
      tabs: hasFunctionalTabs ? [] : config[1],
    }),
  );
}
function responsiveTables() {
  if (!contentRoot) return;
  enhanceDataTables(contentRoot);
}

function failClosedDestinationScope(view) {
  if (!contentRoot || state.destinationId === "global") return;
  if (
    ["businesses", "affiliates"].includes(view) &&
    !globalThis.location.hash.includes(":")
  ) {
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

  if (
    ["reservations", "products"].includes(view) &&
    !globalThis.location.hash.includes(":")
  ) {
    const table = contentRoot.querySelector("table");
    if (!table) return;
    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      th.textContent.trim().toLocaleLowerCase(),
    );
    const destinationIndex = headers.findIndex((header) =>
      header.includes("destino"),
    );
    if (destinationIndex < 0) return;
    table.querySelectorAll("tbody tr").forEach((row) => {
      const cell = row.children[destinationIndex];
      if (!cell) return;
      const value = String(cell.textContent || "").trim();
      const match =
        value === state.destinationId ||
        value
          .toLocaleLowerCase()
          .includes(currentDestinationName().toLocaleLowerCase());
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
    const current = items[active];
    if (current?.id) {
      searchInput.setAttribute("aria-activedescendant", current.id);
    }
    current?.scrollIntoView({ block: "nearest" });
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
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.removeAttribute("aria-activedescendant");
      searchInput.value = "";
      active = -1;
    } else if (event.key === "Escape") {
      searchResults.hidden = true;
      searchInput.setAttribute("aria-expanded", "false");
      searchInput.removeAttribute("aria-activedescendant");
      active = -1;
    }
  });
}

async function upgradeCurrentView() {
  if (!app || app.hidden) return;
  const raw = (globalThis.location.hash || "#overview").replace(/^#/, "");
  const [view, detail] = raw.split(":", 2);
  const currentView = view || "overview";

  // Invalidate any in-flight home request before a non-home route can be
  // decorated. Without this guard, a slow overview fetch can overwrite the
  // DOM after the operator has already navigated to another module.
  if (currentView !== "overview") state.generation += 1;

  pageContext(currentView);
  if (currentView === "overview") {
    await renderHome();
    return;
  }
  entity360Header(view, detail);
  responsiveTables();
  failClosedDestinationScope(view);
}

function wireNavigation() {
  destinationSelector?.addEventListener("change", () => {
    setDestination(destinationSelector.value);
  });

  globalScope?.addEventListener("click", () => {
    setDestination("global");
    globalThis.location.hash = "#overview";
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
    if (text)
      text.textContent = ready
        ? "Tudo funcionando bem"
        : "Operação requer atenção";
    const dot = pageHealth.querySelector(".status-dot");
    if (dot)
      dot.className = "status-dot " + (ready ? "status-pass" : "status-warn");
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
    await upgradeCurrentView();

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
      // Invalidate pending overview work synchronously before any asynchronous
      // route decorator can run, so stale dashboard data can never replace the
      // module selected by the operator.
      state.generation += 1;
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
