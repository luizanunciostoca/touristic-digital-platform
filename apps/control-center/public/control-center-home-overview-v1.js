const SCOPE_KEY = "md_control_center_destination_scope_v1";
const DESTINATION_KEY = "md_control_center_destination_context_v1";
const MAX_ATTENTION_TILES = 4;
const MAX_RECENT_ACTIVITY = 8;

const severityRank = Object.freeze({
  critical: 0,
  high: 1,
  danger: 1,
  error: 1,
  warning: 2,
  warn: 2,
  medium: 2,
  info: 3,
  low: 4,
});

const technicalCopyPattern =
  /\b(http[-_ ]?listener|shutdown[-_ ]?readiness|release[-_ ]?identity|provider|readiness|class|adapter|runtime[-_ ]?projection)\b/iu;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function titleCase(value) {
  const normalized = String(value ?? "")
    .replace(/[._-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((part) =>
      part ? part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1) : "",
    )
    .join(" ");
}

function actorFirstName(adminSession) {
  const actor = adminSession?.actor;
  const explicit = firstDefined(actor?.name, actor?.displayName, actor?.firstName);
  if (typeof explicit === "string" && explicit.trim()) {
    return titleCase(explicit.trim().split(/\s+/u)[0]);
  }
  const email = typeof actor?.email === "string" ? actor.email : "";
  const localPart = email.split("@")[0] ?? "";
  const candidate = localPart.split(/[._+-]/u)[0] ?? "";
  return titleCase(candidate) || "Admin";
}

function greetingFor(date) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatHomeDate(date) {
  const value = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1);
}

function operationalState(health) {
  const checks = Array.isArray(health?.checks) ? health.checks : [];
  const failing = checks.filter((check) => check?.status === "fail").length;
  const warning = checks.filter((check) => check?.status === "warn").length;
  if (health?.readiness === "ready" && failing === 0 && warning === 0) {
    return { state: "success", label: "Tudo funcionando bem" };
  }
  if (failing > 0) return { state: "danger", label: "Operação requer atenção" };
  if (warning > 0 || health?.readiness) {
    return { state: "partial", label: "Operação parcialmente disponível" };
  }
  return { state: "unavailable", label: "Estado operacional indisponível" };
}

function currentScope() {
  const scope = globalThis.sessionStorage?.getItem(SCOPE_KEY);
  const destinationId = globalThis.sessionStorage?.getItem(DESTINATION_KEY);
  return {
    scope: scope === "destination" && destinationId ? "destination" : "global",
    destinationId:
      scope === "destination" && destinationId ? destinationId : null,
  };
}

function metricNumber(value, status = "READY") {
  if (!Number.isFinite(Number(value))) {
    return { value: "—", state: "unavailable", hint: "Dado owner indisponível" };
  }
  return {
    value: new Intl.NumberFormat("pt-BR").format(Number(value)),
    state: status === "READY" ? "success" : "partial",
    hint: status === "READY" ? "Fonte autoritativa" : "Dado parcial conhecido",
  };
}

function currencyFractionDigits(currency) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

function formatMoneyMinor(minorUnits, currency) {
  if (!Number.isFinite(Number(minorUnits)) || typeof currency !== "string") {
    return null;
  }
  const digits = currencyFractionDigits(currency);
  const major = Number(minorUnits) / 10 ** digits;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(major);
  } catch {
    return null;
  }
}

function metricMoney(aggregate) {
  if (!aggregate || typeof aggregate !== "object") {
    return { value: "—", state: "unavailable", hint: "Dado owner indisponível" };
  }
  const formatted =
    formatMoneyMinor(aggregate.minorUnits, aggregate.currency) ??
    (Number.isFinite(Number(aggregate.amount)) &&
    typeof aggregate.currency === "string"
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: aggregate.currency,
        }).format(Number(aggregate.amount))
      : null);
  if (!formatted) {
    return { value: "—", state: "unavailable", hint: "Dado owner indisponível" };
  }
  return {
    value: formatted,
    state: aggregate.status === "READY" ? "success" : "partial",
    hint:
      aggregate.status === "READY"
        ? "Hoje · fonte autoritativa"
        : "Hoje · dado parcial conhecido",
  };
}

