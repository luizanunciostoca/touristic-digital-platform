const loading = document.querySelector("#proposal-loading");
const page = document.querySelector("#proposal-page");
const errorBox = document.querySelector("#proposal-error");
const errorMessage = document.querySelector("#proposal-error-message");
const title = document.querySelector("#proposal-title");
const status = document.querySelector("#proposal-status");
const message = document.querySelector("#proposal-message");
const plan = document.querySelector("#proposal-plan");
const monthly = document.querySelector("#proposal-monthly");
const setup = document.querySelector("#proposal-setup");
const trial = document.querySelector("#proposal-trial");
const validUntil = document.querySelector("#proposal-valid-until");
const features = document.querySelector("#proposal-features");
const responseCard = document.querySelector("#proposal-response-card");
const respondentName = document.querySelector("#respondent-name");
const responseStatus = document.querySelector("#proposal-response-status");
const acceptButton = document.querySelector("#proposal-accept");
const rejectButton = document.querySelector("#proposal-reject");

function tokenFromLocation() {
  const queryToken = new URLSearchParams(window.location.search)
    .get("token")
    ?.trim();
  if (queryToken) return queryToken;
  const matched = window.location.pathname.match(
    /^\/proposals\/view\/([A-Za-z0-9_-]{16,64})$/u,
  );
  return matched?.[1] ?? "";
}

const token = tokenFromLocation();
const statusLabels = {
  draft: "Rascunho",
  sent: "Enviada",
  viewed: "Visualizada",
  accepted: "Aceita",
  rejected: "Recusada",
};

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

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(parsed)
    : "—";
}

function showError(text) {
  if (loading instanceof HTMLElement) loading.hidden = true;
  if (page instanceof HTMLElement) page.hidden = true;
  if (errorBox instanceof HTMLElement) errorBox.hidden = false;
  if (errorMessage) errorMessage.textContent = text;
}

function renderFeatures(value) {
  if (!(features instanceof HTMLElement)) return;
  features.replaceChildren();
  if (Array.isArray(value)) {
    if (value.length === 0) {
      features.textContent = "Nenhum item detalhado.";
      return;
    }
    const list = document.createElement("ul");
    for (const item of value) {
      const li = document.createElement("li");
      li.textContent =
        typeof item === "string" ? item : JSON.stringify(item);
      list.append(li);
    }
    features.append(list);
    return;
  }
  if (value && typeof value === "object") {
    const list = document.createElement("ul");
    for (const [key, item] of Object.entries(value)) {
      const li = document.createElement("li");
      li.textContent = `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`;
      list.append(li);
    }
    features.append(list);
    return;
  }
  features.textContent =
    value == null ? "Nenhum item detalhado." : String(value);
}

function render(proposal) {
  if (title) title.textContent = proposal.title || "Proposta comercial";
  if (status) {
    status.textContent =
      statusLabels[proposal.status] || proposal.status || "Proposta";
  }
  if (message) message.textContent = proposal.customMessage || "";
  if (plan) plan.textContent = proposal.planName || "—";
  if (monthly) monthly.textContent = money(proposal.monthlyValue);
  if (setup) setup.textContent = money(proposal.setupFee);
  if (trial) {
    trial.textContent = Number.isFinite(proposal.trialDays)
      ? `${proposal.trialDays} dias`
      : "—";
  }
  if (validUntil) validUntil.textContent = date(proposal.validUntil);
  renderFeatures(proposal.features);
  const actionable = proposal.status === "sent" || proposal.status === "viewed";
  if (responseCard instanceof HTMLElement) responseCard.hidden = !actionable;
  if (loading instanceof HTMLElement) loading.hidden = true;
  if (errorBox instanceof HTMLElement) errorBox.hidden = true;
  if (page instanceof HTMLElement) page.hidden = false;
}

async function load() {
  if (!/^[A-Za-z0-9_-]{16,64}$/u.test(token)) {
    showError("O link da proposta é inválido.");
    return;
  }
  try {
    const response = await fetch(
      `/api/crm/public/proposals/${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) {
      showError(
        response.status === 404
          ? "Esta proposta não foi encontrada."
          : "Não foi possível carregar esta proposta.",
      );
      return;
    }
    const payload = await response.json();
    if (!payload?.data || typeof payload.data !== "object") {
      showError("A resposta da proposta é inválida.");
      return;
    }
    render(payload.data);
  } catch {
    showError("Não foi possível carregar esta proposta.");
  }
}

async function respond(accepted) {
  if (
    !(acceptButton instanceof HTMLButtonElement) ||
    !(rejectButton instanceof HTMLButtonElement)
  ) {
    return;
  }
  acceptButton.disabled = true;
  rejectButton.disabled = true;
  if (responseStatus) responseStatus.textContent = "Enviando resposta…";
  try {
    const name =
      respondentName instanceof HTMLInputElement
        ? respondentName.value.trim()
        : "";
    const response = await fetch(
      `/api/crm/public/proposals/${encodeURIComponent(token)}/respond`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          accepted,
          ...(name ? { respondentName: name } : {}),
        }),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      if (responseStatus) {
        responseStatus.textContent =
          response.status === 409
            ? payload?.error === "PROPOSAL_EXPIRED"
              ? "Esta proposta expirou."
              : "Esta proposta já foi respondida ou não pode mais ser alterada."
            : "Não foi possível registrar sua resposta.";
      }
      return;
    }
    if (!payload?.data) {
      if (responseStatus) {
        responseStatus.textContent = "Resposta inválida do servidor.";
      }
      return;
    }
    render(payload.data);
    if (responseStatus) {
      responseStatus.textContent = accepted
        ? "Proposta aceita com sucesso."
        : "Proposta recusada.";
    }
  } catch {
    if (responseStatus) {
      responseStatus.textContent = "Não foi possível registrar sua resposta.";
    }
  } finally {
    acceptButton.disabled = false;
    rejectButton.disabled = false;
  }
}

acceptButton?.addEventListener("click", () => {
  void respond(true);
});
rejectButton?.addEventListener("click", () => {
  void respond(false);
});

void load();
