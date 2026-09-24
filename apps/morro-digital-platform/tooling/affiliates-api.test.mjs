import { describe, expect, it } from "vitest";
import {
  issueAffiliateReferralToken,
  verifyAffiliateReferralToken,
} from "./affiliates-api.mjs";

const secret = "affiliate-test-secret-that-is-at-least-32-bytes-long";

describe("affiliate referral token", () => {
  it("round-trips signed server-owned referral authority", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 3600,
      },
      secret,
      1_800_000_000,
    );

    expect(
      verifyAffiliateReferralToken(issued.token, secret, 1_800_000_100),
    ).toMatchObject({
      v: 1,
      affiliateId: "aff_portal_0001",
      programId: "program_morro_0001",
      destinationId: "morro-de-sao-paulo",
      issuedAt: 1_800_000_000,
      expiresAt: 1_800_003_600,
    });
  });

  it("rejects tampering and expiration", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 600,
      },
      secret,
      1_800_000_000,
    );

    expect(
      verifyAffiliateReferralToken(
        `${issued.token}tampered`,
        secret,
        1_800_000_100,
      ),
    ).toBeNull();
    expect(
      verifyAffiliateReferralToken(issued.token, secret, 1_800_000_601),
    ).toBeNull();
  });

  it("rejects a token signed for a different secret", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 600,
      },
      secret,
      1_800_000_000,
    );
    expect(
      verifyAffiliateReferralToken(
        issued.token,
        "different-secret-that-is-also-at-least-32-bytes-long",
        1_800_000_100,
      ),
    ).toBeNull();
  });

  it("caps issued token lifetime at the canonical 30-day window", () => {
    const issued = issueAffiliateReferralToken(
      {
        affiliateId: "aff_portal_0001",
        programId: "program_morro_0001",
        destinationId: "morro-de-sao-paulo",
        ttlSeconds: 365 * 24 * 60 * 60,
      },
      secret,
      1_800_000_000,
    );

    expect(issued.payload.expiresAt - issued.payload.issuedAt).toBe(
      30 * 24 * 60 * 60,
    );
  });
});
