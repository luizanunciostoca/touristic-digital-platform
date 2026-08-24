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

function resultFromRecord(
  record: AffiliateMaterializationRequestRecord,
): AffiliateFinancialMaterializationResultV1 | null {
  if (record.state === "accepted" && record.financialReference) {
    return {
      accepted: true,
      financialReference: record.financialReference,
      replayed: true,
    };
  }
  if (record.state === "rejected" && record.rejectionCode) {
    return {
      accepted: false,
      code: record.rejectionCode,
      retryable: record.retryable,
      replayed: true,
    };
  }
  return null;
}

function requestFromRecord(
  record: AffiliateMaterializationRequestRecord,
): AffiliateFinancialMaterializationRequestV1 {
  return {
    requestId:
      record.requestId as AffiliateFinancialMaterializationRequestV1["requestId"],
    entitlementId:
      record.entitlementId as AffiliateFinancialMaterializationRequestV1["entitlementId"],
    entitlementRevision: record.entitlementRevision,
    affiliateId:
      record.affiliateId as AffiliateFinancialMaterializationRequestV1["affiliateId"],
    conversionAssociationId:
      record.conversionId as AffiliateFinancialMaterializationRequestV1["conversionAssociationId"],
    policyVersion:
      record.policyVersion as AffiliateFinancialMaterializationRequestV1["policyVersion"],
    entitlementDigest: record.entitlementDigest,
    correlationId: record.correlationId,
  };
}

function requestMatchesRecord(
  request: AffiliateFinancialMaterializationRequestV1,
  record: AffiliateMaterializationRequestRecord,
): boolean {
  return (
    request.requestId === record.requestId &&
    request.entitlementId === record.entitlementId &&
    request.entitlementRevision === record.entitlementRevision &&
    request.affiliateId === record.affiliateId &&
    request.conversionAssociationId === record.conversionId &&
    request.policyVersion === record.policyVersion &&
    request.entitlementDigest === record.entitlementDigest &&
    request.correlationId === record.correlationId
  );
}

function sameMaterializationResult(
  left: AffiliateFinancialMaterializationResultV1,
  right: AffiliateFinancialMaterializationResultV1,
): boolean {
  if (left.accepted !== right.accepted) return false;
  if (left.accepted && right.accepted) {
    return left.financialReference === right.financialReference;
  }
  if (!left.accepted && !right.accepted) {
    return left.code === right.code && left.retryable === right.retryable;
  }
  return false;
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
    const existing = await this.repository.readMaterialization(
      request.requestId,
    );
    if (existing && !requestMatchesRecord(request, existing)) {
      throw new Error("AFFILIATE_MATERIALIZATION_CONFLICT");
    }
    const existingResult = existing ? resultFromRecord(existing) : null;
    if (existingResult) return existingResult;

    const now = this.clock.now();
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
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.createPending(pending);

    const localAfterClaim = await this.repository.readMaterialization(
      request.requestId,
    );
    if (!localAfterClaim || !requestMatchesRecord(request, localAfterClaim)) {
      throw new Error("AFFILIATE_MATERIALIZATION_CONFLICT");
    }
    const localResult = resultFromRecord(localAfterClaim);
    if (localResult) return localResult;

    const readback = await this.financial.readMaterialization(
      request.requestId,
    );
    if (readback) {
      await this.persistAndVerifyResult(request.requestId, readback);
      return readback;
    }

    const result = await this.financial.requestMaterialization(request);
    await this.persistAndVerifyResult(request.requestId, result);
    return result;
  }

  public async retryRetryable(
    now: string,
    limit = 50,
  ): Promise<ReadonlyArray<AffiliateFinancialMaterializationResultV1>> {
    const retryable = await this.repository.listRetryable(now, limit);
    const results: AffiliateFinancialMaterializationResultV1[] = [];
    for (const record of retryable) {
      if (!(await this.repository.claimRetry(record.requestId, now))) continue;
      results.push(
        await this.requestMaterialization(requestFromRecord(record)),
      );
    }
    return results;
  }

  public async readMaterialization(
    requestId: string,
  ): ReturnType<AffiliateFinancialMaterializationPort["readMaterialization"]> {
    const local = await this.repository.readMaterialization(requestId);
    const localResult = local ? resultFromRecord(local) : null;
    if (localResult) return localResult;
    return this.financial.readMaterialization(requestId);
  }

  private async persistAndVerifyResult(
    requestId: string,
    result: AffiliateFinancialMaterializationResultV1,
  ): Promise<void> {
    await this.repository.recordResult(
      result.accepted
        ? {
            requestId,
            accepted: true,
            financialReference: result.financialReference,
            retryable: false,
            occurredAt: this.clock.now(),
          }
        : {
            requestId,
            accepted: false,
            code: result.code,
            retryable: result.retryable,
            occurredAt: this.clock.now(),
          },
    );
    const durable = await this.repository.readMaterialization(requestId);
    const durableResult = durable ? resultFromRecord(durable) : null;
    if (!durableResult || !sameMaterializationResult(durableResult, result)) {
      throw new Error("AFFILIATE_MATERIALIZATION_RESULT_CONFLICT");
    }
  }
}

export type AffiliateEligibilitySnapshotReader = (
  affiliateId: string,
  programId: string,
) => Promise<AffiliateEligibilitySnapshot | null>;
