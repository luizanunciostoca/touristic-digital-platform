import { describe, expect, it, vi } from "vitest";
import type {
  AffiliateAuthorizationPort,
  AffiliateEligibilityPort,
  CommissionEntitlement,
  ConversionAssociation,
} from "@touristic/affiliates";
import { isAffiliateMembershipTransitionAllowed } from "./affiliate-identity-application-service.js";
import { AffiliateProtectedMutationService } from "./affiliate-protected-mutation-service.js";

const eligible = {
  identityVerified: true,
  contactVerified: true,
  acceptedTermsVersion: "terms-v1",
  membershipStatus: "approved" as const,
  fraudBlocked: false,
  financialOnboardingStatus: "not_started" as const,
};

const suspended = { ...eligible, membershipStatus: "suspended" as const };

function conversion(): ConversionAssociation {
  return {
    affiliateId: "aff_test" as never,
    programId: "program_test" as never,
  } as unknown as ConversionAssociation;
}

function entitlement(
  status: CommissionEntitlement["status"] = "pending",
  disputedFrom: CommissionEntitlement["disputedFrom"] = null,
): CommissionEntitlement {
  return {
    revision: 1,
    affiliateId: "aff_test" as never,
    programId: "program_test" as never,
    status,
    disputedFrom,
  } as unknown as CommissionEntitlement;
}

function service(input?: {
  allowed?: boolean;
  decisionReference?: string;
  snapshot?: typeof eligible | typeof suspended | null;
}) {
  const authorization: AffiliateAuthorizationPort = {
    authorize: vi.fn(async () => ({
      allowed: input?.allowed ?? true,
      decisionReference:
        input?.decisionReference === undefined
          ? "decision:test"
          : input.decisionReference,
    })),
  };
  const eligibility: AffiliateEligibilityPort = {
    resolveEligibility: vi.fn(async () => input?.snapshot ?? eligible),
  };
  const conversions = {
    findByOrderId: vi.fn(async () => null),
    save: vi.fn(async (value: ConversionAssociation) => value),
  };
  const entitlements = {
    findById: vi.fn(async () => null),
    findByConversionId: vi.fn(async () => null),
    saveRevision: vi.fn(async (value: CommissionEntitlement) => value),
  };
  return {
    authorization,
    eligibility,
    conversions,
    entitlements,
    subject: new AffiliateProtectedMutationService(
      authorization,
      eligibility,
      conversions,
      entitlements,
    ),
  };
}

const actor = {
  actorKind: "service" as const,
  actorReference: "svc:affiliate-test",
  correlationId: "corr:affiliate:test:0001",
};

describe("Affiliate membership lifecycle", () => {
  it("accepts only the policy lifecycle transitions and keeps closed terminal", () => {
    expect(isAffiliateMembershipTransitionAllowed("pending", "approved")).toBe(
      true,
    );
    expect(
      isAffiliateMembershipTransitionAllowed("approved", "suspended"),
    ).toBe(true);
    expect(
      isAffiliateMembershipTransitionAllowed("suspended", "approved"),
    ).toBe(true);
    expect(isAffiliateMembershipTransitionAllowed("pending", "closed")).toBe(
      true,
    );
    expect(isAffiliateMembershipTransitionAllowed("approved", "closed")).toBe(
      true,
    );
    expect(isAffiliateMembershipTransitionAllowed("suspended", "closed")).toBe(
      true,
    );
    expect(isAffiliateMembershipTransitionAllowed("pending", "suspended")).toBe(
      false,
    );
    expect(isAffiliateMembershipTransitionAllowed("approved", "pending")).toBe(
      false,
    );
    expect(isAffiliateMembershipTransitionAllowed("closed", "approved")).toBe(
      false,
    );
    expect(isAffiliateMembershipTransitionAllowed("approved", "approved")).toBe(
      false,
    );
  });
});

describe("Affiliate protected mutation boundary", () => {
  it("fails closed for unauthenticated/public internal calls", async () => {
    const fixture = service();
    await expect(
      fixture.subject.persistConversion(conversion(), {
        ...actor,
        actorKind: "public",
      }),
    ).rejects.toThrow("AFFILIATE_AUTHENTICATION_REQUIRED");
    expect(fixture.authorization.authorize).not.toHaveBeenCalled();
    expect(fixture.conversions.save).not.toHaveBeenCalled();
  });

  it("denies an unauthorized actor before eligibility or persistence", async () => {
    const fixture = service({ allowed: false });
    await expect(
      fixture.subject.persistConversion(conversion(), actor),
    ).rejects.toThrow("AFFILIATE_AUTHORIZATION_DENIED");
    expect(fixture.eligibility.resolveEligibility).not.toHaveBeenCalled();
    expect(fixture.conversions.save).not.toHaveBeenCalled();
  });

  it("fails closed when authorization context is incomplete", async () => {
    const fixture = service({ decisionReference: "" });
    await expect(
      fixture.subject.persistConversion(conversion(), actor),
    ).rejects.toThrow("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    expect(fixture.eligibility.resolveEligibility).not.toHaveBeenCalled();
  });

  it("retains authorized conversion evidence while membership is suspended", async () => {
    const fixture = service({ snapshot: suspended });
    await expect(
      fixture.subject.persistConversion(conversion(), actor),
    ).resolves.toBeDefined();
    expect(fixture.conversions.save).toHaveBeenCalledTimes(1);
  });

  it("persists only a disputed new entitlement while membership is suspended", async () => {
    const fixture = service({ snapshot: suspended });
    await expect(
      fixture.subject.persistNewEntitlement(
        entitlement("disputed", "pending"),
        actor,
      ),
    ).resolves.toBeDefined();
    expect(fixture.entitlements.saveRevision).toHaveBeenCalledTimes(1);

    await expect(
      fixture.subject.persistNewEntitlement(entitlement("pending"), actor),
    ).rejects.toThrow("AFFILIATE_SUSPENDED_ENTITLEMENT_MUST_BE_DISPUTED");
    expect(fixture.entitlements.saveRevision).toHaveBeenCalledTimes(1);
  });

  it("allows eligible conversion and new entitlement persistence", async () => {
    const fixture = service({ snapshot: eligible });
    await expect(
      fixture.subject.persistConversion(conversion(), actor),
    ).resolves.toBeDefined();
    await expect(
      fixture.subject.persistNewEntitlement(entitlement(), actor),
    ).resolves.toBeDefined();
    expect(fixture.conversions.save).toHaveBeenCalledTimes(1);
    expect(fixture.entitlements.saveRevision).toHaveBeenCalledTimes(1);
  });
});
