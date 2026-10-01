export const phase20FinancialReadProjectionVersion =
  "financial-read-projection.v1-candidate";

export const phase20FinancialReadProjectionPrefix =
  "/api/financial-projections/v1";

export const phase20FinancialReadContracts = Object.freeze({
  "IF-BIZ-012": Object.freeze({
    classification: "EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER",
    owner: "Financial",
    ownerApproved: false,
    versionedContractApproved: false,
  }),
  "IF-AFF-011": Object.freeze({
    classification: "VERSIONED_FINANCIAL_PROJECTION_REQUIRED",
    owner: "Financial projection + Affiliate commercial source",
    ownerApproved: false,
    versionedContractApproved: false,
  }),
  "IF-AFF-012": Object.freeze({
    classification: "VERSIONED_FINANCIAL_PROJECTION_REQUIRED",
    owner: "Financial",
    ownerApproved: false,
    versionedContractApproved: false,
  }),
  "IF-CTL-014": Object.freeze({
    classification: "EXISTING_FINANCIAL_MODEL_NEEDS_ADAPTER",
    owner: "Financial",
    ownerApproved: false,
    versionedContractApproved: false,
  }),
  "IF-CTL-015": Object.freeze({
    classification: "VERSIONED_FINANCIAL_PROJECTION_REQUIRED",
    owner: "Affiliate commercial entitlement + Financial monetary outcome",
    ownerApproved: false,
    versionedContractApproved: false,
  }),
} as const);

export const phase20FinancialAuthority = Object.freeze({
  paymentTruthOwner: "Financial",
  ledgerOwner: "Financial",
  payableOwner: "Financial",
  settlementOwner: "Financial",
  payoutOwner: "Financial",
  refundFinalStateOwner: "Financial",
  reconciliationOwner: "Financial",
  moneyMovementOwner: "Financial",
  verifiedMonetaryOutcomeOwner: "Financial",
  affiliateCommissionEntitlementOwner: "Affiliate",
  clientMayCalculateAuthoritativeTotals: false,
  projectionMayWriteLedger: false,
  projectionMayCreatePayout: false,
  projectionMayCreateSettlement: false,
  projectionMayMintRefundOutcome: false,
  projectionMayCallProvider: false,
});

type ContractId = keyof typeof phase20FinancialReadContracts;
type ProjectionState =
  | "requested"
  | "pending"
  | "verified"
  | "accepted"
  | "rejected"
  | "settled"
  | "reversed"
  | "refunded";

export interface FinancialReadActor {
  readonly subject: string;
  readonly authState: "active" | "stale" | "revoked";
  readonly capabilities: readonly string[];
  readonly tenantIds: readonly string[];
  readonly businessIds: readonly string[];
  readonly affiliateIds: readonly string[];
  readonly platformScope: boolean;
}

export interface BusinessFinancialReadRow {
  readonly id: string;
  readonly tenantId: string;
  readonly businessId: string;
  readonly paymentId: string;
  readonly orderReference: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly paymentStatus: string;
  readonly verifiedResultKind: string | null;
  readonly occurredAt: string;
}

export interface AffiliateStatementReadRow {
  readonly id: string;
  readonly affiliateId: string;
  readonly entitlementId: string;
  readonly conversionId: string;
  readonly commissionMinor: number;
  readonly currency: string;
  readonly entitlementStatus: string;
  readonly occurredAt: string;
  readonly financial: Readonly<{
    materializationRequestId: string | null;
    state: string;
    settlementId: string | null;
    settledMinor: number | null;
    currency: string;
  }> | null;
}

export interface AffiliatePayoutReadRow {
  readonly id: string;
  readonly affiliateId: string;
  readonly payableId: string;
  readonly settlementId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: string;
  readonly occurredAt: string;
  readonly providerTransferReference?: string | null;
}

export interface ControlRefundReadRow {
  readonly id: string;
  readonly tenantId: string;
  readonly refundRequestId: string | null;
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly requestStatus: string | null;
  readonly verifiedPaymentStatus: string;
  readonly occurredAt: string;
  readonly providerRefundReference?: string | null;
}

export interface ControlCommissionReadRow {
  readonly id: string;
  readonly tenantId: string;
  readonly affiliateId: string;
  readonly businessId: string | null;
  readonly entitlementId: string;
  readonly commissionMinor: number;
  readonly currency: string;
  readonly entitlementStatus: string;
  readonly financialState: string | null;
  readonly occurredAt: string;
}

