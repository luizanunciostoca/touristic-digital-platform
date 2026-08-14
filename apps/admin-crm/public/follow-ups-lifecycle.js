import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const createForm = document.querySelector("#follow-up-create-form");
const createStatus = document.querySelector("#follow-up-create-status");
const historyStatus = document.querySelector("#history-status");
const historyList = document.querySelector("#history-list");
const settingForm = document.querySelector("#follow-up-setting-form");
const settingStatus = document.querySelector("#follow-up-setting-form-status");
const settingReset = document.querySelector("#follow-up-setting-reset");

async function request(path, method = "GET", body) {
  const response = await auth.secureFetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function resetSetting() {
  if (!(settingForm instanceof HTMLFormElement)) return;
  settingForm.reset();
  const id = settingForm.elements.namedItem("id");
  if (id instanceof HTMLInputElement) id.value = "";
  const active = settingForm.elements.namedItem("isActive");
  if (active instanceof HTMLInputElement) active.checked = true;
}

function fillSetting(item) {
  if (!(settingForm instanceof HTMLFormElement)) return;
  for (const name of ["id", "name", "intervalDays", "maxAttempts", "messageTemplate"]) {
    const field = settingForm.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.value = item[name] == null ? "" : String(item[name]);
    }
  }
  const active = settingForm.elements.namedItem("isActive");
  if (active instanceof HTMLInputElement) active.checked = item.isActive === true;
}

async function loadSettings() {
  const payload = await request("/api/crm/follow-ups/settings");
  const list = document.querySelector("#settings-list");
  if (!(list instanceof HTMLElement) || !Array.isArray(payload.data)) return;
  for (const article of list.querySelectorAll("article")) article.remove();
  for (const item of payload.data) {
    const article = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = item.name || `Configuração #${item.id}`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Editar";
    button.addEventListener("click", () => fillSetting(item));
    article.append(title, document.createTextNode(" "), button);
    list.append(article);
  }
}

async function loadHistory() {
  const payload = await request("/api/crm/follow-ups");
  if (!(historyList instanceof HTMLElement) || !Array.isArray(payload.data)) return;
  historyList.replaceChildren();
  historyStatus.textContent = `${payload.data.length} follow-up(s) registrado(s).`;
  for (const item of payload.data) {
    const article = document.createElement("article");
    const label = document.createElement("span");
    label.textContent = `#${item.id} · Lead ${item.leadId} · ${item.status}`;
    article.append(label);
    if (item.status === "pending" || item.status === "sent") {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.status === "pending" ? "Marcar enviado" : "Marcar respondido";
      button.addEventListener("click", async () => {
        button.disabled = true;
        const suffix = item.status === "pending" ? "sent" : "responded";
        try {
          await request(`/api/crm/follow-ups/${item.id}/${suffix}`, "POST");
          await loadHistory();
        } catch {
          historyStatus.textContent = "Não foi possível atualizar o follow-up.";
          button.disabled = false;
        }
      });
      article.append(document.createTextNode(" "), button);
    }
    historyList.append(article);
  }
}

if (createForm instanceof HTMLFormElement) {
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(createForm);
    const settingId = String(data.get("settingId") || "").trim();
    try {
      await request("/api/crm/follow-ups", "POST", {
        leadId: Number(data.get("leadId")),
        settingId: settingId ? Number(settingId) : null,
        scheduledAt: new Date(String(data.get("scheduledAt"))).toISOString(),
        attemptNumber: Number(data.get("attemptNumber") || 1),
      });
      createForm.reset();
      createStatus.textContent = "Follow-up agendado.";
      await loadHistory();
    } catch {
      createStatus.textContent = "Não foi possível agendar o follow-up.";
    }
  });
}

if (settingForm instanceof HTMLFormElement) {
  settingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(settingForm);
    const id = String(data.get("id") || "").trim();
    try {
      await request("/api/crm/follow-ups/settings", "PUT", {
        ...(id ? { id: Number(id) } : {}),
        name: String(data.get("name") || "").trim(),
        intervalDays: Number(data.get("intervalDays")),
        maxAttempts: Number(data.get("maxAttempts")),
        messageTemplate: String(data.get("messageTemplate") || "").trim(),
        isActive: data.get("isActive") === "on",
      });
      resetSetting();
      settingStatus.textContent = "Configuração salva.";
      await loadSettings();
    } catch {
      settingStatus.textContent = "Não foi possível salvar a configuração.";
    }
  });
}

if (settingReset instanceof HTMLButtonElement) {
  settingReset.addEventListener("click", resetSetting);
}

void auth.requireSession({ returnTo: window.location.pathname }).then((session) => {
  if (!session) return;
  void Promise.all([loadHistory(), loadSettings()]);
});
