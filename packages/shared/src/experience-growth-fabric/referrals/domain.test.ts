import { describe, expect, it } from "vitest";

import {
  createReferralCampaign,
  createReferralPlacement,
  isSafeReferralReturnPath,
  issueReferralToken,
  resolveReferralToken,
  revokeReferralToken,
  rotateReferralToken,
} from "./domain.js";

const campaign = createReferralCampaign({
  campaignId: "cmp_00000001",
  affiliateId: "aff_00000001",
  programId: "apg_00000001",
  destinationId: "morro",
  status: "active",
  createdAt: "2026-09-01T12:00:00.000Z",
});

const placement = createReferralPlacement({
  placementId: "plc_00000001",
  affiliateId: "aff_00000001",
  campaignId: campaign.campaignId,
  programId: campaign.programId,
  destinationId: campaign.destinationId,
  channel: "permanent_qr",
  status: "active",
  riskPolicyVersion: "RISK-V1",
  createdAt: "2026-09-01T12:00:00.000Z",
});

const issued = issueReferralToken(placement, {
  tokenId: "tok_00000001",
  opaqueCode: "A7KF93Hk4WzYv8S2pL6mN0Qr",
  publicCodeHash: "a".repeat(64),
  issuedAt: "2026-09-01T12:00:00.000Z",
  kind: "q",
});

function resolutionInput(
  overrides: Partial<{
    publicCodeHash: string;
    returnPath: string;
    occurredAt: string;
    attemptCountInWindow: number;
    maximumAttemptsInWindow: number;
  }> = {},
) {
  return {
    publicCodeHash: "a".repeat(64),
    returnPath: "/explore",
    occurredAt: "2026-09-03T12:00:00.000Z",
    attemptCountInWindow: 0,
    maximumAttemptsInWindow: 20,
    ...overrides,
  };
}

describe("referral campaigns and placements", () => {
  it("issues an opaque public path without exposing affiliate id", () => {
    expect(issued.path).toBe("/q/A7KF93Hk4WzYv8S2pL6mN0Qr");
    expect(issued.path.includes("aff_00000001")).toBe(false);
    expect(issued.record.expiresAt).toBeUndefined();
  });

  it("allows permanent physical QR tokens without forced expiry", () => {
    const input = resolutionInput({
      returnPath: "/pt-BR/explore",
      occurredAt: "2026-12-01T12:00:00.000Z",
    });
    const result = resolveReferralToken(
      campaign,
      placement,
      issued.record,
      input,
    );

    expect(result.accepted).toBe(true);
  });

  it("fails closed for revoked and rotated tokens", () => {
    const occurredAt = "2026-09-02T12:00:00.000Z";
    const revoked = revokeReferralToken(issued.record, occurredAt);
    const rotated = rotateReferralToken(
      issued.record,
      "tok_00000002",
      occurredAt,
    );

    for (const token of [revoked, rotated]) {
      const result = resolveReferralToken(
        campaign,
        placement,
        token,
        resolutionInput(),
      );
      expect(result).toEqual({
        accepted: false,
        code: "TOKEN_NOT_ACTIVE",
      });
    }
  });

  it("rejects unsafe return URLs and rate-limit overflow", () => {
    expect(isSafeReferralReturnPath("https://evil.example")).toBe(false);
    expect(isSafeReferralReturnPath("//evil.example/path")).toBe(false);
    expect(isSafeReferralReturnPath("/explore")).toBe(true);

    const input = resolutionInput({ attemptCountInWindow: 20 });
    const result = resolveReferralToken(
      campaign,
      placement,
      issued.record,
      input,
    );

    expect(result).toEqual({ accepted: false, code: "RATE_LIMITED" });
  });

  it("rejects token tampering and placement mismatches", () => {
    const badHashInput = resolutionInput({
      publicCodeHash: "b".repeat(64),
    });
    const badHash = resolveReferralToken(
      campaign,
      placement,
      issued.record,
      badHashInput,
    );
    expect(badHash).toEqual({
      accepted: false,
      code: "TOKEN_HASH_MISMATCH",
    });

    const otherPlacement = {
      ...placement,
      placementId: "plc_00000002",
    };
    const mismatch = resolveReferralToken(
      campaign,
      otherPlacement,
      issued.record,
      resolutionInput(),
    );
    expect(mismatch).toEqual({
      accepted: false,
      code: "TOKEN_PLACEMENT_MISMATCH",
    });
  });
});
