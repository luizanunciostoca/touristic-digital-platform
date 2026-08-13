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

const page = document.querySelector("#proposals-page");
const loading = document.querySelector("#session-loading");
const status = document.querySelector("#proposals-status");
const table = document.querySelector("#proposals-table");
const body = document.querySelector("#proposals-body");
const count = document.querySelector("#proposals-count");
const createForm = document.querySelector("#proposal-create-form");
const createSubmit = document.querySelector("#proposal-create-submit");
const createStatus = document.querySelector("#proposal-create-status");

const statusLabels = {
  draft: "Rascunho",
  sent: "Enviada",
  viewed: "Visualizada",
  accepted: "Aceita",
  rejected: "Recusada",
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

function actionCell(proposal) {
  const cell = document.createElement("td");
  if (proposal.status !== "draft") {
    cell.textContent = "—";
    return cell;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Enviar";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await auth.secureFetch(
        `/api/crm/proposals/${proposal.id}/send`,
        {
          method: "POST",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) {
        setStatus("Não foi possível enviar a proposta.");
        return;
      }
      await loadProposals();
    } catch {
      setStatus("Não foi possível enviar a proposta.");
    } finally {
      button.disabled = false;
    }
  });
  cell.append(button);
  return cell;
}

function renderProposals(proposals) {
  if (!(body instanceof HTMLElement) || !(table instanceof HTMLElement)) return;
  body.replaceChildren();
  for (const proposal of proposals) {
    const row = document.createElement("tr");
    row.append(
      textCell(proposal.title),
      textCell(proposal.leadId),
      textCell(proposal.planName),
      textCell(money(proposal.monthlyValue)),
      textCell(money(proposal.setupFee)),
      textCell(`${proposal.trialDays ?? 0} dias`),
      textCell(statusLabels[proposal.status] || proposal.status),
      textCell(dateLabel(proposal.validUntil)),
      actionCell(proposal),
    );
    body.append(row);
  }
  table.hidden = proposals.length === 0;
  if (count) {
    count.textContent = `${proposals.length} ${proposals.length === 1 ? "proposta" : "propostas"}`;
  }
  setStatus(
    proposals.length === 0
      ? "Nenhuma proposta encontrada."
      : `Exibindo ${proposals.length} ${proposals.length === 1 ? "proposta" : "propostas"}.`,
  );
}

async function loadProposals() {
  setStatus("Carregando propostas…");
  try {
    const response = await auth.secureFetch("/api/crm/proposals", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      if (response.status !== 401) {
        setStatus("Não foi possível carregar as propostas.");
      }
      return;
    }
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) {
      setStatus("Resposta de propostas inválida.");
      return;
    }
    renderProposals(payload.data);
  } catch {
    setStatus("Não foi possível carregar as propostas.");
  }
}

if (createForm instanceof HTMLFormElement) {
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(createForm);
    const validUntil = String(formData.get("validUntil") || "").trim();
    const payload = {
      leadId: String(formData.get("leadId") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      planName: String(formData.get("planName") || "").trim() || null,
      monthlyValue: String(formData.get("monthlyValue") || "").trim(),
      setupFee: String(formData.get("setupFee") || "").trim() || null,
      trialDays: Number(formData.get("trialDays") || 0),
      validUntil: validUntil || null,
    };

    if (createSubmit instanceof HTMLButtonElement) {
      createSubmit.disabled = true;
    }
    if (createStatus) createStatus.textContent = "Criando proposta…";

    try {
      const response = await auth.secureFetch("/api/crm/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (createStatus) {
          createStatus.textContent = "Não foi possível criar a proposta.";
        }
        return;
      }
      createForm.reset();
      if (createStatus) createStatus.textContent = "Proposta criada.";
      await loadProposals();
    } catch {
      if (createStatus) {
        createStatus.textContent = "Não foi possível criar a proposta.";
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
    void loadProposals();
  })
  .catch(() => {
    const current = `${window.location.pathname}${window.location.search}`;
    window.location.replace(
      `/dashboard/login.html?return=${encodeURIComponent(current)}`,
    );
  });
