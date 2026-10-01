import assert from "node:assert/strict";
import test from "node:test";
import { deriveAffiliateQrCandidate } from "../affiliate-referral-qr-candidate.mjs";

function issuance(overrides = {}) {
  return {
    issuedBy: "AFFILIATES_SERVER",
    authority: "REFERRAL_REFERENCE_ONLY",
    serverSignatureVerified: true,
    url: "https://morro.example/affiliate-portal-capture.html?aff_ref=signed_lane_c_capability_0001&return=%2F",
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  };
}

test("QR candidate receives only the canonical server-issued referral URL", async () => {
  let rendererInput = null;
  const artifact = await deriveAffiliateQrCandidate({
    issuance: issuance(),
    artifactId: "affiliate-lane-c",
    renderQr: async (value) => {
      rendererInput = value;
      return `<svg xmlns="http://www.w3.org/2000/svg"><text>${value}</text></svg>`;
    },
  });

  assert.equal(rendererInput, artifact.referralUrl);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(artifact.authority, "REFERENCE_CAPABILITY_ONLY");
  assert.equal(artifact.sourceAuthority, "Affiliates");
  assert.equal(artifact.ownerApproved, false);
  assert.equal(artifact.versionedContractApproved, false);
  assert.equal(artifact.runtimeBindingEnabled, false);
  assert.equal(artifact.productionAuthorized, false);
  assert.equal(artifact.createsCommission, false);
  assert.equal(artifact.createsEntitlement, false);
  assert.equal(artifact.createsPayment, false);
  assert.equal(artifact.createsPayout, false);
  assert.equal(artifact.createsSettlement, false);
  assert.equal(artifact.createsRefundFinalState, false);
  assert.equal(artifact.externalProviderCalls, 0);
});

test("QR candidate rejects browser-minted or financially enriched referral data", async () => {
  const renderQr = async () => "<svg></svg>";

  await assert.rejects(
    () =>
      deriveAffiliateQrCandidate({
        issuance: issuance({ issuedBy: "BROWSER" }),
        renderQr,
      }),
    /AFFILIATE_REFERRAL_SERVER_ISSUER_REQUIRED/u,
  );

  await assert.rejects(
    () =>
      deriveAffiliateQrCandidate({
        issuance: issuance({ serverSignatureVerified: false }),
        renderQr,
      }),
    /AFFILIATE_REFERRAL_SIGNATURE_REQUIRED/u,
  );

  await assert.rejects(
    () =>
      deriveAffiliateQrCandidate({
        issuance: issuance({
          url: "https://morro.example/affiliate-portal-capture.html?aff_ref=signed_lane_c_capability_0001&commissionMinor=5000",
        }),
        renderQr,
      }),
    /AFFILIATE_QR_FINANCIAL_AUTHORITY_FORBIDDEN/u,
  );
});
