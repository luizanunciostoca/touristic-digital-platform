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

const page = document.querySelector("#contracts-page");
const loading = document.querySelector("#session-loading");
const status = document.querySelector("#contracts-status");
const table = document.querySelector("#contracts-table");
const body = document.querySelector("#contracts-body");
const count = document.querySelector("#contracts-count");
const createForm = document.querySelector("#contract-create-form");
const createSubmit = document.querySelector("#contract-create-submit");
const createStatus = document.querySelector("#contract-create-status");

const statusLabels = {
  draft: "Rascunho",
  sent: "Enviado",
  signed: "Assinado",
  cancelled: "Cancelado",
};

function textCell(value) {
  const cell = document.createElement("td");
  cell.textContent = value ?? "—";
  return cell;
}

function money(value) {
  if (typeof value !== "string" || !value) return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(parsed)
    : value;
}

function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date)
    : "—";
}

function setStatus(message) {
  if (status) status.textContent = message;
}

async function command(path, bodyValue) {
  const response = await auth.secureFetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...(bodyValue === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(bodyValue === undefined ? {} : { body: JSON.stringify(bodyValue) }),
  });
  return response.ok;
}

function actionCell(contract) {
  const cell = document.createElement("td");
  const actions = [];

  if (contract.status === "draft") {
    actions.push({ label: "Enviar", suffix: "send" });
  }
  if (contract.status !== "signed" && contract.status !== "cancelled") {
    actions.push({ label: "Cancelar", suffix: "cancel" });
  }

  if (actions.length === 0) {
    cell.textContent = "—";
    return cell;
  }

  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const bodyValue =
          action.suffix === "cancel"
            ? { reason: window.prompt("Motivo do cancelamento (opcional)") || null }
            : undefined;
        const ok = await command(
          `/api/crm/contracts/${contract.id}/${action.suffix}`,
          bodyValue,
        );
        if (!ok) {
          setStatus(`Não foi possível ${action.label.toLowerCase()} o contrato.`);
          return;
        }
        await loadContracts();
      } catch {
        setStatus(`Não foi possível ${action.label.toLowerCase()} o contrato.`);
      } finally {
        button.disabled = false;
      }
    });
    cell.append(button);
  }

  return cell;
}

function renderContracts(contracts) {
  if (!(body instanceof HTMLElement) || !(table instanceof HTMLElement)) return;
  body.replaceChildren();
  for (const contract of contracts) {
    const row = document.createElement("tr");
    row.append(
      textCell(contract.title),
      textCell(contract.leadId),
      textCell(contract.proposalId),
      textCell(money(contract.monthlyValue)),
      textCell(statusLabels[contract.status] || contract.status),
      textCell(dateLabel(contract.sentAt)),
      textCell(dateLabel(contract.signedAt)),
      actionCell(contract),
    );
    body.append(row);
  }
  table.hidden = contracts.length === 0;
  if (count) {
    count.textContent = `${contracts.length} ${contracts.length === 1 ? "contrato" : "contratos"}`;
  }
  setStatus(
    contracts.length === 0
      ? "Nenhum contrato encontrado."
      : `Exibindo ${contracts.length} ${contracts.length === 1 ? "contrato" : "contratos"}.`,
  );
}

async function loadContracts() {
  setStatus("Carregando contratos…");
  try {
    const response = await auth.secureFetch("/api/crm/contracts", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setStatus("Não foi possível carregar os contratos.");
      }
      return;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      setStatus("Resposta de contratos inválida.");
      return;
    }
    renderContracts(payload.data);
  } catch {
    setStatus("Não foi possível carregar os contratos.");
  }
}

if (createForm instanceof HTMLFormElement) {
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const proposalId = String(formData.get("proposalId") || "").trim();
    const monthlyValue = String(formData.get("monthlyValue") || "").trim();
    const payload = {
      leadId: String(formData.get("leadId") || "").trim(),
      proposalId: proposalId || null,
      title: String(formData.get("title") || "").trim(),
      content: String(formData.get("content") || "").trim(),
      monthlyValue: monthlyValue || null,
    };

    if (createSubmit instanceof HTMLButtonElement) {
      createSubmit.disabled = true;
    }
    if (createStatus) createStatus.textContent = "Criando contrato…";

    try {
      const response = await auth.secureFetch("/api/crm/contracts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (createStatus) {
          createStatus.textContent = "Não foi possível criar o contrato.";
        }
        return;
      }
      createForm.reset();
      if (createStatus) createStatus.textContent = "Contrato criado.";
      await loadContracts();
    } catch {
      if (createStatus) {
        createStatus.textContent = "Não foi possível criar o contrato.";
      }
    } finally {
      if (createSubmit instanceof HTMLButtonElement) {
        createSubmit.disabled = false;
      }
    }
  });
}

void auth
  .getSession()
  .then((session) => {
    if (!session) throw new Error("AUTH_REQUIRED");
    if (loading instanceof HTMLElement) loading.hidden = true;
    if (page instanceof HTMLElement) page.hidden = false;
    void loadContracts();
  })
  .catch(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(
      `/dashboard/login.html?return=${encodeURIComponent(current)}`,
    );
  });