export interface FinancialReadProjectionRepository {
  listBusinessPayments(
    input: Readonly<{
      tenantId: string;
      businessId: string;
    }>,
  ): Promise<readonly BusinessFinancialReadRow[]>;
  listAffiliateStatementRows(
    affiliateId: string,
  ): Promise<readonly AffiliateStatementReadRow[]>;
  listAffiliatePayoutRows(
    affiliateId: string,
  ): Promise<readonly AffiliatePayoutReadRow[]>;
  listRefundRows(tenantId: string): Promise<readonly ControlRefundReadRow[]>;
  listCommissionRows(
    tenantId: string,
  ): Promise<readonly ControlCommissionReadRow[]>;
}

export interface FinancialReadPageOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export class FinancialReadProjectionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "FinancialReadProjectionError";
  }
}

function deny(status: number, code: string): never {
  throw new FinancialReadProjectionError(status, code);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (Array.isArray(value)) {
    for (const entry of value) deepFreeze(entry);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return Object.freeze(value);
}

function identifier(value: unknown, code: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 160 ||
    !/^[A-Za-z0-9._:-]+$/u.test(value)
  ) {
    deny(400, code);
  }
  return value;
}

function actor(
  value: FinancialReadActor | null | undefined,
): FinancialReadActor {
  if (!value || typeof value.subject !== "string" || !value.subject) {
    deny(401, "AUTHENTICATION_REQUIRED");
  }
  if (value.authState === "revoked") deny(401, "SESSION_REVOKED");
  if (value.authState !== "active") deny(401, "SESSION_STALE");
  return value;
}

function capability(
  value: FinancialReadActor | null | undefined,
  expected: string,
): FinancialReadActor {
  const current = actor(value);
  if (!current.capabilities.includes(expected)) deny(403, "CAPABILITY_DENIED");
  return current;
}

function scoped(
  value: FinancialReadActor,
  key: "tenantIds" | "businessIds" | "affiliateIds",
  id: string,
  errorCode: string,
): void {
  if (!value[key].includes(id)) deny(403, errorCode);
}

function platformScoped(value: FinancialReadActor): void {
  if (value.platformScope !== true) deny(403, "PLATFORM_SCOPE_DENIED");
}

export function assertFinancialProjectionMoney(
  amountMinor: number,
  currency: string,
): Readonly<{ amountMinor: number; currency: string }> {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error("FINANCIAL_PROJECTION_INVALID_MINOR_UNITS");
  }
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new Error("FINANCIAL_PROJECTION_INVALID_CURRENCY");
  }
  return Object.freeze({ amountMinor, currency });
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("FINANCIAL_PROJECTION_INVALID_TIMESTAMP");
  }
  return parsed.toISOString();
}

function encodeCursor(
  row: Readonly<{ id: string; occurredAt: string }>,
): string {
  return Buffer.from(
    JSON.stringify({ at: timestamp(row.occurredAt), id: String(row.id) }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  value: string | undefined,
): Readonly<{ at: string; id: string }> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("id" in parsed) ||
      !("at" in parsed) ||
      typeof parsed.id !== "string" ||
      typeof parsed.at !== "string"
    ) {
      deny(400, "INVALID_CURSOR");
    }
    return Object.freeze({ at: timestamp(parsed.at), id: parsed.id });
  } catch (error) {
    if (error instanceof FinancialReadProjectionError) throw error;
    deny(400, "INVALID_CURSOR");
  }
}

function beforeCursor(
  row: Readonly<{ id: string; occurredAt: string }>,
  cursor: Readonly<{ at: string; id: string }> | null,
): boolean {
  if (!cursor) return true;
  const rowAt = timestamp(row.occurredAt);
  if (rowAt < cursor.at) return true;
  if (rowAt > cursor.at) return false;
  return row.id < cursor.id;
}

function page<T extends Readonly<{ id: string; occurredAt: string }>>(
  rows: readonly T[],
  options: FinancialReadPageOptions = {},
): Readonly<{
  items: readonly Readonly<T>[];
  nextCursor: string | null;
  ordering: "occurredAt_desc,id_desc";
}> {
  const limit = options.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    deny(400, "INVALID_LIMIT");
  }
  const cursor = decodeCursor(options.cursor);
  const ordered = rows
    .map(
      (row) =>
        deepFreeze({
          ...row,
          occurredAt: timestamp(row.occurredAt),
        }) as Readonly<T>,
    )
    .sort((left, right) => {
      const time = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
      return time || right.id.localeCompare(left.id);
    })
    .filter((row) => beforeCursor(row, cursor));
  const items = ordered.slice(0, limit);
  return deepFreeze({
    items,
    nextCursor:
      ordered.length > limit && items.length > 0
        ? encodeCursor(items[items.length - 1] as Readonly<T>)
        : null,
    ordering: "occurredAt_desc,id_desc" as const,
  });
}