function safeHumanCopy(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || technicalCopyPattern.test(text)) return fallback;
  return text;
}

function attentionTitle(item) {
  const kind = String(item?.kind ?? "").toLowerCase();
  const mapped = {
    "business-approval": "Empresas aguardando aprovação",
    business_approval: "Empresas aguardando aprovação",
    "integration-failure": "Integração requer revisão",
    integration_failure: "Integração requer revisão",
    "refund-review": "Reembolso pendente de revisão",
    refund_review: "Reembolso pendente de revisão",
    "support-open": "Solicitações de suporte abertas",
    support_open: "Solicitações de suporte abertas",
    "destination-review": "Destino requer revisão",
  };
  return mapped[kind] ?? safeHumanCopy(item?.title, "Item operacional requer revisão");
}

function attentionDetail(item, destinationName) {
  const fallback = destinationName
    ? "Revise este item no contexto de " + destinationName + "."
    : "Revise este item na superfície operacional correspondente.";
  return safeHumanCopy(item?.detail, fallback);
}

function attentionHref(item) {
  const href = typeof item?.href === "string" ? item.href.trim() : "";
  return href.startsWith("#") ? href : "#audit";
}

function severityOf(item) {
  const raw = String(item?.severity ?? "warning").toLowerCase();
  return raw in severityRank ? raw : "warning";
}

function sortAttention(items) {
  return [...items].sort((left, right) => {
    const severity =
      (severityRank[severityOf(left)] ?? 9) -
      (severityRank[severityOf(right)] ?? 9);
    if (severity !== 0) return severity;
    const leftTime = Date.parse(left?.createdAt ?? left?.timestamp ?? "") || 0;
    const rightTime = Date.parse(right?.createdAt ?? right?.timestamp ?? "") || 0;
    return leftTime - rightTime;
  });
}

function aggregateCount(value) {
  if (Number.isFinite(Number(value))) {
    return { value: Number(value), status: "READY" };
  }
  if (value && typeof value === "object") {
    if (Number.isFinite(Number(value.count))) {
      return {
        value: Number(value.count),
        status: value.status === "READY" ? "READY" : "PARTIAL",
      };
    }
    if (Number.isFinite(Number(value.knownCount))) {
      return { value: Number(value.knownCount), status: "PARTIAL" };
    }
  }
  return { value: null, status: "UNAVAILABLE" };
}

function aggregateMoney(value) {
  if (!value || typeof value !== "object") {
    return { value: "—", status: "UNAVAILABLE" };
  }
  const formatted =
    formatMoneyMinor(value.minorUnits, value.currency) ??
    (Number.isFinite(Number(value.amount)) && typeof value.currency === "string"
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: value.currency,
        }).format(Number(value.amount))
      : null);
  return {
    value: formatted ?? "—",
    status:
      formatted && value.status === "READY"
        ? "READY"
        : formatted
          ? "PARTIAL"
          : "UNAVAILABLE",
  };
}

function displayCount(metric) {
  return metric.value === null
    ? "—"
    : new Intl.NumberFormat("pt-BR").format(metric.value);
}

function destinationName(destination) {
  return (
    destination?.branding?.name ??
    destination?.branding?.shortName ??
    destination?.name ??
    destination?.id ??
    "Destino"
  );
}

function destinationRow(item, destination) {
  return {
    destinationId: destination.id,
    name: destinationName(destination),
    businesses: aggregateCount(item?.businesses),
    affiliates: aggregateCount(item?.affiliates),
    reservations: aggregateCount(firstDefined(item?.reservationsToday, item?.reservations)),
    revenue: aggregateMoney(firstDefined(item?.revenueToday, item?.revenue)),
    alerts: aggregateCount(item?.alerts),
  };
}

function auditMoney(entry) {
  for (const stateValue of [entry?.newState, entry?.previousState]) {
    if (!stateValue || typeof stateValue !== "object") continue;
    const amount = firstDefined(stateValue.amount, stateValue.pricing?.amount);
    const formatted = formatMoneyMinor(amount?.minorUnits, amount?.currency);
    if (formatted) return formatted;
    for (const field of ["commissionMinor", "eligibleRevenueMinor"]) {
      const other = formatMoneyMinor(stateValue[field], stateValue.currency);
      if (other) return other;
    }
  }
  return null;
}

