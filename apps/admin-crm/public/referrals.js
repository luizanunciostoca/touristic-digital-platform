import { createAuthBrowserClient } from "@touristic/auth-browser";

const auth = createAuthBrowserClient({ loginPath: "/apps/dashboard/login.html" });
const sessionStatus = document.querySelector("#session-status");
const status = document.querySelector("#referrals-status");
const list = document.querySelector("#referrals-list");

async function start() {
  try {
    const session = await auth.requireSession({ returnTo: window.location.pathname });
    if (!session) return;
    sessionStatus.textContent = "Sessão autenticada. Consulta somente leitura.";
    const response = await auth.secureFetch("/api/crm/referrals");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data)) throw new Error("INVALID_RESPONSE");
    list.replaceChildren();
    status.textContent = payload.data.length ? `${payload.data.length} registro(s).` : "Nenhum registro encontrado.";
    for (const item of payload.data) {
      const article = document.createElement("article");
      const heading = document.createElement("h2");
      heading.textContent = `Registro #${String(item.id)}`;
      const state = document.createElement("p");
      state.textContent = `Status: ${String(item.status ?? "—")}`;
      article.append(heading, state);
      list.append(article);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    status.textContent = `Falha ao carregar registros (${message}).`;
  }
}

void start();
