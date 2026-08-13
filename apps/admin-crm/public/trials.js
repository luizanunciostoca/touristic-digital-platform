import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const trialsStatus = document.querySelector("#trials-status");
const trialsList = document.querySelector("#trials-list");

function text(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString("pt-BR");
}

function row(label, value) {
  const p = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  p.append(strong, document.createTextNode(text(value)));
  return p;
}

function renderTrials(items) {
  trialsList.replaceChildren();
  if (!items.length) {
    trialsStatus.textContent = "Nenhum trial encontrado.";
    return;
  }
  trialsStatus.textContent = `${items.length} trial(s).`;
  for (const item of items) {
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    heading.textContent = `Trial #${text(item.id)}`;
    article.append(
      heading,
      row("Lead", item.leadId),
      row("Início", date(item.startDate)),
      row("Fim", date(item.endDate)),
      row("Duração", `${text(item.durationDays)} dia(s)`),
      row("Status", item.status),
      row("Convertido em", date(item.convertedAt)),
      row("Notificado em", date(item.notifiedAt)),
    );
    trialsList.append(article);
  }
}

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Consulta somente leitura.";
    const response = await auth.secureFetch("/api/crm/trials");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
    renderTrials(payload.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    trialsStatus.textContent = `Não foi possível carregar trials (${message}).`;
  }
}

void start();
