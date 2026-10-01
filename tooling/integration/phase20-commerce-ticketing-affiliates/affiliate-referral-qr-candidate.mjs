import { createHash } from "node:crypto";

const forbiddenQueryKeys = new Set([
  "commission",
  "commissionMinor",
  "commissionRate",
  "entitlement",
  "ledger",
  "payment",
  "payout",
  "refund",
  "settlement",
  "wallet",
]);

function validateServerIssuedReferral(issuance, now = Date.now()) {
  if (!issuance || typeof issuance !== "object") throw new Error("AFFILIATE_REFERRAL_ISSUANCE_REQUIRED");
  if (issuance.issuedBy !== "AFFILIATES_SERVER") throw new Error("AFFILIATE_REFERRAL_SERVER_ISSUER_REQUIRED");
  if (issuance.authority !== "REFERRAL_REFERENCE_ONLY") throw new Error("AFFILIATE_REFERRAL_AUTHORITY_INVALID");
  if (issuance.serverSignatureVerified !== true) throw new Error("AFFILIATE_REFERRAL_SIGNATURE_REQUIRED");

  const expiresAt = Date.parse(String(issuance.expiresAt ?? ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new Error("AFFILIATE_REFERRAL_EXPIRED");

  let url;
  try {
    url = new URL(String(issuance.url ?? ""));
  } catch {
    throw new Error("AFFILIATE_REFERRAL_URL_INVALID");
  }

  if (url.protocol !== "https:") throw new Error("AFFILIATE_REFERRAL_HTTPS_REQUIRED");
  if (url.username || url.password) throw new Error("AFFILIATE_REFERRAL_CREDENTIALS_FORBIDDEN");
  if (!url.pathname.endsWith("/affiliate-portal-capture.html")) throw new Error("AFFILIATE_REFERRAL_CAPTURE_ROUTE_REQUIRED");

  const capability = url.searchParams.get("aff_ref");
  if (!capability || capability.length < 16 || capability.length > 2048) {
    throw new Error("AFFILIATE_REFERRAL_CAPABILITY_REQUIRED");
  }

  for (const key of url.searchParams.keys()) {
    if (forbiddenQueryKeys.has(key)) throw new Error("AFFILIATE_QR_FINANCIAL_AUTHORITY_FORBIDDEN");
  }

  return {
    canonicalUrl: url.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function deriveAffiliateQrCandidate({
  issuance,
  renderQr,
  artifactId = "affiliate-referral-candidate",
  nowMs = Date.now(),
}) {
  if (typeof renderQr !== "function") throw new Error("AFFILIATE_QR_RENDER_PORT_REQUIRED");
  if (!/^[A-Za-z0-9_-]{4,120}$/u.test(artifactId)) throw new Error("AFFILIATE_QR_ARTIFACT_ID_INVALID");

  const validated = validateServerIssuedReferral(issuance, nowMs);
  const svg = await renderQr(validated.canonicalUrl);
  if (typeof svg !== "string" || !svg.includes("<svg") || !svg.includes("</svg>")) {
    throw new Error("AFFILIATE_QR_RENDER_FAILED");
  }

  return Object.freeze({
    artifactId,
    mediaType: "image/svg+xml",
    filename: artifactId + ".svg",
    sha256: createHash("sha256").update(svg).digest("hex"),
    svg,
    referralUrl: validated.canonicalUrl,
    expiresAt: validated.expiresAt,
    authority: "REFERENCE_CAPABILITY_ONLY",
    sourceAuthority: "Affiliates",
    ownerApproved: false,
    versionedContractApproved: false,
    runtimeBindingEnabled: false,
    productionAuthorized: false,
    createsCommission: false,
    createsEntitlement: false,
    createsPayment: false,
    createsPayout: false,
    createsSettlement: false,
    createsRefundFinalState: false,
    externalProviderCalls: 0,
  });
}

export { validateServerIssuedReferral };
