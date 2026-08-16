import type {
  DashboardAuthClient,
  DashboardAuthClientOptions,
} from "@touristic/auth-browser";

type AuthBrowserRuntime = Readonly<{
  createDashboardAuthClient: (
    options: DashboardAuthClientOptions,
  ) => DashboardAuthClient;
}>;

const defaultDashboardPath = "/dashboard/index-v3-improved.html";
const authBrowserRuntimePath = "/packages/auth-browser/dist/index.js";

export function safeBusinessDashboardReturnPath(search: string): string {
  const value =
    new URLSearchParams(search).get("return") ?? defaultDashboardPath;
  const allowedInternalPath =
    value.startsWith("/dashboard/") || value.startsWith("/apps/admin-crm/");
  if (!allowedInternalPath || value.startsWith("//") || value.includes("\\")) {
    return defaultDashboardPath;
  }
  return value;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Business login element: ${selector}`);
  return element;
}

function exposeBootstrapFailure(): void {
  const message = document.querySelector<HTMLElement>("#message");
  const submit = document.querySelector<HTMLButtonElement>("#submit");
  if (submit) submit.disabled = true;
  if (!message) return;
  message.textContent = "Acesso temporariamente indisponível.";
  message.hidden = false;
}

export async function mountBusinessLogin(): Promise<void> {
  const { createDashboardAuthClient } = (await import(
    authBrowserRuntimePath
  )) as AuthBrowserRuntime;
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

  submit.disabled = false;
}

if (typeof document !== "undefined") {
  void mountBusinessLogin().catch(() => exposeBootstrapFailure());
}
