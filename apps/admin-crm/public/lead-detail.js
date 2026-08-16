import { createDashboardAuthClient } from "@touristic/auth-browser";
import {
  crmLeadDetailInteractionLabels,
  crmLeadDetailManualInteractionTypes,
  crmLeadDetailStageLabels,
  crmLeadDetailStages,
} from "@touristic/crm/lead-detail-contract";

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

const shell = document.querySelector("#lead-detail-shell");
const loading = document.querySelector("#session-loading");
const sessionChip = document.querySelector("#session-chip");
const pageStatus = document.querySelector("#lead-detail-status");
const companyHeading = document.querySelector("#lead-company");
const summary = document.querySelector("#lead-summary");
const stageForm = document.querySelector("#lead-stage-form");
const stageSelect = document.querySelector("#lead-stage");
const stageSubmit = document.querySelector("#lead-stage-submit");
const stageStatus = document.querySelector("#lead-stage-status");
const editForm = document.querySelector("#lead-edit-form");
const editSubmit = document.querySelector("#lead-edit-submit");
const editStatus = document.querySelector("#lead-edit-status");
const checklist = document.querySelector("#lead-checklist");
const checklistProgress = document.querySelector("#lead-checklist-progress");
const interactionForm = document.querySelector("#lead-interaction-form");
const interactionType = document.querySelector("#lead-interaction-type");
const interactionSubmit = document.querySelector("#lead-interaction-submit");
const interactionStatus = document.querySelector("#lead-interaction-status");
const interactions = document.querySelector("#lead-interactions");

const search = new URLSearchParams(window.location.search);
const leadIdValue = search.get("id");
const leadId = /^\d+$/u.test(leadIdValue || "") ? Number(leadIdValue) : null;
let readOnly = false;

function text(value, fallback = "—") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date)
    : "—";
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(parsed)
    : text(value);
}

function stageLabel(stage) {
  return crmLeadDetailStageLabels[stage] || text(stage);
}

function card(label, value) {
  const article = document.createElement("article");
  const heading = document.createElement("strong");
  const detail = document.createElement("span");
  heading.textContent = label;
  detail.textContent = text(value);
  article.append(heading, detail);
  return article;
}

function setPageStatus(message) {
  if (pageStatus) pageStatus.textContent = message;
}

function setStatus(element, message) {
  if (element) element.textContent = message;
}

function formControl(form, name) {
  if (!(form instanceof HTMLFormElement)) return null;
  return form.elements.namedItem(name);
}

function setInput(form, name, value) {
  const control = formControl(form, name);
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
  ) {
    control.value = value === null || value === undefined ? "" : String(value);
  }
}

function renderStageOptions() {
  if (!(stageSelect instanceof HTMLSelectElement)) return;
  stageSelect.replaceChildren();
  for (const { stage, label } of crmLeadDetailStages) {
    const option = document.createElement("option");
    option.value = stage;
    option.textContent = label;
    stageSelect.append(option);
  }
}

function renderInteractionTypeOptions() {
  if (!(interactionType instanceof HTMLSelectElement)) return;
  interactionType.replaceChildren();
  for (const type of crmLeadDetailManualInteractionTypes) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = crmLeadDetailInteractionLabels[type];
    interactionType.append(option);
  }
}

function hydrateLead(lead) {
  if (companyHeading) companyHeading.textContent = text(lead.companyName, "Lead");
  if (stageSelect instanceof HTMLSelectElement) stageSelect.value = lead.stage;
  setInput(editForm, "companyName", lead.companyName);
  setInput(editForm, "segment", lead.segment);
  setInput(editForm, "contactName", lead.contactName);
  setInput(editForm, "whatsapp", lead.whatsapp);
  setInput(editForm, "phone", lead.phone);
  setInput(editForm, "email", lead.email);
  setInput(editForm, "monthlyValue", lead.monthlyValue);
  setInput(editForm, "address", lead.address);
  setInput(editForm, "website", lead.website);
  setInput(editForm, "source", lead.source);
  setInput(editForm, "notes", lead.notes);

  if (summary instanceof HTMLElement) {
    summary.replaceChildren(
      card("Contato", lead.contactName),
      card("Segmento", lead.segment),
      card("Etapa", stageLabel(lead.stage)),
      card("Status", lead.status),
      card("WhatsApp", lead.whatsapp),
      card("Telefone", lead.phone),
      card("E-mail", lead.email),
      card("Valor mensal", money(lead.monthlyValue)),
      card("Origem", lead.source),
      card("Último contato", dateLabel(lead.lastContactAt)),
      card("Criado em", dateLabel(lead.createdAt)),
      card("Atualizado em", dateLabel(lead.updatedAt)),
    );
  }
}