function normalizePaymentState(value: string): ProjectionState {
  const states: Readonly<Record<string, ProjectionState>> = Object.freeze({
    pending: "pending",
    confirmed: "verified",
    failed: "rejected",
    cancelled: "rejected",
    expired: "rejected",
    refunded: "refunded",
  });
  const normalized = states[value];
  if (!normalized)
    throw new Error("FINANCIAL_PROJECTION_UNKNOWN_PAYMENT_STATE");
  return normalized;
}

export function normalizeFinancialProjectionRefundState(
  requestStatus: string | null,
  verifiedPaymentStatus: string,
): ProjectionState {
  if (verifiedPaymentStatus === "refunded") return "refunded";
  if (requestStatus === "provider_accepted") return "accepted";
  if (requestStatus === "claimed") return "requested";
  if (requestStatus === null) return "pending";
  throw new Error("FINANCIAL_PROJECTION_UNKNOWN_REFUND_STATE");
}

export function normalizeFinancialProjectionSettlementState(
  value: string,
): ProjectionState {
  const states: Readonly<Record<string, ProjectionState>> = Object.freeze({
    ready: "pending",
    transfer_pending: "pending",
    claimed: "requested",
    provider_accepted: "accepted",
    settled: "settled",
    failed: "rejected",
    reversed: "reversed",
  });
  const normalized = states[value];
  if (!normalized) {
    throw new Error("FINANCIAL_PROJECTION_UNKNOWN_SETTLEMENT_STATE");
  }
  return normalized;
}

function businessProjection(row: BusinessFinancialReadRow) {
  const money = assertFinancialProjectionMoney(row.amountMinor, row.currency);
  return deepFreeze({
    id: row.paymentId,
    occurredAt: row.occurredAt,
    orderReference: row.orderReference,
    amountMinor: money.amountMinor,
    currency: money.currency,
    financialState: normalizePaymentState(row.paymentStatus),
    verified: Boolean(row.verifiedResultKind),
    authority: "Financial" as const,
  });
}

function affiliateStatementProjection(row: AffiliateStatementReadRow) {
  const commercial = assertFinancialProjectionMoney(
    row.commissionMinor,
    row.currency,
  );
  const financial = row.financial
    ? {
        materializationRequestId: row.financial.materializationRequestId,
        state: normalizeFinancialProjectionSettlementState(row.financial.state),
        settlementId: row.financial.settlementId,
        settledMinor: row.financial.settledMinor,
        currency: row.financial.currency,
        authority: "Financial" as const,
      }
    : {
        materializationRequestId: null,
        state: "pending" as const,
        settlementId: null,
        settledMinor: null,
        currency: row.currency,
        authority: "Financial" as const,
      };
  if (financial.settledMinor !== null) {
    assertFinancialProjectionMoney(financial.settledMinor, financial.currency);
  } else {
    assertFinancialProjectionMoney(0, financial.currency);
  }
  return deepFreeze({
    id: row.entitlementId,
    occurredAt: row.occurredAt,
    conversionId: row.conversionId,
    commercialEntitlement: {
      commissionMinor: commercial.amountMinor,
      currency: commercial.currency,
      status: row.entitlementStatus,
      authority: "Affiliate" as const,
    },
    financial,
    statementSemantics:
      "commercial_entitlement_plus_financial_projection" as const,
  });
}

function affiliatePayoutProjection(row: AffiliatePayoutReadRow) {
  const money = assertFinancialProjectionMoney(row.amountMinor, row.currency);
  return deepFreeze({
    id: row.settlementId ?? row.payableId,
    occurredAt: row.occurredAt,
    payableId: row.payableId,
    settlementId: row.settlementId,
    amountMinor: money.amountMinor,
    currency: money.currency,
    financialState: normalizeFinancialProjectionSettlementState(row.status),
    providerReferenceExposed: false as const,
    authority: "Financial" as const,
  });
}

function controlRefundProjection(row: ControlRefundReadRow) {
  const money = assertFinancialProjectionMoney(row.amountMinor, row.currency);
  const requestState: ProjectionState =
    row.requestStatus === "provider_accepted"
      ? "accepted"
      : row.requestStatus === "claimed"
        ? "requested"
        : row.requestStatus === null
          ? "pending"
          : (() => {
              throw new Error("FINANCIAL_PROJECTION_UNKNOWN_REFUND_STATE");
            })();
  return deepFreeze({
    id: row.refundRequestId ?? `refund-read:${row.paymentId}`,
    occurredAt: row.occurredAt,
    paymentId: row.paymentId,
    amountMinor: money.amountMinor,
    currency: money.currency,
    requestState,
    financialState: normalizeFinancialProjectionRefundState(
      row.requestStatus,
      row.verifiedPaymentStatus,
    ),
    verifiedRefund: row.verifiedPaymentStatus === "refunded",
    authority: "Financial" as const,
  });
}