function activityLabel(entry) {
  const entityType = String(entry?.entityType ?? "").toLowerCase();
  const action = String(entry?.action ?? "").toLowerCase();
  if (entityType === "reservation" || /reservation|reserva/u.test(action)) return "Reserva atualizada";
  if (entityType === "payment" || /payment|pagamento/u.test(action)) return "Pagamento atualizado";
  if (entityType === "business" || /business|empresa/u.test(action)) return "Empresa atualizada";
  if (
    entityType === "affiliate" ||
    entityType === "affiliate_membership" ||
    /affiliate|afiliad/u.test(action)
  ) return "Afiliado atualizado";
  if (/webhook|integration|integra/u.test(action)) return "Integração requer revisão";
  return "Atividade administrativa";
}

function activityEntity(entry) {
  const id = typeof entry?.entityId === "string" ? entry.entityId : "";
  if (!id) return null;
  return id.length > 48 ? id.slice(0, 45) + "…" : id;
}

export function buildHomeModelV1({
  dashboard = {},
  affiliates = [],
  destinations = [],
  auditEntries = [],
  affiliateAvailable = false,
  destinationAvailable = false,
  auditAvailable = false,
  scope = { scope: "global", destinationId: null },
} = {}) {
  const allowedDestinations = new Map(
    (destinationAvailable ? destinations : [])
      .filter((destination) => destination && typeof destination.id === "string")
      .map((destination) => [destination.id, destination]),
  );
  const selectedDestination =
    scope.scope === "destination" &&
    scope.destinationId &&
    allowedDestinations.has(scope.destinationId)
      ? scope.destinationId
      : null;

  const attentionAggregate =
    dashboard.attention && typeof dashboard.attention === "object"
      ? dashboard.attention
      : null;
  const ownerItems = Array.isArray(attentionAggregate?.items)
    ? attentionAggregate.items
    : [];
  const filteredAttention = ownerItems
    .filter((item) => {
      if (!item || typeof item !== "object") return false;
      if (item.destinationId && !allowedDestinations.has(item.destinationId)) return false;
      if (selectedDestination && item.destinationId !== selectedDestination) return false;
      return true;
    })
    .map((item) => {
      const destination = item.destinationId
        ? allowedDestinations.get(item.destinationId)
        : null;
      const name = destination ? destinationName(destination) : null;
      return {
        id: String(item.id ?? item.kind ?? "attention"),
        count:
          Number.isFinite(Number(item.count)) && Number(item.count) > 0
            ? Number(item.count)
            : 1,
        title: attentionTitle(item),
        detail: attentionDetail(item, name),
        severity: severityOf(item),
        href: attentionHref(item),
        destinationId: item.destinationId ?? null,
        createdAt: item.createdAt ?? item.timestamp ?? null,
      };
    });

  if (!attentionAggregate && destinationAvailable) {
    for (const destination of allowedDestinations.values()) {
      if (selectedDestination && destination.id !== selectedDestination) continue;
      if (destination.status && destination.status !== "active") {
        filteredAttention.push({
          id: "destination:" + destination.id,
          count: 1,
          title: "Destino requer revisão",
          detail: "Revise o estado operacional de " + destinationName(destination) + ".",
          severity: "warning",
          href: "#destinations:" + encodeURIComponent(destination.id),
          destinationId: destination.id,
          createdAt: null,
        });
      }
    }
  }

  const sortedAttention = sortAttention(filteredAttention);
  const attentionCount =
    selectedDestination || attentionAggregate?.status !== "READY"
      ? sortedAttention.reduce((total, item) => total + item.count, 0)
      : Number.isFinite(Number(attentionAggregate?.count))
        ? Number(attentionAggregate.count)
        : sortedAttention.reduce((total, item) => total + item.count, 0);
  const attentionState = attentionAggregate
    ? attentionAggregate.status === "READY" && !selectedDestination
      ? "success"
      : attentionAggregate.status === "UNAVAILABLE"
        ? "unavailable"
        : "partial"
    : sortedAttention.length
      ? "partial"
      : "unavailable";

  const destinationSummary =
    dashboard.destinationSummary && typeof dashboard.destinationSummary === "object"
      ? dashboard.destinationSummary
      : null;
  const summaryItems = Array.isArray(destinationSummary?.items)
    ? destinationSummary.items
    : [];
  const summaryById = new Map(
    summaryItems
      .filter(
        (item) =>
          item &&
          typeof item.destinationId === "string" &&
          allowedDestinations.has(item.destinationId),
      )
      .map((item) => [item.destinationId, item]),
  );
  const rows = [...allowedDestinations.values()]
    .filter((destination) => !selectedDestination || destination.id === selectedDestination)
    .map((destination) => destinationRow(summaryById.get(destination.id), destination));

  const recent = (auditAvailable ? auditEntries : [])
    .filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.destinationId && !allowedDestinations.has(entry.destinationId)) return false;
      if (selectedDestination) return entry.destinationId === selectedDestination;
      return true;
    })
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((entry) => {
      const destination = entry.destinationId
        ? allowedDestinations.get(entry.destinationId)
        : null;
      return {
        timestamp: entry.timestamp ?? null,
        label: activityLabel(entry),
        entity: activityEntity(entry),
        destination: destination ? destinationName(destination) : null,
        value: auditMoney(entry),
        actor: entry.actorUserId ?? entry.effectiveUserId ?? null,
        href:
          typeof entry.href === "string" && entry.href.startsWith("#")
            ? entry.href
            : "#audit",
      };
    });

  const globalScope = !selectedDestination;
  const businessesMetric =
    globalScope && Number.isFinite(Number(dashboard.summary?.businesses))
      ? {
          ...metricNumber(dashboard.summary.businesses, "READY"),
          hint: "Total global · Identity membership owner",
        }
      : {
          value: "—",
          state: "unavailable",
          hint: selectedDestination
            ? "Sem agregado autoritativo por destino"
            : "Identity owner indisponível",
        };

  const affiliateMetric =
    globalScope &&
    dashboard.summary?.affiliatesStatus &&
    Number.isFinite(Number(dashboard.summary?.affiliates))
      ? {
          ...metricNumber(dashboard.summary.affiliates, dashboard.summary.affiliatesStatus),
          hint: "Total global · Affiliates owner",
        }
      : {
          value: "—",
          state: affiliateAvailable ? "partial" : "unavailable",
          hint: affiliateAvailable
            ? "Owner disponível sem total autoritativo; recorte não vira total"
            : "Affiliates owner indisponível",
        };

  const reservationsMetric =
    globalScope &&
    dashboard.summary?.reservationsTodayStatus &&
    Number.isFinite(Number(dashboard.summary?.reservationsToday))
      ? {
          ...metricNumber(
            dashboard.summary.reservationsToday,
            dashboard.summary.reservationsTodayStatus,
          ),
          hint: "Hoje · Reservations owner",
        }
      : {
          value: "—",
          state: "unavailable",
          hint: selectedDestination
            ? "Sem agregado diário autoritativo por destino"
            : "Agregado diário owner indisponível",
        };

  const revenueMetric =
    globalScope && dashboard.summary?.revenueTodayStatus
      ? metricMoney({
          ...(dashboard.summary.revenueToday ?? {}),
          status: dashboard.summary.revenueTodayStatus,
        })
      : {
          value: "—",
          state: "unavailable",
          hint: selectedDestination
            ? "Sem agregado financeiro autoritativo por destino"
            : "Agregado financeiro diário indisponível",
        };

  const alertsMetric =
    attentionState === "unavailable"
      ? {
          value: "—",
          state: "unavailable",
          hint: "Agregado de alertas acionáveis indisponível",
        }
      : {
          value: new Intl.NumberFormat("pt-BR").format(attentionCount),
          state: attentionState,
          hint:
            attentionState === "success"
              ? "Itens acionáveis · fonte autoritativa"
              : "Itens conhecidos · cobertura parcial",
        };

  return {
    scope: selectedDestination
      ? { scope: "destination", destinationId: selectedDestination }
      : { scope: "global", destinationId: null },
    metrics: [
      { key: "businesses", label: "Empresas", ...businessesMetric },
      { key: "affiliates", label: "Afiliados", ...affiliateMetric },
      { key: "reservations", label: "Reservas Hoje", ...reservationsMetric },
      { key: "revenue", label: "Receita Hoje", ...revenueMetric },
      { key: "alerts", label: "Alertas", ...alertsMetric },
    ],
    attention: {
      state: attentionState,
      count: attentionCount,
      items: sortedAttention.slice(0, MAX_ATTENTION_TILES),
      hiddenCount: Math.max(0, sortedAttention.length - MAX_ATTENTION_TILES),
    },
    destinations: {
      state: !destinationAvailable
        ? "unavailable"
        : destinationSummary?.status === "READY"
          ? "success"
          : "partial",
      rows,
    },
    recent: {
      state: !auditAvailable ? "unavailable" : recent.length ? "success" : "empty",
      items: recent,
    },
    affiliateOwnerKnown: affiliateAvailable,
    affiliateSliceCount: affiliateAvailable ? affiliates.length : null,
  };
}

