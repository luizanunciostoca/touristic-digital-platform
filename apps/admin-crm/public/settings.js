import { createAuthBrowserClient } from "@touristic/auth-browser";
import {
  crmSettingsFunnelStages,
  crmSettingsV1Baseline,
} from "@touristic/crm/settings-contract";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const shell = document.querySelector("#settings-shell");
const loading = document.querySelector("#session-loading");
const sessionChip = document.querySelector("#session-chip");
const settingsStatus = document.querySelector("#settings-status");
const systemInfo = document.querySelector("#system-info");
const funnelStages = document.querySelector("#funnel-stages");
const settingForm = document.querySelector("#follow-up-setting-form");
const settingSubmit = document.querySelector("#follow-up-setting-submit");
const settingStatus = document.querySelector("#follow-up-setting-status");

let currentSetting = null;

function text(value, fallback = "—") {
  return value === null || value === undefined || value === ""
    ? fallback
    : String(value);
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

function renderSystemInfo() {
  if (!(systemInfo instanceof HTMLElement)) return;
  systemInfo.replaceChildren(
    card("Sistema", crmSettingsV1Baseline.systemName),
    card("Baseline V1", crmSettingsV1Baseline.frozenVersion),
    card("Funil", `${crmSettingsFunnelStages.length} etapas configuradas`),
    card(
      "Automação",
      "Follow-up configurável; execução permanece governada pelo CRM",
    ),
    card(
      "Integrações",
      "Propostas e contratos digitais; demais integrações seguem contratos próprios",
    ),
  );
}

function renderFunnelStages() {
  if (!(funnelStages instanceof HTMLElement)) return;
  funnelStages.replaceChildren();
  crmSettingsFunnelStages.forEach(({ stage, label }, index) => {
    const article = document.createElement("article");
    const heading = document.createElement("strong");
    const detail = document.createElement("span");
    heading.textContent = `${index + 1}. ${label}`;
    detail.textContent = stage;
    article.append(heading, detail);
    funnelStages.append(article);
  });
}

function formControl(name) {
  if (!(settingForm instanceof HTMLFormElement)) return null;
  return settingForm.elements.namedItem(name);
}

function setDefaults() {
  const name = formControl("name");
  const intervalDays = formControl("intervalDays");
  const maxAttempts = formControl("maxAttempts");
  const isActive = formControl("isActive");
  if (name instanceof HTMLInputElement) {
    name.value = crmSettingsV1Baseline.followUpDefaults.name;
  }
  if (intervalDays instanceof HTMLInputElement) {
    intervalDays.value = String(
      crmSettingsV1Baseline.followUpDefaults.intervalDays,
    );
  }
  if (maxAttempts instanceof HTMLInputElement) {
    maxAttempts.value = String(
      crmSettingsV1Baseline.followUpDefaults.maxAttempts,
    );
  }
  if (isActive instanceof HTMLInputElement) {
    isActive.checked = crmSettingsV1Baseline.followUpDefaults.isActive;
  }
}

function validSetting(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Number.isSafeInteger(value.id) || value.id < 1) return false;
  if (typeof value.name !== "string" || !value.name.trim()) return false;
  if (!Number.isSafeInteger(value.intervalDays) || value.intervalDays < 1) {
    return false;
  }
  if (!Number.isSafeInteger(value.maxAttempts) || value.maxAttempts < 1) {
    return false;
  }
  if (
    value.messageTemplate !== null &&
    typeof value.messageTemplate !== "string"
  ) {
    return false;
  }
  return typeof value.isActive === "boolean";
}

function hydrateSetting(setting) {
  if (!validSetting(setting)) return false;
  currentSetting = setting;
  const name = formControl("name");
  const intervalDays = formControl("intervalDays");
  const maxAttempts = formControl("maxAttempts");
  const isActive = formControl("isActive");
  if (name instanceof HTMLInputElement) name.value = setting.name;
  if (intervalDays instanceof HTMLInputElement) {
    intervalDays.value = String(setting.intervalDays);
  }
  if (maxAttempts instanceof HTMLInputElement) {
    maxAttempts.value = String(setting.maxAttempts);
  }
  if (isActive instanceof HTMLInputElement) isActive.checked = setting.isActive;
  return true;
}

async function loadFollowUpSetting() {
  const response = await auth.secureFetch("/api/crm/follow-ups/settings", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error("INVALID_RESPONSE");
  }
  const first = payload.data[0];
  if (!first) {
    currentSetting = null;
    setDefaults();
    if (settingsStatus) {
      settingsStatus.textContent =
        "Nenhuma configuração persistida. Defaults do contrato V1 carregados.";
    }
    return;
  }
  if (!hydrateSetting(first)) throw new Error("INVALID_SETTING");
  if (settingsStatus) {
    settingsStatus.textContent = "Configuração de follow-up carregada do CRM.";
  }
}

function setSettingStatus(message) {
  if (settingStatus) settingStatus.textContent = message;
}

async function saveSetting(event) {
  event.preventDefault();
  if (!(settingForm instanceof HTMLFormElement)) return;
  if (!settingForm.reportValidity()) return;

  const data = new FormData(settingForm);
  const name = String(data.get("name") || "").trim();
  const intervalDays = Number(data.get("intervalDays"));
  const maxAttempts = Number(data.get("maxAttempts"));
  const isActive = data.get("isActive") === "on";
  const intervalBounds = crmSettingsV1Baseline.followUpBounds.intervalDays;
  const attemptBounds = crmSettingsV1Baseline.followUpBounds.maxAttempts;

  if (
    !name ||
    name.length > 160 ||
    !Number.isSafeInteger(intervalDays) ||
    intervalDays < intervalBounds.min ||
    intervalDays > intervalBounds.max ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < attemptBounds.min ||
    maxAttempts > attemptBounds.max
  ) {
    setSettingStatus("Revise os dados da configuração.");
    return;
  }

  const payload = {
    ...(currentSetting?.id ? { id: currentSetting.id } : {}),
    name,
    intervalDays,
    maxAttempts,
    messageTemplate: currentSetting?.messageTemplate ?? null,
    isActive,
  };

  if (settingSubmit instanceof HTMLButtonElement) settingSubmit.disabled = true;
  setSettingStatus("Salvando configuração…");
  try {
    const response = await auth.secureFetch("/api/crm/follow-ups/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setSettingStatus(
          response.status === 403
            ? "Você não possui permissão para salvar configurações."
            : "Não foi possível salvar a configuração.",
        );
      }
      return;
    }
    const result = await response.json();
    if (!hydrateSetting(result?.data)) {
      setSettingStatus("Resposta de configuração inválida.");
      return;
    }
    setSettingStatus("Configuração salva com sucesso.");
    if (settingsStatus) {
      settingsStatus.textContent = "Configuração de follow-up sincronizada com o CRM.";
    }
  } catch {
    setSettingStatus("Não foi possível salvar a configuração.");
  } finally {
    if (settingSubmit instanceof HTMLButtonElement) settingSubmit.disabled = false;
  }
}

settingForm?.addEventListener("submit", (event) => {
  void saveSetting(event);
});

async function start() {
  renderSystemInfo();
  renderFunnelStages();
  setDefaults();
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    if (sessionChip) {
      sessionChip.textContent = `${text(session.user?.email)} · ${text(session.user?.role)}`;
    }
    if (loading instanceof HTMLElement) loading.hidden = true;
    if (shell instanceof HTMLElement) shell.hidden = false;
    await loadFollowUpSetting();
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    if (settingsStatus) {
      settingsStatus.textContent = `Não foi possível carregar configurações (${message}).`;
    }
  }
}

void start();
