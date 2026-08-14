const statusNode = document.querySelector("#status");
const contractSection = document.querySelector("#contract");
const titleNode = document.querySelector("#title");
const contentNode = document.querySelector("#content");
const monthlyValueNode = document.querySelector("#monthly-value");
const contractStatusNode = document.querySelector("#contract-status");
const sentAtNode = document.querySelector("#sent-at");
const signedAtNode = document.querySelector("#signed-at");
const signedByNode = document.querySelector("#signed-by");
const signatureSection = document.querySelector("#signature-section");
const signerNameInput = document.querySelector("#signer-name");
const canvas = document.querySelector("#signature-canvas");
const clearButton = document.querySelector("#clear-button");
const signButton = document.querySelector("#sign-button");
const signStatus = document.querySelector("#sign-status");
const context = canvas.getContext("2d");

let token = null;
let activePointerId = null;
let hasSignature = false;

function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-BR");
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : String(value);
}

function safeToken(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{16,64}$/u.test(normalized) ? normalized : null;
}

function tokenFromLocation() {
  const queryToken = safeToken(
    new URLSearchParams(window.location.search).get("token"),
  );
  if (queryToken) return queryToken;
  const matched = window.location.pathname.match(
    /^\/contracts\/view\/([A-Za-z0-9_-]{16,64})$/u,
  );
  return safeToken(matched?.[1] ?? null);
}

function point(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  return {
    x: Math.min(Math.max(x, 0), canvas.width),
    y: Math.min(Math.max(y, 0), canvas.height),
  };
}

function begin(event) {
  if (activePointerId !== null) return;
  activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  const current = point(event);
  context.beginPath();
  context.moveTo(current.x, current.y);
  event.preventDefault();
}

function move(event) {
  if (event.pointerId !== activePointerId) return;
  const current = point(event);
  context.lineWidth = 3;
  context.lineCap = "round";
  context.strokeStyle = "#111";
  context.lineTo(current.x, current.y);
  context.stroke();
  hasSignature = true;
  event.preventDefault();
}

function end(event) {
  if (event.pointerId !== activePointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  activePointerId = null;
  event.preventDefault();
}

function recoverPointer(event) {
  if (event.pointerId === activePointerId) activePointerId = null;
}

function clearSignature() {
  if (
    activePointerId !== null &&
    canvas.hasPointerCapture(activePointerId)
  ) {
    canvas.releasePointerCapture(activePointerId);
  }
  activePointerId = null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  hasSignature = false;
}

function render(contract) {
  titleNode.textContent = contract.title || "Contrato";
  contentNode.textContent = contract.content || "";
  monthlyValueNode.textContent = money(contract.monthlyValue);
  contractStatusNode.textContent = contract.status || "—";
  sentAtNode.textContent = date(contract.sentAt);
  signedAtNode.textContent = date(contract.signedAt);
  contractSection.hidden = false;
  statusNode.textContent = "Contrato carregado.";
  const canSign = contract.status === "sent";
  signatureSection.hidden = !canSign;
  if (contract.signerName) {
    signedByNode.hidden = false;
    signedByNode.textContent = `Assinado por ${contract.signerName}.`;
  }
}

async function loadContract() {
  token = tokenFromLocation();
  if (!token) {
    statusNode.textContent = "Link de contrato inválido.";
    statusNode.className = "error";
    return;
  }
  try {
    const response = await fetch(
      `/api/crm/public/contracts/${encodeURIComponent(token)}`,
      { headers: { Accept: "application/json" } },
    );
    const payload = await response.json();
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    render(payload.data);
  } catch (error) {
    statusNode.textContent = `Não foi possível carregar o contrato (${error instanceof Error ? error.message : "UNKNOWN_ERROR"}).`;
    statusNode.className = "error";
  }
}

async function signContract() {
  if (!token) return;
  const signerName = signerNameInput.value.trim();
  if (!signerName) {
    signStatus.textContent = "Informe o nome completo.";
    return;
  }
  if (!hasSignature) {
    signStatus.textContent = "Registre a assinatura no campo acima.";
    return;
  }
  signButton.disabled = true;
  signStatus.textContent = "Enviando assinatura…";
  try {
    const response = await fetch(
      `/api/crm/public/contracts/${encodeURIComponent(token)}/sign`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          signerName,
          signatureData: canvas.toDataURL("image/png"),
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok || !payload?.data) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }
    render(payload.data);
    signStatus.textContent = "Contrato assinado com sucesso.";
    signStatus.className = "success";
  } catch (error) {
    signStatus.textContent = `Não foi possível assinar o contrato (${error instanceof Error ? error.message : "UNKNOWN_ERROR"}).`;
    signStatus.className = "error";
    signButton.disabled = false;
  }
}

canvas.addEventListener("pointerdown", begin);
canvas.addEventListener("pointermove", move);
canvas.addEventListener("pointerup", end);
canvas.addEventListener("pointercancel", end);
canvas.addEventListener("lostpointercapture", recoverPointer);
clearButton.addEventListener("click", clearSignature);
signButton.addEventListener("click", () => void signContract());

void loadContract();