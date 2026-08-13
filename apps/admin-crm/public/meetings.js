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

const page = document.querySelector("#meetings-page");
const loading = document.querySelector("#session-loading");
const statusNode = document.querySelector("#meetings-status");
const countNode = document.querySelector("#meetings-count");
const table = document.querySelector("#meetings-table");
const body = document.querySelector("#meetings-body");
const createForm = document.querySelector("#meeting-create-form");
const createSubmit = document.querySelector("#meeting-create-submit");
const createStatus = document.querySelector("#meeting-create-status");

const statusLabels = {
  scheduled: "Agendada",
  done: "Concluída",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};
const modalityLabels = { in_person: "Presencial", online: "Online" };

function setStatus(message) {
  if (statusNode) statusNode.textContent = message;
}

function setCreateStatus(message) {
  if (createStatus) createStatus.textContent = message;
}

function cell(value) {
  const node = document.createElement("td");
  node.textContent = value ?? "—";
  return node;
}

function dateTime(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(parsed)
    : "—";
}

function lifecycleButton(meetingId, nextStatus, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button meeting-status-button";
  button.dataset.meetingId = String(meetingId);
  button.dataset.nextStatus = nextStatus;
  button.textContent = label;
  return button;
}

function actionsCell(meeting) {
  const node = document.createElement("td");
  node.className = "lead-action-cell";
  if (meeting.status !== "scheduled") {
    node.textContent = "Finalizada";
    return node;
  }
  node.append(
    lifecycleButton(meeting.id, "done", "Concluir"),
    lifecycleButton(meeting.id, "no_show", "Não compareceu"),
    lifecycleButton(meeting.id, "cancelled", "Cancelar"),
  );
  return node;
}

function render(meetings) {
  if (!(body instanceof HTMLElement) || !(table instanceof HTMLElement)) return;
  body.replaceChildren();
  for (const meeting of meetings) {
    const row = document.createElement("tr");
    row.append(
      cell(meeting.title),
      cell(meeting.leadId),
      cell(dateTime(meeting.scheduledAt)),
      cell(modalityLabels[meeting.modality] || meeting.modality),
      cell(statusLabels[meeting.status] || meeting.status),
      actionsCell(meeting),
    );
    body.append(row);
  }
  table.hidden = meetings.length === 0;
  if (countNode) {
    countNode.textContent = `${meetings.length} ${meetings.length === 1 ? "reunião" : "reuniões"}`;
  }
  setStatus(
    meetings.length === 0
      ? "Nenhuma reunião encontrada."
      : `Exibindo ${meetings.length} ${meetings.length === 1 ? "reunião" : "reuniões"}.`,
  );
}

async function loadMeetings() {
  setStatus("Carregando reuniões…");
  try {
    const response = await auth.secureFetch("/api/crm/meetings", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status !== 401) setStatus("Não foi possível carregar as reuniões.");
      return;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      setStatus("Resposta de reuniões inválida.");
      return;
    }
    render(payload.data);
  } catch {
    setStatus("Não foi possível carregar as reuniões.");
  }
}

function optionalText(data, name) {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function createMeeting(event) {
  event.preventDefault();
  if (!(createForm instanceof HTMLFormElement)) return;
  if (!createForm.reportValidity()) return;

  const data = new FormData(createForm);
  const leadIdValue = Number(data.get("leadId"));
  const title = String(data.get("title") || "").trim();
  const scheduledValue = String(data.get("scheduledAt") || "").trim();
  const modality = String(data.get("modality") || "").trim();
  const scheduledAt = new Date(scheduledValue);
  if (!Number.isSafeInteger(leadIdValue) || leadIdValue < 1 || !title || !Number.isFinite(scheduledAt.getTime())) {
    setCreateStatus("Revise os dados da reunião.");
    return;
  }

  const payload = {
    leadId: leadIdValue,
    title,
    scheduledAt: scheduledAt.toISOString(),
    modality,
    ...(optionalText(data, "meetingLink") ? { meetingLink: optionalText(data, "meetingLink") } : {}),
    ...(optionalText(data, "location") ? { location: optionalText(data, "location") } : {}),
    ...(optionalText(data, "notes") ? { notes: optionalText(data, "notes") } : {}),
  };

  if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = true;
  setCreateStatus("Agendando…");
  try {
    const response = await auth.secureFetch("/api/crm/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setCreateStatus(
          response.status === 403
            ? "Você não possui permissão para agendar reuniões."
            : response.status === 404
              ? "O lead informado não foi encontrado."
              : "Não foi possível agendar a reunião.",
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
    setCreateStatus("Reunião agendada com sucesso.");
    await loadMeetings();
  } catch {
    setCreateStatus("Não foi possível agendar a reunião.");
  } finally {
    if (createSubmit instanceof HTMLButtonElement) createSubmit.disabled = false;
  }
}

async function updateMeetingStatus(meetingId, nextStatus, button) {
  button.disabled = true;
  setStatus("Atualizando reunião…");
  try {
    const response = await auth.secureFetch(`/api/crm/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setStatus(
          response.status === 403
            ? "Você não possui permissão para atualizar reuniões."
            : "Não foi possível atualizar a reunião.",
        );
      }
      return;
    }
    const result = await response.json();
    if (!result?.data) {
      setStatus("Resposta de atualização inválida.");
      return;
    }
    await loadMeetings();
    setStatus("Reunião atualizada com sucesso.");
  } catch {
    setStatus("Não foi possível atualizar a reunião.");
  } finally {
    button.disabled = false;
  }
}

body?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest(".meeting-status-button");
  if (!(button instanceof HTMLButtonElement)) return;
  const meetingId = button.dataset.meetingId;
  const nextStatus = button.dataset.nextStatus;
  if (meetingId && ["done", "no_show", "cancelled"].includes(nextStatus || "")) {
    void updateMeetingStatus(meetingId, nextStatus, button);
  }
});

createForm?.addEventListener("submit", (event) => {
  void createMeeting(event);
});

void auth
  .getSession()
  .then((session) => {
    if (!session) throw new Error("AUTH_REQUIRED");
    if (loading instanceof HTMLElement) loading.hidden = true;
    if (page instanceof HTMLElement) page.hidden = false;
    return loadMeetings();
  })
  .catch(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/dashboard/login.html?return=${encodeURIComponent(current)}`);
  });