function iconSvg(kind) {
  const paths = {
    businesses: '<path d="M5 20V5h10v15M15 9h4v11M8 8h4M8 12h4M8 16h4"></path>',
    affiliates: '<circle cx="6" cy="7" r="2"></circle><circle cx="18" cy="7" r="2"></circle><circle cx="12" cy="18" r="2"></circle><path d="m7.7 8.1 3.1 7.6M16.3 8.1l-3.1 7.6M8 7h8"></path>',
    reservations: '<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16"></path>',
    revenue: '<circle cx="12" cy="12" r="8"></circle><path d="M15 9.5c-.7-.8-1.7-1.2-3-1.2-1.7 0-3 .8-3 2s1.1 1.8 3.1 2.2c2 .4 2.9 1 2.9 2.2 0 1.3-1.3 2.1-3 2.1-1.4 0-2.5-.4-3.3-1.3M12 6.8v10.4"></path>',
    alerts: '<path d="M12 4 3.8 19h16.4L12 4Z"></path><path d="M12 9v4M12 16h.01"></path>',
  };
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (paths[kind] ?? paths.alerts) + "</svg>";
}

function metricMarkup(metric) {
  return (
    '<article class="home-kpi home-kpi--' +
    escapeHtml(metric.key) +
    '" data-home-kpi="' +
    escapeHtml(metric.key) +
    '" data-state="' +
    escapeHtml(metric.state) +
    '">' +
    '<div class="home-kpi__icon">' +
    iconSvg(metric.key) +
    "</div>" +
    '<div class="home-kpi__body"><span class="home-kpi__label">' +
    escapeHtml(metric.label) +
    '</span><strong class="home-kpi__value">' +
    escapeHtml(metric.value) +
    '</strong><small class="home-kpi__hint">' +
    escapeHtml(metric.hint) +
    "</small></div></article>"
  );
}

