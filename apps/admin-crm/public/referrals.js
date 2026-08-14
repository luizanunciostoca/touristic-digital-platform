import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const status = document.querySelector("#referrals-status");
const list = document.querySelector("#referrals-list");
const createForm = document.querySelector("#referral-create-form");
const createSubmit = document.querySelector("#referral-create-submit");
const createStatus = document.querySelector("#referral-create-status");

function actionButton(referralId, action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.referralId = String(referralId);
  button.dataset.referralAction = action;
  button.textContent = label;
  return button;
}

function actionRow(item) {
  const row = document.createElement("p");
  if (item.status === "pending") {
    row.append(
      actionButton(item.id, "contact", "Marcar contatada"),
      document.createTextNode(" "),
      actionButton(item.id, "convert", "Converter"),
      document.createTextNode(" "),
      actionButton(item.id, "lose", "Marcar perdida"),
    );
  } else if (item.status === "contacted") {
    row.append(
      actionButton(item.id, "convert", "Converter"),
      document.createTextNode(" "),
      actionButton(item.id, "lose", "Marcar perdida"),
    );
  } else {
    row.textContent = "Lifecycle finalizado.";
  }
  return row;
}

function linkLeadForm(item) {
  const form = document.createElement("form");
  form.dataset.referralLinkForm = "true";
  form.dataset.referralId = String(item.id);

  const label = document.createElement("label");
  label.textContent = "Lead indicado ";
  const input = document.createElement("input");
  input.name = "referredLeadId";
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.required = true;
  if (item.referredLeadId) input.value = String(item.referredLeadId);
  label.append(input);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Vincular Lead";
  form.append(label, button);
  return form;
}

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
    const linkedLead = document.createElement("p");
    linkedLead.textContent = `Lead indicado vinculado: ${String(
      item.referredLeadId ?? "—",
    )}`;
    article.append(
      heading,
      state,
      linkedLead,
      actionRow(item),
      linkLeadForm(item),
    );
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

async function runAction(referralId, action, button) {
  button.disabled = true;
  status.textContent = "Atualizando indicação…";
  try {
    const response = await auth.secureFetch(
      `/api/crm/referrals/${referralId}/${action}`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      status.textContent =
        response.status === 409
          ? "A transição não é permitida para esta indicação."
          : `Falha ao atualizar (${response.status}).`;
      return;
    }
    await loadReferrals();
  } catch {
    status.textContent = "Falha ao atualizar a indicação.";
  } finally {
    button.disabled = false;
  }
}

async function linkLead(form) {
  if (!form.reportValidity()) return;
  const referralId = form.dataset.referralId;
  const referredLeadId = Number(new FormData(form).get("referredLeadId"));
  if (
    !referralId ||
    !Number.isSafeInteger(referredLeadId) ||
    referredLeadId < 1
  ) {
    status.textContent = "Revise o Lead indicado.";
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  if (button instanceof HTMLButtonElement) button.disabled = true;
  status.textContent = "Vinculando Lead…";
  try {
    const response = await auth.secureFetch(
      `/api/crm/referrals/${referralId}/link-lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ referredLeadId }),
      },
    );
    if (!response.ok) {
      status.textContent = `Falha ao vincular Lead (${response.status}).`;
      return;
    }
    await loadReferrals();
  } catch {
    status.textContent = "Falha ao vincular Lead.";
  } finally {
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

list?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-referral-action]");
  if (!(button instanceof HTMLButtonElement)) return;
  const referralId = button.dataset.referralId;
  const action = button.dataset.referralAction;
  if (referralId && ["contact", "convert", "lose"].includes(action || "")) {
    void runAction(referralId, action, button);
  }
});

list?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.matches("form[data-referral-link-form]")) return;
  void linkLead(form);
});

createForm?.addEventListener("submit", (event) => {
  void createReferral(event);
});

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Lifecycle operacional.";
    await loadReferrals();
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    status.textContent = `Falha ao carregar registros (${message}).`;
  }
}

void start();
