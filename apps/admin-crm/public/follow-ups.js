import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const pendingStatus = document.querySelector("#pending-status");
const pendingList = document.querySelector("#pending-list");
const settingsStatus = document.querySelector("#settings-status");
const settingsList = document.querySelector("#settings-list");

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

function renderPending(items) {
  pendingList.replaceChildren();
  if (!items.length) {
    pendingStatus.textContent = "Nenhum follow-up pendente.";
    return;
  }
  pendingStatus.textContent = `${items.length} follow-up(s) pendente(s).`;
  for (const item of items) {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = `Follow-up #${text(item.id)}`;
    article.append(
      heading,
      row("Lead", item.leadId),
      row("Configuração", item.settingId),
      row("Tentativa", item.attemptNumber),
      row("Status", item.status),
      row("Agendado para", date(item.scheduledAt)),
      row("Mensagem", item.generatedMessage),
    );
    pendingList.append(article);
  }
}

function renderSettings(items) {
  settingsList.replaceChildren();
  if (!items.length) {
    settingsStatus.textContent = "Nenhuma configuração de follow-up.";
    return;
  }
  settingsStatus.textContent = `${items.length} configuração(ões).`;
  for (const item of items) {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    heading.textContent = text(item.name, `Configuração #${text(item.id)}`);
    article.append(
      heading,
      row("Intervalo", `${text(item.intervalDays)} dia(s)`),
      row("Máximo de tentativas", item.maxAttempts),
      row("Ativa", item.isActive ? "Sim" : "Não"),
      row("Modelo de mensagem", item.messageTemplate),
    );
    settingsList.append(article);
  }
}

async function readData(path) {
  const response = await auth.secureFetch(path);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
  return payload.data;
}

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Consulta somente leitura.";
    const [pending, settings] = await Promise.all([
      readData("/api/crm/follow-ups/pending"),
      readData("/api/crm/follow-ups/settings"),
    ]);
    renderPending(pending);
    renderSettings(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    pendingStatus.textContent = `Não foi possível carregar follow-ups (${message}).`;
    settingsStatus.textContent = `Não foi possível carregar configurações (${message}).`;
  }
}

void start();
void import("./follow-ups-lifecycle.js");