function renderChecklist(items) {
  if (!(checklist instanceof HTMLElement)) return;
  checklist.replaceChildren();
  const completed = items.filter((item) => item.completed).length;
  if (checklistProgress) {
    const percentage =
      items.length === 0 ? 0 : Math.round((completed / items.length) * 100);
    checklistProgress.textContent = `${completed} de ${items.length} etapas concluídas · ${percentage}%`;
  }

  for (const item of items) {
    const row = document.createElement("label");
    row.className = "dashboard-list-item";
    const heading = document.createElement("strong");
    const description = document.createElement("span");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.completed === true;
    checkbox.disabled = readOnly || !Number.isSafeInteger(item.id);
    checkbox.setAttribute("aria-label", item.label);
    checkbox.addEventListener("change", async () => {
      if (!Number.isSafeInteger(item.id) || !leadId) return;
      checkbox.disabled = true;
      setPageStatus(`Atualizando ${item.label}…`);
      try {
        const response = await auth.secureFetch(
          `/api/crm/leads/${leadId}/checklist/${item.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ completed: checkbox.checked }),
          },
        );
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        await loadDetail();
      } catch {
        checkbox.checked = !checkbox.checked;
        setPageStatus("Não foi possível atualizar o checklist.");
      } finally {
        checkbox.disabled = readOnly || !Number.isSafeInteger(item.id);
      }
    });
    heading.textContent = item.label;
    description.textContent = `${item.description}${item.completedAt ? ` · concluído em ${dateLabel(item.completedAt)}` : ""}`;
    row.append(checkbox, heading, description);
    checklist.append(row);
  }
}

function renderInteractions(items) {
  if (!(interactions instanceof HTMLElement)) return;
  interactions.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Nenhuma interação registrada.";
    interactions.append(empty);
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "dashboard-list-item";
    const heading = document.createElement("strong");
    const content = document.createElement("span");
    const metadata = document.createElement("span");
    heading.textContent =
      crmLeadDetailInteractionLabels[item.type] || text(item.type);
    content.textContent = text(item.content);
    metadata.textContent = `${dateLabel(item.createdAt)} · ${text(item.actorSubject, "sistema")}`;
    article.append(heading, content, metadata);
    interactions.append(article);
  }
}

function hydrateRelatedLinks() {
  if (!leadId) return;
  document
    .querySelectorAll('nav[aria-label="Ações comerciais do lead"] a')
    .forEach((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.origin);
      url.searchParams.set("leadId", String(leadId));
      anchor.href = `${url.pathname}${url.search}`;
    });
}

function validDetail(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    value.lead &&
    typeof value.lead === "object" &&
    Number.isSafeInteger(value.lead.id) &&
    Array.isArray(value.checklist) &&
    Array.isArray(value.interactions)
  );
}

async function loadDetail() {
  if (!leadId) {
    setPageStatus("Identificador do lead inválido.");
    return;
  }
  const response = await auth.secureFetch(`/api/crm/leads/${leadId}/detail`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  if (!validDetail(payload?.data)) throw new Error("INVALID_RESPONSE");
  hydrateLead(payload.data.lead);
  renderChecklist(payload.data.checklist);
  renderInteractions(payload.data.interactions);
  setPageStatus("Lead sincronizado com o CRM.");
}

async function saveStage(event) {
  event.preventDefault();
  if (!leadId || !(stageSelect instanceof HTMLSelectElement)) return;
  if (stageSubmit instanceof HTMLButtonElement) stageSubmit.disabled = true;
  setStatus(stageStatus, "Salvando etapa…");
  try {
    const response = await auth.secureFetch(`/api/crm/leads/${leadId}/stage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ stage: stageSelect.value }),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    setStatus(stageStatus, "Etapa atualizada.");
    await loadDetail();
  } catch {
    setStatus(stageStatus, "Não foi possível atualizar a etapa.");
  } finally {
    if (stageSubmit instanceof HTMLButtonElement) stageSubmit.disabled = readOnly;
  }
}

function optionalValue(data, name) {
  const value = String(data.get(name) || "").trim();
  return value ? { [name]: value } : {};
}

async function saveLead(event) {
  event.preventDefault();
  if (!leadId || !(editForm instanceof HTMLFormElement)) return;
  if (!editForm.reportValidity()) return;
  const data = new FormData(editForm);
  const companyName = String(data.get("companyName") || "").trim();
  if (!companyName) return;
  const payload = {
    companyName,
    ...optionalValue(data, "segment"),
    ...optionalValue(data, "contactName"),
    ...optionalValue(data, "whatsapp"),
    ...optionalValue(data, "phone"),
    ...optionalValue(data, "email"),
    ...optionalValue(data, "monthlyValue"),
    ...optionalValue(data, "address"),
    ...optionalValue(data, "website"),
    ...optionalValue(data, "source"),
    ...optionalValue(data, "notes"),
  };

  if (editSubmit instanceof HTMLButtonElement) editSubmit.disabled = true;
  setStatus(editStatus, "Salvando alterações…");
  try {
    const response = await auth.secureFetch(`/api/crm/leads/${leadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    setStatus(editStatus, "Lead atualizado.");
    await loadDetail();
  } catch {
    setStatus(editStatus, "Não foi possível salvar o lead.");
  } finally {
    if (editSubmit instanceof HTMLButtonElement) editSubmit.disabled = readOnly;
  }
}

async function addInteraction(event) {
  event.preventDefault();
  if (!leadId || !(interactionForm instanceof HTMLFormElement)) return;
  if (!interactionForm.reportValidity()) return;
  const data = new FormData(interactionForm);
  const type = String(data.get("type") || "");
  const content = String(data.get("content") || "").trim();
  if (!crmLeadDetailManualInteractionTypes.includes(type) || !content) return;

  if (interactionSubmit instanceof HTMLButtonElement) {
    interactionSubmit.disabled = true;
  }
  setStatus(interactionStatus, "Registrando interação…");
  try {
    const response = await auth.secureFetch(
      `/api/crm/leads/${leadId}/interactions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type, content }),
      },
    );
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    interactionForm.reset();
    renderInteractionTypeOptions();
    setStatus(interactionStatus, "Interação registrada.");
    await loadDetail();
  } catch {
    setStatus(interactionStatus, "Não foi possível registrar a interação.");
  } finally {
    if (interactionSubmit instanceof HTMLButtonElement) {
      interactionSubmit.disabled = readOnly;
    }
  }
}

