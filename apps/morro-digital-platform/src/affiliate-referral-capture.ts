const referralParameter = "aff_ref";
const returnParameter = "return";
const pendingStorageKey = "md_aff_ref_pending_v2";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function pendingToken(): string {
  try {
    return window.sessionStorage.getItem(pendingStorageKey) ?? "";
  } catch {
    return "";
  }
}
function rememberToken(token: string): void {
  try {
    window.sessionStorage.setItem(pendingStorageKey, token);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}
function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(pendingStorageKey);
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}

async function captureReferral(token: string): Promise<boolean> {
  if (!token || token.length > 4096) {
    forgetToken();
    return false;
  }
  try {
    const response = await window.fetch("/api/affiliates/v1/referral-capture", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      forgetToken();
      return true;
    }
    if ([400, 403, 409].includes(response.status)) forgetToken();
    return false;
  } catch {
    return false;
  }
}

const url = new URL(window.location.href);
const urlToken = url.searchParams.get(referralParameter)?.trim() ?? "";
const returnPath = safeReturnPath(url.searchParams.get(returnParameter));
if (urlToken) rememberToken(urlToken);
const token = urlToken || pendingToken();

if (token) {
  void captureReferral(token).then((accepted) => {
    if (accepted) window.location.replace(returnPath);
  });
}

export { captureReferral, safeReturnPath };