function attentionMarkup(attention) {
  const body = attention.items.length
    ? '<div class="home-attention__tiles">' +
      attention.items
        .map(
          (item) =>
            '<a class="home-attention-tile" href="' +
            escapeHtml(item.href) +
            '" data-severity="' +
            escapeHtml(item.severity) +
            '">' +
            '<strong class="home-attention-tile__count">' +
            escapeHtml(item.count) +
            '</strong><span class="home-attention-tile__copy"><b>' +
            escapeHtml(item.title) +
            "</b><small>" +
            escapeHtml(item.detail) +
            '</small></span><span class="home-attention-tile__chevron" aria-hidden="true">›</span></a>',
        )
        .join("") +
      "</div>"
    : '<div class="home-empty-state">Nenhum item acionável conhecido nas fontes disponíveis.</div>';
  const coverage =
    attention.state === "partial"
      ? '<p class="home-coverage-note">Cobertura parcial: somente itens confirmados são exibidos.</p>'
      : attention.state === "unavailable"
        ? '<p class="home-coverage-note">Fonte de alertas acionáveis indisponível; nenhum zero foi inferido.</p>'
        : "";
  const hidden =
    attention.hiddenCount > 0
      ? '<p class="home-coverage-note">' +
        escapeHtml(attention.hiddenCount) +
        " item(ns) adicional(is) fora da faixa principal.</p>"
      : "";
  return (
    '<section class="home-attention" data-home-attention data-state="' +
    escapeHtml(attention.state) +
    '">' +
    '<div class="home-section-heading home-section-heading--attention"><div><p class="home-eyebrow">Prioridade operacional</p><h2>Precisa da sua atenção</h2><p>Itens que exigem ação imediata.</p></div><a href="#audit">Ver todos os alertas</a></div>' +
    body +
    coverage +
    hidden +
    "</section>"
  );
}