stageForm?.addEventListener("submit", (event) => void saveStage(event));
editForm?.addEventListener("submit", (event) => void saveLead(event));
interactionForm?.addEventListener("submit", (event) => void addInteraction(event));

async function start() {
  renderStageOptions();
  renderInteractionTypeOptions();
  hydrateRelatedLinks();
  if (!leadId) {
    if (loading instanceof HTMLElement) loading.hidden = true;
    if (shell instanceof HTMLElement) shell.hidden = false;
    setPageStatus("Identificador do lead inválido.");
    return;
  }

  let session;
  try {
    session = await auth.getSession();
    if (!session) throw new Error("AUTH_REQUIRED");
  } catch {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(
      `/dashboard/login.html?return=${encodeURIComponent(current)}`,
    );
    return;
  }

  readOnly = session.user.role === "viewer";
  if (sessionChip) {
    sessionChip.textContent = `${text(session.user.email)} · ${text(session.user.role)}`;
  }
  for (const button of [stageSubmit, editSubmit, interactionSubmit]) {
    if (button instanceof HTMLButtonElement) button.disabled = readOnly;
  }
  if (loading instanceof HTMLElement) loading.hidden = true;
  if (shell instanceof HTMLElement) shell.hidden = false;

  try {
    await loadDetail();
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    setPageStatus(`Não foi possível carregar o lead (${message}).`);
  }
}

void start();
