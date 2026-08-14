import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const trialsStatus = document.querySelector("#trials-status");
const trialsList = document.querySelector("#trials-list");
const createForm = document.querySelector("#trial-create-form");
const createSubmit = document.querySelector("#trial-create-submit");
const createStatus = document.querySelector("#trial-create-status");

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

function actionButton(trialId, action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.trialId = String(trialId);
  button.dataset.trialAction = action;
  button.textContent = label;
  return button;
}

function actions(trial) {
  const container = document.createElement("p");
  if (trial.status !== "active") {
    container.textContent = "Lifecycle finalizado.";
    return container;
  }
  container.append(
    actionButton(trial.id, "convert", "Converter"),
    document.createTextNode(" "),
    actionButton(trial.id, "cancel", "Cancelar"),
    document.createTextNode(" "),
    actionButton(trial.id, "expire", "Expirar"),
  );
  return container;
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
      actions(item),
    );
    trialsList.append(article);
  }
}

async function readTrials() {
  const response = await auth.secureFetch("/api/crm/trials");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
  return payload.data;
}

async function loadTrials() {
  trialsStatus.textContent = "Carregando trials…";
  try {
    renderTrials(await readTrials());
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    trialsStatus.textContent = `Não foi possível carregar trials (${message}).`;
  }
}

function setCreateStatus(message) {
  if (createStatus) createStatus.textContent = message;
}

async function createTrial(event) {
  event.preventDefault();
  if (!(createForm instanceof HTMLFormElement)) return;
  if (!createForm.reportValidity()) return;

  const data = new FormData(createForm);
  const leadId = Number(data.get("leadId"));
  const durationDays = Number(data.get("durationDays"));
  const startValue = String(data.get("startDate") || "").trim();
  if (
    !Number.isSafeInteger(leadId) ||
    leadId < 1 ||
    !Number.isSafeInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > 365
  ) {
    setCreateStatus("Revise os dados do trial.");
    return;
  }

  const payload = { leadId, durationDays };
  if (startValue) {
    const startDate = new Date(`${startValue}T00:00:00`);
    if (!Number.isFinite(startDate.getTime())) {
      setCreateStatus("Revise a data de início.");
      return;
    }
    payload.startDate = startDate.toISOString();
  }

  if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = true;
  setCreateStatus("Criando trial…");
  try {
    const response = await auth.secureFetch("/api/crm/trials", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setCreateStatus(
          response.status === 403
            ? "Você não possui permissão para criar trials."
            : response.status === 404
              ? "O lead informado não foi encontrado."
              : "Não foi possível criar o trial.",
        );
      }
      return;
    }
    const result = await response.json();
    if (!result?.data) {
      setCreateStatus("Resposta de criação inválida.");
      return;
    }
    createForm.reset();
    const durationInput = createForm.elements.namedItem("durationDays");
    if (durationInput instanceof HTMLInputElement) durationInput.value = "30";
    setCreateStatus("Trial criado com sucesso.");
    await loadTrials();
  } catch {
    setCreateStatus("Não foi possível criar o trial.");
  } finally {
    if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = false;
  }
}

async function runAction(trialId, action, button) {
  button.disabled = true;
  trialsStatus.textContent = "Atualizando trial…";
  try {
    const response = await auth.secureFetch(`/api/crm/trials/${trialId}/${action}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status !== 401) {
        trialsStatus.textContent =
          response.status === 403
            ? "Você não possui permissão para atualizar trials."
            : response.status === 409
              ? "O trial não está mais ativo."
              : "Não foi possível atualizar o trial.";
      }
      return;
    }
    const result = await response.json();
    if (!result?.data) {
      trialsStatus.textContent = "Resposta de atualização inválida.";
      return;
    }
    await loadTrials();
  } catch {
    trialsStatus.textContent = "Não foi possível atualizar o trial.";
  } finally {
    button.disabled = false;
  }
}

trialsList?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-trial-action]");
  if (!(button instanceof HTMLButtonElement)) return;
  const trialId = button.dataset.trialId;
  const action = button.dataset.trialAction;
  if (trialId && ["convert", "cancel", "expire"].includes(action || "")) {
    void runAction(trialId, action, button);
  }
});

createForm?.addEventListener("submit", (event) => {
  void createTrial(event);
});

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Lifecycle operacional.";
    await loadTrials();
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    trialsStatus.textContent = `Não foi possível carregar trials (${message}).`;
  }
}

void start();