function controlCommissionProjection(row: ControlCommissionReadRow) {
  const money = assertFinancialProjectionMoney(
    row.commissionMinor,
    row.currency,
  );
  const financialState = row.financialState
    ? normalizeFinancialProjectionSettlementState(row.financialState)
    : "pending";
  return deepFreeze({
    id: row.entitlementId,
    occurredAt: row.occurredAt,
    affiliateId: row.affiliateId,
    businessId: row.businessId,
    commissionMinor: money.amountMinor,
    currency: money.currency,
    commercialEntitlementStatus: row.entitlementStatus,
    commercialAuthority: "Affiliate" as const,
    financialMaterializationState: financialState,
    financialAuthority: "Financial" as const,
    paidOrSettled: financialState === "settled",
  });
}

function envelope<T extends Readonly<{ id: string; occurredAt: string }>>(
  contractId: ContractId,
  scope: Readonly<Record<string, string>>,
  rows: readonly T[],
  options: FinancialReadPageOptions | undefined,
) {
  const contract = phase20FinancialReadContracts[contractId];
  return deepFreeze({
    contractId,
    projectionVersion: phase20FinancialReadProjectionVersion,
    owner: contract.owner,
    ownerApproved: contract.ownerApproved,
    versionedContractApproved: contract.versionedContractApproved,
    classification: contract.classification,
    scope,
    page: page(rows, options),
    mutationAllowed: false as const,
    providerCallsAllowed: false as const,
    authoritativeTotalsCalculatedByClient: false as const,
  });
}

export function createFinancialReadProjectionService(
  repository: FinancialReadProjectionRepository,
) {
  if (!repository || typeof repository !== "object") {
    throw new Error("FINANCIAL_READ_REPOSITORY_REQUIRED");
  }

  return Object.freeze({
    async readBusinessFinancial(
      auth: FinancialReadActor | null | undefined,
      tenantIdInput: string,
      businessIdInput: string,
      options?: FinancialReadPageOptions,
    ) {
      const tenantId = identifier(tenantIdInput, "INVALID_TENANT_ID");
      const businessId = identifier(businessIdInput, "INVALID_BUSINESS_ID");
      const current = capability(auth, "financial.read");
      scoped(current, "tenantIds", tenantId, "TENANT_SCOPE_DENIED");
      scoped(current, "businessIds", businessId, "BUSINESS_SCOPE_DENIED");
      const rows = await repository.listBusinessPayments({
        tenantId,
        businessId,
      });
      return envelope(
        "IF-BIZ-012",
        { tenantId, businessId },
        rows.map(businessProjection),
        options,
      );
    },

    async readAffiliateStatement(
      auth: FinancialReadActor | null | undefined,
      affiliateIdInput: string,
      options?: FinancialReadPageOptions,
    ) {
      const affiliateId = identifier(affiliateIdInput, "INVALID_AFFILIATE_ID");
      const current = capability(auth, "affiliate.read");
      scoped(current, "affiliateIds", affiliateId, "AFFILIATE_SCOPE_DENIED");
      const rows = await repository.listAffiliateStatementRows(affiliateId);
      return envelope(
        "IF-AFF-011",
        { affiliateId },
        rows.map(affiliateStatementProjection),
        options,
      );
    },

    async readAffiliatePayoutHistory(
      auth: FinancialReadActor | null | undefined,
      affiliateIdInput: string,
      options?: FinancialReadPageOptions,
    ) {
      const affiliateId = identifier(affiliateIdInput, "INVALID_AFFILIATE_ID");
      const current = capability(auth, "affiliate.read");
      scoped(current, "affiliateIds", affiliateId, "AFFILIATE_SCOPE_DENIED");
      const rows = await repository.listAffiliatePayoutRows(affiliateId);
      return envelope(
        "IF-AFF-012",
        { affiliateId },
        rows.map(affiliatePayoutProjection),
        options,
      );
    },

    async readControlRefunds(
      auth: FinancialReadActor | null | undefined,
      tenantIdInput: string,
      options?: FinancialReadPageOptions,
    ) {
      const tenantId = identifier(tenantIdInput, "INVALID_TENANT_ID");
      const current = capability(auth, "financial.read");
      platformScoped(current);
      scoped(current, "tenantIds", tenantId, "TENANT_SCOPE_DENIED");
      const rows = await repository.listRefundRows(tenantId);
      return envelope(
        "IF-CTL-014",
        { tenantId },
        rows.map(controlRefundProjection),
        options,
      );
    },

    async readControlCommissions(
      auth: FinancialReadActor | null | undefined,
      tenantIdInput: string,
      options?: FinancialReadPageOptions,
    ) {
      const tenantId = identifier(tenantIdInput, "INVALID_TENANT_ID");
      const current = capability(auth, "affiliate.read");
      capability(current, "financial.read");
      platformScoped(current);
      scoped(current, "tenantIds", tenantId, "TENANT_SCOPE_DENIED");
      const rows = await repository.listCommissionRows(tenantId);
      return envelope(
        "IF-CTL-015",
        { tenantId },
        rows.map(controlCommissionProjection),
        options,
      );
    },
  });
}

