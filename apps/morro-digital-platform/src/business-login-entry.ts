import { createDashboardAuthClient } from "@touristic/auth-browser";

const legacyDashboardPath = "/dashboard/index-v3-improved.html";
const defaultDashboardPath =
  "/apps/morro-digital-platform/public/business-dashboard.html";

export function safeBusinessDashboardReturnPath(search: string): string {
  const value =
    new URLSearchParams(search).get("return") ?? defaultDashboardPath;
  const allowedInternalPath =
    value.startsWith("/dashboard/") ||
    value.startsWith("/apps/admin-crm/") ||
    value.startsWith(defaultDashboardPath);
  if (!allowedInternalPath || value.startsWith("//") || value.includes("\\")) {
    return defaultDashboardPath;
  }
  if (value.startsWith(legacyDashboardPath)) {
    return `${defaultDashboardPath}${value.slice(legacyDashboardPath.length)}`;
  }
  return value;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Business login element: ${selector}`);
  return element;
}

export function mountBusinessLogin(): void {
  const form = requiredElement<HTMLFormElement>("#login-form");
  const email = requiredElement<HTMLInputElement>("#email");
  const password = requiredElement<HTMLInputElement>("#password");
  const submit = requiredElement<HTMLButtonElement>("#submit");
  const message = requiredElement<HTMLElement>("#message");

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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.hidden = true;
    message.textContent = "";
    submit.disabled = true;
    submit.textContent = "Verificando...";

    void auth
      .login({ email: email.value, password: password.value })
      .then(() => {
        window.location.replace(
          safeBusinessDashboardReturnPath(window.location.search),
        );
      })
      .catch((error: unknown) => {
        message.textContent =
          error instanceof Error && error.message
            ? error.message
            : "Falha de autenticação.";
        message.hidden = false;
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = "Entrar com segurança";
      });
  });
}

if (typeof document !== "undefined") mountBusinessLogin();
