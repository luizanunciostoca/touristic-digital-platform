import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { AffiliateIdentityApplicationService } from "./affiliate-identity-application-service.js";

function poolTestDouble(pool: unknown): Pool {
  return pool as Pool;
}

describe("Affiliate identity authorization fail-closed paths", () => {
  it("rejects an unauthenticated identity mutation before touching persistence", async () => {
    const pool = { getConnection: vi.fn() };
    const authorization = { authorize: vi.fn() };
    const service = new AffiliateIdentityApplicationService(
      poolTestDouble(pool),
      authorization,
    );

    await expect(
      service.createAffiliate({
        actor: {
          actorKind: "public",
          actorReference: "anonymous",
          correlationId: "corr:public:identity:0001",
        },
        affiliateId: "aff_public_0001",
        identityReference: "anonymous",
        pseudonymousReference: "pseudo_public_0001",
        accountType: "person",
        roleCategory: "other",
        occurredAt: "2026-08-23T22:40:00.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_AUTHENTICATION_REQUIRED");
    expect(authorization.authorize).not.toHaveBeenCalled();
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it("does not derive Affiliate administration authority from a Business role classification", async () => {
    const pool = { getConnection: vi.fn() };
    const authorization = {
      authorize: vi.fn(async () => ({
        allowed: false,
        decisionReference: "decision:business:no-admin",
      })),
    };
    const service = new AffiliateIdentityApplicationService(
      poolTestDouble(pool),
      authorization,
    );

    await expect(
      service.changeMembershipStatus({
        actor: {
          actorKind: "affiliate",
          actorReference: "business-user",
          correlationId: "corr:business:no-inherit:0001",
        },
        affiliateId: "aff_business_0001",
        programId: "program_morro",
        destinationId: "morro",
        status: "approved",
        occurredAt: "2026-08-23T22:41:00.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_AUTHORIZATION_DENIED");
    expect(authorization.authorize).toHaveBeenCalledWith(
      "affiliate.administer",
      expect.objectContaining({
        actorReference: "business-user",
        affiliateId: "aff_business_0001",
        programId: "program_morro",
      }),
    );
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it("rejects membership creation for an Affiliate that does not exist", async () => {
    const connection = {
      beginTransaction: vi.fn(async () => undefined),
      execute: vi.fn(async (sql: string) => {
        if (sql.includes("FROM affiliate_accounts")) return [[], []];
        throw new Error(`UNEXPECTED_SQL:${sql}`);
      }),
      commit: vi.fn(async () => undefined),
      rollback: vi.fn(async () => undefined),
      release: vi.fn(),
    };
    const pool = { getConnection: vi.fn(async () => connection) };
    const authorization = {
      authorize: vi.fn(async () => ({
        allowed: true,
        decisionReference: "decision:membership:create",
      })),
    };
    const service = new AffiliateIdentityApplicationService(
      poolTestDouble(pool),
      authorization,
    );

    await expect(
      service.createMembership({
        actor: {
          actorKind: "service",
          actorReference: "svc:affiliate-identity",
          correlationId: "corr:missing:affiliate:0001",
        },
        membershipId: "mem_missing_affiliate_0001",
        affiliateId: "aff_missing_0001",
        programId: "program_morro",
        destinationId: "morro",
        acceptedTermsVersion: "terms-v1",
        occurredAt: "2026-08-23T22:42:00.000Z",
      }),
    ).rejects.toThrow("AFFILIATE_NOT_FOUND");
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