export type FinancialReadProjectionService = ReturnType<
  typeof createFinancialReadProjectionService
>;

export interface FinancialReadProjectionHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly actor: FinancialReadActor | null | undefined;
}

export interface FinancialReadProjectionHttpResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function httpResponse(
  status: number,
  body: Readonly<Record<string, unknown>>,
): FinancialReadProjectionHttpResponse {
  return Object.freeze({ status, body: deepFreeze(body) });
}

function pageOptions(url: URL): FinancialReadPageOptions {
  const cursor = url.searchParams.get("cursor");
  const limitValue = url.searchParams.get("limit");
  const options: { cursor?: string; limit?: number } = {};
  if (cursor) options.cursor = cursor;
  if (limitValue !== null) {
    const limit = Number(limitValue);
    if (!Number.isSafeInteger(limit)) deny(400, "INVALID_LIMIT");
    options.limit = limit;
  }
  return Object.freeze(options);
}

export async function handleFinancialReadProjectionRequest(
  request: FinancialReadProjectionHttpRequest,
  service: FinancialReadProjectionService,
): Promise<FinancialReadProjectionHttpResponse | null> {
  const url = new URL(request.url, "http://financial.internal");
  if (!url.pathname.startsWith(phase20FinancialReadProjectionPrefix + "/")) {
    return null;
  }
  if (request.method.toUpperCase() !== "GET") {
    return httpResponse(405, { error: "FINANCIAL_READ_ONLY" });
  }

  try {
    const options = pageOptions(url);
    let match =
      /^\/api\/financial-projections\/v1\/tenants\/([^/]+)\/businesses\/([^/]+)\/financial$/u.exec(
        url.pathname,
      );
    if (match) {
      const data = await service.readBusinessFinancial(
        request.actor,
        decodeURIComponent(match[1] ?? ""),
        decodeURIComponent(match[2] ?? ""),
        options,
      );
      return httpResponse(200, { data });
    }

    match =
      /^\/api\/financial-projections\/v1\/affiliates\/([^/]+)\/statement$/u.exec(
        url.pathname,
      );
    if (match) {
      const data = await service.readAffiliateStatement(
        request.actor,
        decodeURIComponent(match[1] ?? ""),
        options,
      );
      return httpResponse(200, { data });
    }

    match =
      /^\/api\/financial-projections\/v1\/affiliates\/([^/]+)\/payouts$/u.exec(
        url.pathname,
      );
    if (match) {
      const data = await service.readAffiliatePayoutHistory(
        request.actor,
        decodeURIComponent(match[1] ?? ""),
        options,
      );
      return httpResponse(200, { data });
    }

    match =
      /^\/api\/financial-projections\/v1\/control\/tenants\/([^/]+)\/refunds$/u.exec(
        url.pathname,
      );
    if (match) {
      const data = await service.readControlRefunds(
        request.actor,
        decodeURIComponent(match[1] ?? ""),
        options,
      );
      return httpResponse(200, { data });
    }

    match =
      /^\/api\/financial-projections\/v1\/control\/tenants\/([^/]+)\/commissions$/u.exec(
        url.pathname,
      );
    if (match) {
      const data = await service.readControlCommissions(
        request.actor,
        decodeURIComponent(match[1] ?? ""),
        options,
      );
      return httpResponse(200, { data });
    }

    return httpResponse(404, { error: "FINANCIAL_READ_ROUTE_NOT_FOUND" });
  } catch (error) {
    if (error instanceof FinancialReadProjectionError) {
      return httpResponse(error.status, { error: error.code });
    }
    return httpResponse(500, { error: "FINANCIAL_PROJECTION_ERROR" });
  }
}
