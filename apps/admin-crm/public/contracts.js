import { createDashboardAuthClient } from "@touristic/auth-browser";

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

const page = document.querySelector("#contracts-page");
const loading = document.querySelector("#session-loading");
const status = document.querySelector("#contracts-status");
const table = document.querySelector("#contracts-table");
const body = document.querySelector("#contracts-body");
const count = document.querySelector("#contracts-count");

const statusLabels = { draft: "Rascunho", sent: "Enviado", signed: "Assinado", cancelled: "Cancelado" };

function textCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value ?? "—";
  return cell;
}

function money(value) {
  if (typeof value !== "string" || !value) return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parsed)
    : value;
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
    : "—";
}

function setStatus(message) {
  if (status) status.textContent = message;
}

function renderContracts(contracts) {
  if (!(body instanceof HTMLElement) || !(table instanceof HTMLElement)) return;
  body.replaceChildren();
  for (const contract of contracts) {
    const row = document.createElement("tr");
    row.append(
      textCell(contract.title),
      textCell(contract.leadId),
      textCell(contract.proposalId),
      textCell(money(contract.monthlyValue)),
      textCell(statusLabels[contract.status] || contract.status),
      textCell(dateLabel(contract.sentAt)),
      textCell(dateLabel(contract.signedAt)),
    );
    body.append(row);
  }
  table.hidden = contracts.length === 0;
  if (count) count.textContent = `${contracts.length} ${contracts.length === 1 ? "contrato" : "contratos"}`;
  setStatus(
    contracts.length === 0
      ? "Nenhum contrato encontrado."
      : `Exibindo ${contracts.length} ${contracts.length === 1 ? "contrato" : "contratos"}.`,
  );
}

async function loadContracts() {
  setStatus("Carregando contratos…");
  try {
    const response = await auth.secureFetch("/api/crm/contracts", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status !== 401) setStatus("Não foi possível carregar os contratos.");
      return;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      setStatus("Resposta de contratos inválida.");
      return;
    }
    renderContracts(payload.data);
  } catch {
    setStatus("Não foi possível carregar os contratos.");
  }
}

void auth
  .getSession()
  .then((session) => {
    if (!session) throw new Error("AUTH_REQUIRED");
    if (loading instanceof HTMLElement) loading.hidden = true;
    if (page instanceof HTMLElement) page.hidden = false;
    void loadContracts();
  })
  .catch(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/dashboard/login.html?return=${encodeURIComponent(current)}`);
  });