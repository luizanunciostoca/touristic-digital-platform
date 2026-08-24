import {
  isActiveForAttribution,
  type AffiliateAuthorizationAction,
  type AffiliateAuthorizationContext,
  type AffiliateAuthorizationPort,
  type AffiliateEligibilityPort,
  type AffiliateEligibilitySnapshot,
  type CommissionEntitlement,
  type CommissionEntitlementRepositoryPort,
  type ConversionAssociation,
  type ConversionAssociationRepositoryPort,
} from "@touristic/affiliates";

export interface AffiliateProtectedMutationContext {
  readonly actorKind: AffiliateAuthorizationContext["actorKind"];
  readonly actorReference: string;
  readonly correlationId: string;
}

export class AffiliateProtectedMutationService {
  public constructor(
    private readonly authorization: AffiliateAuthorizationPort,
    private readonly eligibility: AffiliateEligibilityPort,
    private readonly conversions: ConversionAssociationRepositoryPort,
    private readonly entitlements: CommissionEntitlementRepositoryPort,
  ) {}

  public async persistConversion(
    conversion: ConversionAssociation,
    actor: AffiliateProtectedMutationContext,
  ): Promise<ConversionAssociation> {
    await this.assertAuthorized(
      "affiliate.associate_conversion",
      conversion.affiliateId,
      conversion.programId,
      actor,
    );
    const snapshot = await this.resolveEligibility(
      conversion.affiliateId,
      conversion.programId,
    );
    if (
      !isActiveForAttribution(snapshot) &&
      snapshot.membershipStatus !== "suspended"
    ) {
      throw new Error("AFFILIATE_NOT_ELIGIBLE");
    }
    return this.conversions.save(conversion);
  }

  public async persistNewEntitlement(
    entitlement: CommissionEntitlement,
    actor: AffiliateProtectedMutationContext,
  ): Promise<CommissionEntitlement> {
    if (entitlement.revision !== 1) {
      throw new Error("AFFILIATE_ENTITLEMENT_NOT_NEW");
    }
    await this.assertAuthorized(
      "affiliate.change_entitlement",
      entitlement.affiliateId,
      entitlement.programId,
      actor,
    );
    const snapshot = await this.resolveEligibility(
      entitlement.affiliateId,
      entitlement.programId,
    );
    if (isActiveForAttribution(snapshot)) {
      return this.entitlements.saveRevision(entitlement);
    }
    if (snapshot.membershipStatus !== "suspended") {
      throw new Error("AFFILIATE_NOT_ELIGIBLE");
    }
    if (
      entitlement.status !== "disputed" ||
      entitlement.disputedFrom !== "pending"
    ) {
      throw new Error("AFFILIATE_SUSPENDED_ENTITLEMENT_MUST_BE_DISPUTED");
    }
    return this.entitlements.saveRevision(entitlement);
  }

  private async assertAuthorized(
    action: AffiliateAuthorizationAction,
    affiliateId: ConversionAssociation["affiliateId"],
    programId: ConversionAssociation["programId"],
    actor: AffiliateProtectedMutationContext,
  ): Promise<void> {
    if (
      actor.actorKind === "public" ||
      actor.actorReference.trim().length === 0 ||
      actor.correlationId.trim().length === 0
    ) {
      throw new Error("AFFILIATE_AUTHENTICATION_REQUIRED");
    }
    const decision = await this.authorization.authorize(action, {
      actorKind: actor.actorKind,
      actorReference: actor.actorReference,
      affiliateId,
      programId,
      correlationId: actor.correlationId,
    });
    if (!decision.allowed) {
      throw new Error("AFFILIATE_AUTHORIZATION_DENIED");
    }
    if (!decision.decisionReference) {
      throw new Error("AFFILIATE_AUTHORIZATION_CONTEXT_INCOMPLETE");
    }
  }

  private async resolveEligibility(
    affiliateId: ConversionAssociation["affiliateId"],
    programId: ConversionAssociation["programId"],
  ): Promise<AffiliateEligibilitySnapshot> {
    const snapshot = await this.eligibility.resolveEligibility(
      affiliateId,
      programId,
    );
    if (!snapshot) {
      throw new Error("AFFILIATE_NOT_ELIGIBLE");
    }
    return snapshot;
  }
}
