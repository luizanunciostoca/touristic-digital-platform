import type {
  AffiliateAuthorizationPort,
  AffiliateEligibilityPort,
  AffiliateFinancialEvidencePort,
  AffiliateFinancialMaterializationPort,
  AffiliateFinancialMaterializationRequestV1,
  AffiliateFinancialMaterializationResultV1,
  AffiliateOrderingEvidencePort,
  AffiliateEligibilitySnapshot,
} from "@touristic/affiliates";
import type {
  AffiliateMaterializationRequestRecord,
  MySqlAffiliateMaterializationRepository,
} from "./mysql-affiliate-persistence.js";

export interface OrderingReadPort {
  getOrderEvidence(
    orderId: string,
  ): Promise<
    Awaited<ReturnType<AffiliateOrderingEvidencePort["getOrderEvidence"]>>
  >;
}

export class OrderingAffiliateEvidenceAdapter implements AffiliateOrderingEvidencePort {
  public constructor(private readonly ordering: OrderingReadPort) {}

  public async getOrderEvidence(
    orderId: string,
  ): ReturnType<AffiliateOrderingEvidencePort["getOrderEvidence"]> {
    return this.ordering.getOrderEvidence(orderId);
  }
}

export interface FinancialVerifiedReadPort {
  getConversionEvidence(
    orderId: string,
  ): Promise<
    Awaited<ReturnType<AffiliateFinancialEvidencePort["getConversionEvidence"]>>
  >;
}

export class FinancialVerifiedEvidenceAdapter implements AffiliateFinancialEvidencePort {
  public constructor(private readonly financial: FinancialVerifiedReadPort) {}

  public async getConversionEvidence(
    orderId: string,
  ): ReturnType<AffiliateFinancialEvidencePort["getConversionEvidence"]> {
    return this.financial.getConversionEvidence(orderId);
  }
}

export class AuthorizationAdapter implements AffiliateAuthorizationPort {
  public constructor(
    private readonly authorizeFn: AffiliateAuthorizationPort["authorize"],
  ) {}

  public authorize(
    ...args: Parameters<AffiliateAuthorizationPort["authorize"]>
  ): ReturnType<AffiliateAuthorizationPort["authorize"]> {
    return this.authorizeFn(...args);
  }
}

export class EligibilityAdapter implements AffiliateEligibilityPort {
  public constructor(
    private readonly resolveFn: AffiliateEligibilityPort["resolveEligibility"],
  ) {}

  public resolveEligibility(
    ...args: Parameters<AffiliateEligibilityPort["resolveEligibility"]>
  ): ReturnType<AffiliateEligibilityPort["resolveEligibility"]> {
    return this.resolveFn(...args);
  }
}

export class DurableFinancialMaterializationAdapter implements AffiliateFinancialMaterializationPort {
  public constructor(
    private readonly repository: MySqlAffiliateMaterializationRepository,
    private readonly financial: AffiliateFinancialMaterializationPort,
    private readonly clock: { now(): string },
  ) {}

  public async requestMaterialization(
    request: AffiliateFinancialMaterializationRequestV1,
  ): Promise<AffiliateFinancialMaterializationResultV1> {
    const pending: AffiliateMaterializationRequestRecord = {
      requestId: request.requestId,
      entitlementId: request.entitlementId,
      entitlementRevision: request.entitlementRevision,
      affiliateId: request.affiliateId,
      conversionId: request.conversionAssociationId,
      policyVersion: request.policyVersion,
      entitlementDigest: request.entitlementDigest,
      correlationId: request.correlationId,
      state: "pending",
      financialReference: null,
      rejectionCode: null,
      retryable: false,
      attempts: 0,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    };
    await this.repository.createPending(pending);
    const readback = await this.financial.readMaterialization(
      request.requestId,
    );
    if (readback) return readback;
    const result = await this.financial.requestMaterialization(request);
    const resultInput = result.accepted
      ? {
          requestId: request.requestId,
          accepted: true,
          financialReference: result.financialReference,
          retryable: false,
          occurredAt: this.clock.now(),
        }
      : {
          requestId: request.requestId,
          accepted: false,
          code: result.code,
          retryable: result.retryable,
          occurredAt: this.clock.now(),
        };
    await this.repository.recordResult(resultInput);
    return result;
  }

  public readMaterialization(
    requestId: string,
  ): ReturnType<AffiliateFinancialMaterializationPort["readMaterialization"]> {
    return this.financial.readMaterialization(requestId);
  }
}

export type AffiliateEligibilitySnapshotReader = (
  affiliateId: string,
  programId: string,
) => Promise<AffiliateEligibilitySnapshot | null>;