function cellMarkup(metric, kind) {
  const state = metric?.status ?? "UNAVAILABLE";
  const value = kind === "money" ? metric?.value ?? "—" : displayCount(metric ?? {});
  return (
    '<span class="home-table-value" data-state="' +
    escapeHtml(state.toLowerCase()) +
    '">' +
    escapeHtml(value) +
    "</span>"
  );
}

function destinationsMarkup(destinations) {
  const rows = destinations.rows.length
    ? destinations.rows
        .map(
          (row) =>
            '<tr><td class="home-destination-cell"><button type="button" data-home-destination-id="' +
            escapeHtml(row.destinationId) +
            '"><span class="home-destination-mark" aria-hidden="true">⌖</span><span><strong>' +
            escapeHtml(row.name) +
            '</strong><small>Entrar neste destino</small></span></button></td><td>' +
            cellMarkup(row.businesses) +
            "</td><td>" +
            cellMarkup(row.affiliates) +
            "</td><td>" +
            cellMarkup(row.reservations) +
            "</td><td>" +
            cellMarkup(row.revenue, "money") +
            "</td><td>" +
            cellMarkup(row.alerts) +
            "</td></tr>",
        )
        .join("")
    : '<tr><td colspan="6" class="home-table-empty">Nenhum destino autorizado disponível neste contexto.</td></tr>';
  return (
    '<section class="home-panel home-destinations" data-home-destinations data-state="' +
    escapeHtml(destinations.state) +
    '"><div class="home-section-heading"><div><p class="home-eyebrow">Visão multi-destino</p><h2>Resumo por destino</h2></div></div>' +
    '<div class="home-table-wrap" tabindex="0"><table><thead><tr><th>Destino</th><th>Empresas</th><th>Afiliados</th><th>Reservas</th><th>Receita</th><th>Alertas</th></tr></thead><tbody>' +
    rows +
    "</tbody></table></div>" +
    (destinations.state !== "success"
      ? '<p class="home-coverage-note">Campos sem agregado owner-backed permanecem indisponíveis; nenhum total é inferido.</p>'
      : "") +
    "</section>"
  );
}

function formatActivityTime(timestamp) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function recentMarkup(recent) {
  const items = recent.items.length
    ? '<ol class="home-activity-list">' +
      recent.items
        .map(
          (item) =>
            '<li><span class="home-activity-dot" aria-hidden="true"></span><time>' +
            escapeHtml(formatActivityTime(item.timestamp)) +
            '</time><div><strong>' +
            escapeHtml(item.label) +
            "</strong>" +
            (item.entity
              ? '<span class="home-activity-entity">' + escapeHtml(item.entity) + "</span>"
              : "") +
            "<p>" +
            escapeHtml(
              [item.destination, item.value, item.actor ? "por " + item.actor : null]
                .filter(Boolean)
                .join(" · ") || "Contexto administrativo",
            ) +
            '</p></div><a href="' +
            escapeHtml(item.href) +
            '">Abrir</a></li>',
        )
        .join("") +
      "</ol>"
    : '<div class="home-empty-state">' +
      (recent.state === "unavailable"
        ? "Atividade recente indisponível no momento."
        : "Nenhuma atividade recente neste contexto.") +
      "</div>";
  return (
    '<section class="home-panel home-recent" data-home-recent data-state="' +
    escapeHtml(recent.state) +
    '"><div class="home-section-heading"><div><p class="home-eyebrow">Operação</p><h2>Atividade recente</h2><p>Eventos administrativos em linguagem operacional.</p></div><a href="#audit">Ver todos os eventos</a></div>' +
    items +
    "</section>"
  );
}

