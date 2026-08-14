import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const status = document.querySelector("#referrals-status");
const list = document.querySelector("#referrals-list");
const createForm = document.querySelector("#referral-create-form");
const createSubmit = document.querySelector("#referral-create-submit");
const createStatus = document.querySelector("#referral-create-status");

function render(items) {
  list.replaceChildren();
  status.textContent = items.length
    ? `${items.length} registro(s).`
    : "Nenhum registro encontrado.";
  for (const item of items) {
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    heading.textContent = `Registro #${String(item.id)}`;
    const state = document.createElement("p");
    state.textContent = `Status: ${String(item.status ?? "—")}`;
    article.append(heading, state);
    list.append(article);
  }
}

async function loadReferrals() {
  const response = await auth.secureFetch("/api/crm/referrals");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
  render(payload.data);
}

async function createReferral(event) {
  event.preventDefault();
  if (!(createForm instanceof HTMLFormElement)) return;
  if (!createForm.reportValidity()) return;

  const data = new FormData(createForm);
  const referrerLeadId = Number(data.get("referrerLeadId"));
  const referredName = String(data.get("referredName") || "").trim();
  if (!Number.isSafeInteger(referrerLeadId) || referrerLeadId < 1 || !referredName) {
    if (createStatus) createStatus.textContent = "Revise os campos.";
    return;
  }

  if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = true;
  if (createStatus) createStatus.textContent = "Salvando…";
  try {
    const response = await auth.secureFetch("/api/crm/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ referrerLeadId, referredName }),
    });
    if (!response.ok) {
      if (createStatus) createStatus.textContent = `Falha (${response.status}).`;
      return;
    }
    createForm.reset();
    if (createStatus) createStatus.textContent = "Salvo.";
    await loadReferrals();
  } catch {
    if (createStatus) createStatus.textContent = "Falha ao salvar.";
  } finally {
    if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = false;
  }
}

createForm?.addEventListener("submit", (event) => {
  void createReferral(event);
});

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada.";
    await loadReferrals();
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    status.textContent = `Falha ao carregar registros (${message}).`;
  }
}

void start();
