import { createDashboardAuthClient } from "@touristic/auth-browser";
import {
  createAffiliatePortalClient,
  type AffiliateConversionView,
  type AffiliateMembershipView,
  type AffiliatePortalProjection,
} from "./affiliate-portal-client.js";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing affiliate portal element: ${id}`);
  return element as T;
}

function money(minor: string, currency: string): string {
  const value = Number(minor);
  if (!Number.isSafeInteger(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function dateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bahia",
  }).format(date);
}

function labelStatus(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    active: "Ativo",
    inactive: "Inativo",
    pending: "Pendente",
    approved: "Aprovado",
    suspended: "Suspenso",
    closed: "Encerrado",
    earned: "Disponível",
    cancelled: "Cancelado",
    reversed: "Revertido",
    disputed: "Em análise",
    accepted: "Aceito pelo Financeiro",
    rejected: "Rejeitado",
    not_requested: "Ainda não materializado",
    not_started: "Não iniciado",
    eligible: "Elegível",
    blocked: "Bloqueado",
  };
  return labels[value] ?? value;
}

function setStatusBadge(element: HTMLElement, status: string): void {
  element.textContent = labelStatus(status);
  element.dataset.status = status;
}

function appendMembership(
  container: HTMLElement,
  membership: AffiliateMembershipView,
): void {
  const item = document.createElement("article");
  item.className = "affiliate-membership";

  const title = document.createElement("strong");
  title.textContent = membership.program_id;

  const status = document.createElement("span");
  status.className = "status-chip";
  setStatusBadge(status, membership.status);

  const detail = document.createElement("p");
  detail.textContent = `Destino: ${membership.destination_id} · Financeiro: ${labelStatus(
    membership.financial_onboarding_status,
  )}`;

  item.append(title, status, detail);
  container.append(item);
}

function appendConversion(
  body: HTMLTableSectionElement,
  conversion: AffiliateConversionView,
): void {
  const row = document.createElement("tr");
  const values = [
    dateTime(conversion.paymentConfirmedAt),
    conversion.orderId,
    money(conversion.eligibleRevenueMinor, conversion.currency),
    money(conversion.commissionMinor, conversion.currency),
    labelStatus(conversion.entitlementStatus),
    labelStatus(conversion.materializationState),
  ];
  for (const value of values) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.append(cell);
  }
  body.append(row);
}

function renderProjection(projection: AffiliatePortalProjection): void {
  byId("affiliate-id").textContent = projection.affiliate.affiliateId;
  setStatusBadge(byId("affiliate-status"), projection.affiliate.status);
  byId("metric-attributions").textContent = String(
    projection.attribution.count,
  );
  byId("metric-conversions").textContent = String(
    projection.conversions.length,
  );

  const brl = projection.summaryByCurrency.find(
    (summary) => summary.currency === "BRL",
  );
  byId("metric-earned").textContent = brl
    ? money(brl.earnedMinor, brl.currency)
    : "R$ 0,00";
  byId("metric-pending").textContent = brl
    ? money(brl.pendingMinor, brl.currency)
    : "R$ 0,00";

  const verification = byId("affiliate-verification");
  verification.textContent =
    projection.affiliate.identityVerified &&
    projection.affiliate.contactVerified &&
    !projection.affiliate.fraudBlocked
      ? "Identidade e contato verificados"
      : "Cadastro ainda possui pendências";

  const memberships = byId("affiliate-memberships");
  memberships.replaceChildren();
  for (const membership of projection.memberships) {
    appendMembership(memberships, membership);
  }
  if (projection.memberships.length === 0) {
    memberships.textContent = "Nenhum programa de afiliados disponível.";
  }

  const select = byId<HTMLSelectElement>("affiliate-program");
  select.replaceChildren();
  for (const membership of projection.memberships) {
    if (
      membership.status !== "approved" ||
      membership.program_status !== "active"
    ) {
      continue;
    }
    const option = document.createElement("option");
    option.value = membership.program_id;
    option.textContent = `${membership.program_id} · ${membership.destination_id}`;
    select.append(option);
  }
  byId<HTMLButtonElement>("generate-referral").disabled =
    select.options.length === 0;

  const conversions = byId<HTMLTableSectionElement>("affiliate-conversions");
  conversions.replaceChildren();
  for (const conversion of projection.conversions) {
    appendConversion(conversions, conversion);
  }
  byId("conversion-empty").hidden = projection.conversions.length > 0;

  byId("payout-authority-note").textContent = projection.payoutAuthority.note;
}

function showError(message: string): void {
  const alert = byId("affiliate-alert");
  alert.hidden = false;
  alert.textContent =
    message === "AFFILIATES_RUNTIME_DISABLED"
      ? "O portal de afiliados ainda não foi habilitado neste ambiente."
      : message === "AFFILIATE_NOT_FOUND"
        ? "Sua conta autenticada ainda não está vinculada a um cadastro de afiliado."
        : "Não foi possível carregar o portal de afiliados.";
}

const auth = createDashboardAuthClient({
  fetchFn: window.fetch.bind(window),
  storage: window.sessionStorage,
  location: {
    origin: window.location.origin,
    pathname: window.location.pathname,
    search: window.location.search,
    replace: (url) => window.location.replace(url),
  },
});
const portal = createAffiliatePortalClient(auth);

byId("affiliate-logout").addEventListener("click", () => {
  void portal.logout();
});

byId("generate-referral").addEventListener("click", () => {
  void (async () => {
    const button = byId<HTMLButtonElement>("generate-referral");
    const programId = byId<HTMLSelectElement>("affiliate-program").value;
    const path =
      byId<HTMLInputElement>("affiliate-link-path").value.trim() || "/";
    button.disabled = true;
    try {
      const referral = await portal.issueReferralLink(programId, path);
      const output = byId<HTMLInputElement>("affiliate-referral-url");
      output.value = referral.url;
      byId("affiliate-referral-expiry").textContent =
        `Válido até ${dateTime(referral.expiresAt)}.`;
      byId<HTMLButtonElement>("copy-referral").disabled = false;
    } catch (error) {
      showError(error instanceof Error ? error.message : "UNKNOWN_ERROR");
    } finally {
      button.disabled = false;
    }
  })();
});

byId("copy-referral").addEventListener("click", () => {
  void (async () => {
    const output = byId<HTMLInputElement>("affiliate-referral-url");
    if (!output.value) return;
    await navigator.clipboard.writeText(output.value);
    const button = byId("copy-referral");
    button.textContent = "Copiado";
    window.setTimeout(() => {
      button.textContent = "Copiar";
    }, 1600);
  })();
});

void portal
  .bootstrap()
  .then(({ session, projection }) => {
    byId("affiliate-user").textContent = session.user.email;
    renderProjection(projection);
    byId("affiliate-loading").hidden = true;
    byId("affiliate-content").hidden = false;
  })
  .catch((error: unknown) => {
    byId("affiliate-loading").hidden = true;
    showError(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  });
