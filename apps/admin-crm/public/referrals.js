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
const sessionStatus = document.querySelector("#session-status");
const status = document.querySelector("#referrals-status");
const list = document.querySelector("#referrals-list");
const createForm = document.querySelector("#referral-create-form");
const createSubmit = document.querySelector("#referral-create-submit");
const createStatus = document.querySelector("#referral-create-status");

let mutationGeneration = 0;
let readGeneration = 0;
let listNeedsRefresh = true;
let listHasLoaded = false;
const feedbackOwners = new WeakMap();
const pendingControls = new Map();
const recovery = document.createElement("p");
recovery.id = "referrals-recovery";
recovery.setAttribute("role", "status");
status.after(recovery);

function beginMutation(target, button, key) {
  if (pendingControls.has(key)) return null;
  const operation = { target, button, key, confirmed: false };
  pendingControls.set(key, operation);
  feedbackOwners.set(target, operation);
  ++mutationGeneration;
  ++readGeneration;
  if (listNeedsRefresh) offerRecovery();
  return operation;
}

function ownsFeedback(operation) {
  return feedbackOwners.get(operation.target) === operation;
}

function releaseButton(operation) {
  if (
    (!operation.confirmed || operation.key === "create") &&
    pendingControls.get(operation.key) === operation
  ) {
    pendingControls.delete(operation.key);
  }
  if (pendingControls.has(operation.key)) return;
  operation.button.disabled = false;
  for (const button of list.querySelectorAll("button[data-referral-key]")) {
    if (button.dataset.referralKey === operation.key) button.disabled = false;
  }
}

function offerRecovery(authFailure = false) {
  if (!listHasLoaded && !feedbackOwners.has(status)) {
    status.textContent = "Lista ainda não carregada.";
  }
  const retry = document.createElement("button");
  retry.type = "button";
  retry.style.minHeight = "44px";
  retry.textContent = authFailure ? "Tentar novamente" : "Atualizar lista";
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    if (authFailure) await start();
    else await loadReferrals();
  });
  recovery.replaceChildren(
    document.createTextNode("Não foi possível atualizar a lista. "),
    retry,
  );
}

function actionButton(referralId, action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.referralId = String(referralId);
  button.dataset.referralAction = action;
  button.dataset.referralKey = `${referralId}:${action}`;
  button.disabled = pendingControls.has(button.dataset.referralKey);
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

function linkLeadForm(item, draft) {
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
  input.defaultValue = String(item.referredLeadId ?? "");
  input.value = draft && draft.value !== draft.baseline
    ? draft.value
    : input.defaultValue;
  label.append(input);

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Vincular Lead";
  button.dataset.referralKey = `${item.id}:link`;
  button.disabled = pendingControls.has(button.dataset.referralKey);
  form.append(label, button);
  return form;
}

function render(items) {
  const drafts = new Map(
    [...list.querySelectorAll("form[data-referral-link-form]")].map((form) => {
      const input = form.querySelector("input");
      return [form.dataset.referralId, {
        value: input.value,
        baseline: input.defaultValue,
      }];
    }),
  );
  list.replaceChildren();
  if (!feedbackOwners.has(status)) {
    status.textContent = items.length
      ? `${items.length} registro(s).`
      : "Nenhum registro encontrado.";
  }
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
      linkLeadForm(item, drafts.get(String(item.id))),
    );
    list.append(article);
  }
}

async function loadReferrals(generation = mutationGeneration) {
  if (generation !== mutationGeneration) return false;
  listNeedsRefresh = true;
  const read = ++readGeneration;
  const current = () => generation === mutationGeneration && read === readGeneration;
  recovery.textContent = "Atualizando lista…";
  try {
    const response = await auth.secureFetch("/api/crm/referrals");
    if (!current()) return false;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!current()) return false;
    if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
    render(payload.data);
    for (const [key, operation] of pendingControls) {
      if (!operation.confirmed) continue;
      pendingControls.delete(key);
      releaseButton(operation);
    }
    listNeedsRefresh = false;
    listHasLoaded = true;
    recovery.replaceChildren();
    return true;
  } catch {
    if (current()) offerRecovery();
    return false;
  }
}

async function refreshAfterMutation(confirmation, operation) {
  operation.confirmed = true;
  ++mutationGeneration;
  listNeedsRefresh = true;
  if (ownsFeedback(operation)) operation.target.textContent = confirmation;
  // Every confirmed write needs a current read, even after its message lost ownership.
  await loadReferrals();
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

  const operation = beginMutation(
    createStatus || status,
    createSubmit,
    "create",
  );
  if (!operation) return;
  if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = true;
  if (createStatus) createStatus.textContent = "Salvando…";
  try {
    const response = await auth.secureFetch("/api/crm/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ referrerLeadId, referredName }),
    });
    if (!response.ok) {
      if (ownsFeedback(operation) && createStatus) {
        createStatus.textContent = `Falha (${response.status}).`;
      }
      return;
    }
    const currentDraft = new FormData(createForm);
    if (["referrerLeadId", "referredName"].every(
      (name) => currentDraft.get(name) === data.get(name),
    )) {
      createForm.reset();
    }
    await refreshAfterMutation("Salvo.", operation);
  } catch {
    if (ownsFeedback(operation) && createStatus)
      createStatus.textContent = "Falha ao salvar.";
  } finally {
    releaseButton(operation);
  }
}

async function runAction(referralId, action, button) {
  const operation = beginMutation(status, button, `${referralId}:${action}`);
  if (!operation) return;
  button.disabled = true;
  status.textContent = "Atualizando indicação…";
  try {
    const response = await auth.secureFetch(
      `/api/crm/referrals/${referralId}/${action}`,
      { method: "POST", headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      if (ownsFeedback(operation)) status.textContent =
        response.status === 409
          ? "A transição não é permitida para esta indicação."
          : `Falha ao atualizar (${response.status}).`;
      return;
    }
    await refreshAfterMutation("Indicação atualizada.", operation);
  } catch {
    if (ownsFeedback(operation)) status.textContent = "Falha ao atualizar a indicação.";
  } finally {
    releaseButton(operation);
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
  const operation = beginMutation(status, button, `${referralId}:link`);
  if (!operation) return;
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
      if (ownsFeedback(operation))
        status.textContent = `Falha ao vincular Lead (${response.status}).`;
      return;
    }
    for (const currentForm of list.querySelectorAll(
      "form[data-referral-link-form]",
    )) {
      if (currentForm.dataset.referralId !== referralId) continue;
      const input = currentForm.querySelector("input");
      const value = input.value;
      input.defaultValue = String(referredLeadId);
      input.value = value;
    }
    await refreshAfterMutation("Lead vinculado.", operation);
  } catch {
    if (ownsFeedback(operation)) status.textContent = "Falha ao vincular Lead.";
  } finally {
    releaseButton(operation);
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
    await auth.getSession();
    sessionStatus.textContent = "Sessão autenticada. Lifecycle operacional.";
    await loadReferrals();
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      const current = window.location.pathname + window.location.search;
      window.location.replace("/dashboard/login.html?return=" + encodeURIComponent(current));
      return;
    }
    sessionStatus.textContent = "Não foi possível verificar a sessão.";
    offerRecovery(true);
  }
}

void start();
