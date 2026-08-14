import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const pendingStatus = document.querySelector("#pending-status");
const pendingList = document.querySelector("#pending-list");
const settingsStatus = document.querySelector("#settings-status");
const settingsList = document.querySelector("#settings-list");
const createForm = document.querySelector("#follow-up-create-form");
const createSubmit = document.querySelector("#follow-up-create-submit");
const createStatus = document.querySelector("#follow-up-create-status");

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

async function loadPending() {
  pendingStatus.textContent = "Carregando follow-ups…";
  renderPending(await readData("/api/crm/follow-ups/pending"));
}

function setCreateStatus(message) {
  if (createStatus) createStatus.textContent = message;
}

async function createFollowUp(event) {
  event.preventDefault();
  if (!(createForm instanceof HTMLFormElement)) return;
  if (!createForm.reportValidity()) return;

  const data = new FormData(createForm);
  const leadId = Number(data.get("leadId"));
  const settingValue = String(data.get("settingId") || "").trim();
  const settingId = settingValue ? Number(settingValue) : null;
  const attemptNumber = Number(data.get("attemptNumber"));
  const scheduledValue = String(data.get("scheduledAt") || "").trim();
  const scheduledAt = new Date(scheduledValue);

  if (
    !Number.isSafeInteger(leadId) ||
    leadId < 1 ||
    (settingId !== null && (!Number.isSafeInteger(settingId) || settingId < 1)) ||
    !Number.isSafeInteger(attemptNumber) ||
    attemptNumber < 1 ||
    attemptNumber > 100 ||
    !scheduledValue ||
    !Number.isFinite(scheduledAt.getTime())
  ) {
    setCreateStatus("Revise os dados do follow-up.");
    return;
  }

  const payload = {
    leadId,
    scheduledAt: scheduledAt.toISOString(),
    attemptNumber,
    ...(settingId === null ? {} : { settingId }),
  };

  if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = true;
  setCreateStatus("Agendando follow-up…");
  try {
    const response = await auth.secureFetch("/api/crm/follow-ups", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setCreateStatus(
          response.status === 403
            ? "Você não possui permissão para agendar follow-ups."
            : response.status === 404
              ? "Lead ou configuração não encontrados."
              : "Não foi possível agendar o follow-up.",
        );
      }
      return;
    }
    const result = await response.json();
    if (!result?.data) {
      setCreateStatus("Resposta de agendamento inválida.");
      return;
    }
    createForm.reset();
    const attemptInput = createForm.elements.namedItem("attemptNumber");
    if (attemptInput instanceof HTMLInputElement) attemptInput.value = "1";
    setCreateStatus("Follow-up agendado com sucesso.");
    await loadPending();
  } catch {
    setCreateStatus("Não foi possível agendar o follow-up.");
  } finally {
    if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = false;
  }
}

createForm?.addEventListener("submit", (event) => {
  void createFollowUp(event);
});

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Agendamento operacional.";
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
