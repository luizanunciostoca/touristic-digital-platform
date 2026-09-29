export type ReferralCampaignStatus = "draft" | "active" | "paused" | "ended";

export type ReferralPlacementStatus = "active" | "revoked" | "inactive";

export type ReferralTokenStatus = "active" | "revoked" | "rotated";

export type ReferralChannel =
  | "digital_link"
  | "permanent_qr"
  | "reception_qr"
  | "room_qr"
  | "transfer_qr"
  | "instagram"
  | "whatsapp"
  | "event_qr"
  | "business_qr";

export interface ReferralCampaign {
  readonly campaignId: string;
  readonly affiliateId: string;
  readonly programId: string;
  readonly destinationId: string;
  readonly status: ReferralCampaignStatus;
  readonly createdAt: string;
}

export interface ReferralPlacement {
  readonly placementId: string;
  readonly affiliateId: string;
  readonly campaignId: string;
  readonly programId: string;
  readonly destinationId: string;
  readonly channel: ReferralChannel;
  readonly status: ReferralPlacementStatus;
  readonly validFrom?: string;
  readonly validUntil?: string;
  readonly riskPolicyVersion: string;
  readonly createdAt: string;
  readonly revokedAt?: string;
}

export interface ReferralTokenRecord {
  readonly tokenId: string;
  readonly placementId: string;
  readonly publicCodeHash: string;
  readonly status: ReferralTokenStatus;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly rotatedToTokenId?: string;
}

export interface IssuedReferralToken {
  readonly record: ReferralTokenRecord;
  readonly opaqueCode: string;
  readonly path: string;
}

export interface ReferralResolutionInput {
  readonly publicCodeHash: string;
  readonly returnPath: string;
  readonly occurredAt: string;
  readonly attemptCountInWindow: number;
  readonly maximumAttemptsInWindow: number;
}

export type ReferralResolution =
  | Readonly<{
      accepted: true;
      placementId: string;
      campaignId: string;
      destinationId: string;
      redirectPath: string;
      event: "AffiliatePlacementResolved";
    }>
  | Readonly<{
      accepted: false;
      code: string;
    }>;

const OPAQUE_CODE = /^[A-Za-z0-9_-]{24,160}$/;
const SHA_256 = /^[a-f0-9]{64}$/;

function parseTime(value: string): number | null {
  const timestamp = Date.parse(value);
  if (!value.endsWith("Z") || !Number.isFinite(timestamp)) return null;
  return timestamp;
}

export function isSafeReferralReturnPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.length > 512) return false;

  try {
    const parsed = new URL(value, "https://morro.invalid");
    return parsed.origin === "https://morro.invalid";
  } catch {
    return false;
  }
}

export function createReferralCampaign(
  campaign: ReferralCampaign,
): ReferralCampaign {
  if (!campaign.campaignId || !campaign.affiliateId) {
    throw new Error("REFERRAL_CAMPAIGN_IDENTITY_INVALID");
  }
  if (!campaign.programId || !campaign.destinationId) {
    throw new Error("REFERRAL_CAMPAIGN_SCOPE_INVALID");
  }
  if (parseTime(campaign.createdAt) === null) {
    throw new Error("REFERRAL_CAMPAIGN_TIME_INVALID");
  }
  return Object.freeze({ ...campaign });
}

export function createReferralPlacement(
  placement: ReferralPlacement,
): ReferralPlacement {
  if (!placement.placementId || !placement.campaignId) {
    throw new Error("REFERRAL_PLACEMENT_IDENTITY_INVALID");
  }
  if (!placement.affiliateId || !placement.programId) {
    throw new Error("REFERRAL_PLACEMENT_OWNER_INVALID");
  }
  if (!placement.destinationId || !placement.riskPolicyVersion) {
    throw new Error("REFERRAL_PLACEMENT_SCOPE_INVALID");
  }

  const createdAt = parseTime(placement.createdAt);
  const validFrom = placement.validFrom
    ? parseTime(placement.validFrom)
    : createdAt;
  const validUntil = placement.validUntil
    ? parseTime(placement.validUntil)
    : null;

  if (createdAt === null || validFrom === null) {
    throw new Error("REFERRAL_PLACEMENT_TIME_INVALID");
  }
  if (validUntil !== null && validUntil <= validFrom) {
    throw new Error("REFERRAL_PLACEMENT_WINDOW_INVALID");
  }

  return Object.freeze({ ...placement });
}