function affiliateCardMarkup(model) {
  const sourceNote = model.affiliateOwnerKnown
    ? "Fonte Affiliates conectada; totais só aparecem quando a autoridade fornece agregado explícito."
    : "A fonte Affiliates está indisponível no momento.";
  return (
    '<aside class="home-affiliate-note" data-home-affiliate-card><div class="home-affiliate-note__icon" aria-hidden="true">' +
    iconSvg("affiliates") +
    '</div><div><p class="home-eyebrow">Como funciona</p><h2>Afiliados são da Morro Digital</h2><p>Os afiliados são organizados por destino, não por empresa. Eles podem promover produtos de várias empresas do mesmo destino, fortalecendo todo o ecossistema.</p><small>' +
    escapeHtml(sourceNote) +
    '</small></div><a href="#affiliates">Ver afiliados</a></aside>'
  );
}

function bindDestinationRows(content) {
  content.querySelectorAll("[data-home-destination-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const destinationId = button.dataset.homeDestinationId;
      const selector = document.querySelector("#destination-selector");
      if (!(selector instanceof HTMLSelectElement) || !destinationId) return;
      const authorized = [...selector.options].some(
        (option) => option.value === destinationId,
      );
      if (!authorized) {
        button.setAttribute("aria-describedby", "home-destination-context-status");
        const status = document.querySelector("#home-destination-context-status");
        if (status) {
          status.textContent =
            "Destino indisponível no contexto autorizado. Nenhuma seleção foi inferida.";
        }
        return;
      }
      selector.value = destinationId;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      globalThis.location.hash = "#overview";
    });
  });
}

export async function renderHomeOverviewV1({
  dashboard = {},
  adminSession = {},
  api,
  content,
}) {
  const [affiliateOwner, destinationOwner, auditOwner] = await Promise.all([
    api("/affiliates?limit=250")
      .then((payload) => ({
        available: true,
        data: Array.isArray(payload?.data) ? payload.data : [],
      }))
      .catch(() => ({ available: false, data: [] })),
    api("/destinations")
      .then((payload) => ({
        available: true,
        data: Array.isArray(payload?.destinations) ? payload.destinations : [],
      }))
      .catch(() => ({ available: false, data: [] })),
    api("/audit?limit=20")
      .then((payload) => ({
        available: true,
        data: Array.isArray(payload?.entries) ? payload.entries : [],
      }))
      .catch(() => ({ available: false, data: [] })),
  ]);

  const model = buildHomeModelV1({
    dashboard,
    affiliates: affiliateOwner.data,
    destinations: destinationOwner.data,
    auditEntries: auditOwner.data,
    affiliateAvailable: affiliateOwner.available,
    destinationAvailable: destinationOwner.available,
    auditAvailable: auditOwner.available,
    scope: currentScope(),
  });

  const now = new Date();
  const firstName = actorFirstName(adminSession);
  const state = operationalState(dashboard.health);
  const title = document.querySelector("#page-title");
  const description = document.querySelector("#page-description");
  const breadcrumb = document.querySelector("#breadcrumb");
  const actions = document.querySelector("#page-actions");
  if (title) title.textContent = greetingFor(now) + ", " + firstName;
  if (description) description.textContent = "Resumo da operação da plataforma.";
  if (breadcrumb) breadcrumb.textContent = "Control Center / Visão Geral";
  if (actions) {
    actions.innerHTML =
      '<div class="home-heading-meta"><span class="home-heading-date">' +
      escapeHtml(formatHomeDate(now)) +
      '</span><span class="home-operation-state" data-state="' +
      escapeHtml(state.state) +
      '"><i aria-hidden="true"></i>' +
      escapeHtml(state.label) +
      "</span></div>";
  }

  content.innerHTML =
    '<div class="home-overview-v1" data-home-overview-v1 data-scope="' +
    escapeHtml(model.scope.scope) +
    '">' +
    '<section class="home-kpi-grid" aria-label="Indicadores principais">' +
    model.metrics.map(metricMarkup).join("") +
    "</section>" +
    attentionMarkup(model.attention) +
    destinationsMarkup(model.destinations) +
    '<div class="home-lower-grid">' +
    recentMarkup(model.recent) +
    affiliateCardMarkup(model) +
    "</div>" +
    '<p id="home-destination-context-status" class="sr-only" aria-live="polite"></p>' +
    "</div>";

  bindDestinationRows(content);
}
