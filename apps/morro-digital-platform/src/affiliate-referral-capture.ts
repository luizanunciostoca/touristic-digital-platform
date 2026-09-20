const referralParameter = "aff_ref";
const pendingStorageKey = "md_aff_ref_pending_v1";

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
    // The signed token remains untrusted transport evidence if storage is blocked.
  }
}

function forgetToken(): void {
  try {
    window.sessionStorage.removeItem(pendingStorageKey);
  } catch {
    // No persistent browser identity is required for cleanup.
  }
}

function consumeUrlToken(): string {
  const url = new URL(window.location.href);
  const token = url.searchParams.get(referralParameter)?.trim() ?? "";
  if (!token) return "";
  rememberToken(token);
  url.searchParams.delete(referralParameter);
  window.history.replaceState(window.history.state, "", url.toString());
  return token;
}

async function captureReferral(token: string): Promise<void> {
  if (!token || token.length > 4096) {
    forgetToken();
    return;
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
    if (response.ok || [400, 403, 409].includes(response.status)) {
      forgetToken();
    }
  } catch {
    // Keep the signed token only for this browser session and retry on navigation.
  }
}

const referralToken = consumeUrlToken() || pendingToken();
if (referralToken) {
  void captureReferral(referralToken);
}

export { captureReferral };