export function issueReferralToken(
  placement: ReferralPlacement,
  input: Readonly<{
    tokenId: string;
    opaqueCode: string;
    publicCodeHash: string;
    issuedAt: string;
    expiresAt?: string;
    kind: "q" | "r";
  }>,
): IssuedReferralToken {
  if (placement.status !== "active") {
    throw new Error("REFERRAL_PLACEMENT_NOT_ACTIVE");
  }
  if (!OPAQUE_CODE.test(input.opaqueCode)) {
    throw new Error("REFERRAL_OPAQUE_CODE_INVALID");
  }
  if (!SHA_256.test(input.publicCodeHash)) {
    throw new Error("REFERRAL_PUBLIC_CODE_HASH_INVALID");
  }

  const issuedAt = parseTime(input.issuedAt);
  const expiresAt = input.expiresAt ? parseTime(input.expiresAt) : null;
  if (issuedAt === null) throw new Error("REFERRAL_TOKEN_TIME_INVALID");
  if (expiresAt !== null && expiresAt <= issuedAt) {
    throw new Error("REFERRAL_TOKEN_EXPIRY_INVALID");
  }

  const record: ReferralTokenRecord = Object.freeze({
    tokenId: input.tokenId,
    placementId: placement.placementId,
    publicCodeHash: input.publicCodeHash,
    status: "active",
    issuedAt: input.issuedAt,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  });

  return Object.freeze({
    record,
    opaqueCode: input.opaqueCode,
    path: `/${input.kind}/${input.opaqueCode}`,
  });
}

export function revokeReferralToken(
  token: ReferralTokenRecord,
  occurredAt: string,
): ReferralTokenRecord {
  if (parseTime(occurredAt) === null) {
    throw new Error("REFERRAL_TOKEN_REVOKE_TIME_INVALID");
  }
  if (token.status !== "active") return token;

  return Object.freeze({
    ...token,
    status: "revoked",
    revokedAt: occurredAt,
  });
}

export function rotateReferralToken(
  token: ReferralTokenRecord,
  replacementTokenId: string,
  occurredAt: string,
): ReferralTokenRecord {
  if (parseTime(occurredAt) === null) {
    throw new Error("REFERRAL_TOKEN_ROTATE_TIME_INVALID");
  }
  if (token.status !== "active") {
    throw new Error("REFERRAL_TOKEN_NOT_ACTIVE");
  }
  if (!replacementTokenId || replacementTokenId === token.tokenId) {
    throw new Error("REFERRAL_TOKEN_REPLACEMENT_INVALID");
  }

  return Object.freeze({
    ...token,
    status: "rotated",
    revokedAt: occurredAt,
    rotatedToTokenId: replacementTokenId,
  });
}

export function resolveReferralToken(
  campaign: ReferralCampaign,
  placement: ReferralPlacement,
  token: ReferralTokenRecord,
  input: ReferralResolutionInput,
): ReferralResolution {
  if (campaign.status !== "active") {
    return { accepted: false, code: "CAMPAIGN_NOT_ACTIVE" };
  }
  if (placement.status !== "active") {
    return { accepted: false, code: "PLACEMENT_NOT_ACTIVE" };
  }
  if (token.status !== "active") {
    return { accepted: false, code: "TOKEN_NOT_ACTIVE" };
  }
  if (token.placementId !== placement.placementId) {
    return { accepted: false, code: "TOKEN_PLACEMENT_MISMATCH" };
  }
  if (campaign.campaignId !== placement.campaignId) {
    return { accepted: false, code: "PLACEMENT_CAMPAIGN_MISMATCH" };
  }
  if (token.publicCodeHash !== input.publicCodeHash) {
    return { accepted: false, code: "TOKEN_HASH_MISMATCH" };
  }
  if (!isSafeReferralReturnPath(input.returnPath)) {
    return { accepted: false, code: "RETURN_PATH_REJECTED" };
  }

  const occurredAt = parseTime(input.occurredAt);
  if (occurredAt === null) {
    return { accepted: false, code: "RESOLUTION_TIME_INVALID" };
  }
  if (token.expiresAt) {
    const expiresAt = parseTime(token.expiresAt);
    if (expiresAt === null || occurredAt >= expiresAt) {
      return { accepted: false, code: "TOKEN_EXPIRED" };
    }
  }
  if (placement.validFrom) {
    const validFrom = parseTime(placement.validFrom);
    if (validFrom === null || occurredAt < validFrom) {
      return { accepted: false, code: "PLACEMENT_NOT_YET_VALID" };
    }
  }
  if (placement.validUntil) {
    const validUntil = parseTime(placement.validUntil);
    if (validUntil === null || occurredAt >= validUntil) {
      return { accepted: false, code: "PLACEMENT_EXPIRED" };
    }
  }

  const limit = input.maximumAttemptsInWindow;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    return { accepted: false, code: "RATE_LIMIT_POLICY_INVALID" };
  }
  if (input.attemptCountInWindow >= limit) {
    return { accepted: false, code: "RATE_LIMITED" };
  }

  return {
    accepted: true,
    placementId: placement.placementId,
    campaignId: campaign.campaignId,
    destinationId: placement.destinationId,
    redirectPath: input.returnPath,
    event: "AffiliatePlacementResolved",
  };
}
