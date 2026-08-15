import {
  createMoney,
  normalizeFinancialTimestamp,
  normalizePaymentId,
  normalizeReconciliationRunId,
  type Money,
  type PaymentId,
  type ReconciliationRunId,
} from "./index.js";

const ID_BODY = /^[A-Za-z0-9_-]+$/u;
const BENEFICIARY_REFERENCE = /^[A-Za-z0-9_-]{3,80}$/u;
const PROVIDER_REFERENCE = /^[A-Za-z0-9._:-]{3,160}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

const allocationIdBrand: unique symbol = Symbol("FinancialAllocationId");
const payableIdBrand: unique symbol = Symbol("FinancialPayableId");
const settlementIdBrand: unique symbol = Symbol("FinancialSettlementId");
const settlementIdempotencyKeyBrand: unique symbol = Symbol(
  "FinancialSettlementIdempotencyKey",
);

export type FinancialAllocationId = string & {
  readonly [allocationIdBrand]: true;
};
export type FinancialPayableId = string & {
  readonly [payableIdBrand]: true;
};
export type FinancialSettlementId = string & {
  readonly [settlementIdBrand]: true;
};
export type FinancialSettlementIdempotencyKey = string & {
  readonly [settlementIdempotencyKeyBrand]: true;
};

export interface FinancialBeneficiaryAllocation {
  readonly beneficiaryReference: string;
  readonly amount: Money;
}

export interface FinancialAllocationPlan {
  readonly platformAmount: Money;
  readonly beneficiaries: readonly FinancialBeneficiaryAllocation[];
}

export type FinancialAllocationStatus = "claimed" | "active" | "reversed";
export type FinancialPayableStatus =
  | "blocked"
  | "ready"
  | "transfer_pending"
  | "settled"
  | "failed"
  | "reversed";
export type FinancialSettlementStatus =
  | "claimed"
  | "provider_accepted"
  | "settled"
  | "failed"
  | "reversed";
export type FinancialSettlementProviderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "reversed";

export interface FinancialAllocation {
  readonly id: FinancialAllocationId;
  readonly paymentId: PaymentId;
  readonly reconciliationRunId: ReconciliationRunId;
  readonly grossAmount: Money;
  readonly platformAmount: Money;
  readonly allocationHash: string;
  readonly status: FinancialAllocationStatus;
  readonly ledgerExternalKey: string | null;
  readonly reversalLedgerExternalKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly reversedAt: string | null;
}

export interface FinancialPayable {
  readonly id: FinancialPayableId;
  readonly allocationId: FinancialAllocationId;
  readonly paymentId: PaymentId;
  readonly beneficiaryReference: string;
  readonly amount: Money;
  readonly status: FinancialPayableStatus;
  readonly settlementId: FinancialSettlementId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FinancialSettlement {
  readonly id: FinancialSettlementId;
  readonly payableId: FinancialPayableId;
  readonly paymentId: PaymentId;
  readonly beneficiaryReference: string;
  readonly amount: Money;
  readonly idempotencyKey: FinancialSettlementIdempotencyKey;
  readonly status: FinancialSettlementStatus;
  readonly providerTransferReference: string | null;
  readonly ledgerExternalKey: string | null;
  readonly reversalLedgerExternalKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly settledAt: string | null;
  readonly reversedAt: string | null;
}

export interface FinancialSettlementProviderCommand {
  readonly settlementId: FinancialSettlementId;
  readonly payableId: FinancialPayableId;
  readonly paymentId: PaymentId;
  readonly beneficiaryReference: string;
  readonly amount: Money;
  readonly idempotencyKey: FinancialSettlementIdempotencyKey;
}

export interface FinancialSettlementProviderReceipt {
  readonly accepted: true;
  readonly providerTransferReference: string;
}

export interface FinancialSettlementProviderSnapshot {
  readonly settlementId: FinancialSettlementId;
  readonly providerTransferReference: string;
  readonly status: FinancialSettlementProviderStatus;
  readonly amount: Money;
  readonly observedAt: string;
}

export interface FinancialSettlementProviderPort {
  requestTransfer(
    command: FinancialSettlementProviderCommand,
  ): Promise<FinancialSettlementProviderReceipt>;
  readTransfer(input: {
    readonly settlementId: FinancialSettlementId;
    readonly providerTransferReference: string;
  }): Promise<FinancialSettlementProviderSnapshot | null>;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function brandedId<T extends string>(
  value: unknown,
  prefix: string,
): T | null {
  const normalized = text(value, 120);
  return normalized.startsWith(prefix) &&
    normalized.length >= prefix.length + 8 &&
    ID_BODY.test(normalized)
    ? (normalized as T)
    : null;
}

function money(value: unknown): Money | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as {
    readonly minorUnits?: unknown;
    readonly currency?: unknown;
  };
  return createMoney(candidate.minorUnits, candidate.currency);
}

function time(value: unknown): string {
  const normalized = normalizeFinancialTimestamp(value);
  return normalized ? new Date(normalized).toISOString() : "";
}

export function normalizeFinancialAllocationId(
  value: unknown,
): FinancialAllocationId | null {
  return brandedId<FinancialAllocationId>(value, "alc_");
}

export function normalizeFinancialPayableId(
  value: unknown,
): FinancialPayableId | null {
  return brandedId<FinancialPayableId>(value, "pbl_");
}

export function normalizeFinancialSettlementId(
  value: unknown,
): FinancialSettlementId | null {
  return brandedId<FinancialSettlementId>(value, "stl_");
}

export function normalizeFinancialBeneficiaryReference(value: unknown): string {
  const normalized = text(value, 80);
  return BENEFICIARY_REFERENCE.test(normalized) ? normalized : "";
}

export function createFinancialSettlementIdempotencyKey(
  payableIdInput: unknown,
): FinancialSettlementIdempotencyKey | null {
  const payableId = normalizeFinancialPayableId(payableIdInput);
  return payableId
    ? (`settlement:v1:${payableId}` as FinancialSettlementIdempotencyKey)
    : null;
}

export function normalizeFinancialAllocationPlan(
  input: Readonly<{
    platformAmount?: unknown;
    beneficiaries?: unknown;
  }>,
): FinancialAllocationPlan | null {
  const platformAmount = money(input.platformAmount);
  if (!platformAmount || !Array.isArray(input.beneficiaries)) return null;
  if (input.beneficiaries.length === 0 || input.beneficiaries.length > 100) {
    return null;
  }
  const seen = new Set<string>();
  const beneficiaries: FinancialBeneficiaryAllocation[] = [];
  for (const raw of input.beneficiaries) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const candidate = raw as {
      readonly beneficiaryReference?: unknown;
      readonly amount?: unknown;
    };
    const beneficiaryReference = normalizeFinancialBeneficiaryReference(
      candidate.beneficiaryReference,
    );
    const amount = money(candidate.amount);
    if (
      !beneficiaryReference ||
      seen.has(beneficiaryReference) ||
      !amount ||
      amount.minorUnits <= 0 ||
      amount.currency !== platformAmount.currency
    ) {
      return null;
    }
    seen.add(beneficiaryReference);
    beneficiaries.push(Object.freeze({ beneficiaryReference, amount }));
  }
  beneficiaries.sort((a, b) =>
    a.beneficiaryReference.localeCompare(b.beneficiaryReference),
  );
  return Object.freeze({
    platformAmount,
    beneficiaries: Object.freeze(beneficiaries),
  });
}

export function allocationPlanTotal(plan: FinancialAllocationPlan): Money {
  let total = plan.platformAmount.minorUnits;
  for (const entry of plan.beneficiaries) {
    total += entry.amount.minorUnits;
    if (!Number.isSafeInteger(total)) {
      throw new Error("FINANCIAL_AMOUNT_OVERFLOW");
    }
  }
  const result = createMoney(total, plan.platformAmount.currency);
  if (!result) throw new Error("FINANCIAL_ALLOCATION_TOTAL_INVALID");
  return result;
}

export function normalizeFinancialAllocation(
  input: Readonly<{
    id?: unknown;
    paymentId?: unknown;
    reconciliationRunId?: unknown;
    grossAmount?: unknown;
    platformAmount?: unknown;
    allocationHash?: unknown;
    status?: unknown;
    ledgerExternalKey?: unknown;
    reversalLedgerExternalKey?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    reversedAt?: unknown;
  }>,
): FinancialAllocation | null {
  const id = normalizeFinancialAllocationId(input.id);
  const paymentId = normalizePaymentId(input.paymentId);
  const reconciliationRunId = normalizeReconciliationRunId(
    input.reconciliationRunId,
  );
  const grossAmount = money(input.grossAmount);
  const platformAmount = money(input.platformAmount);
  const allocationHash = text(input.allocationHash, 64);
  const status =
    input.status === "claimed" ||
    input.status === "active" ||
    input.status === "reversed"
      ? input.status
      : null;
  const ledgerExternalKey =
    input.ledgerExternalKey === null ? null : text(input.ledgerExternalKey, 160);
  const reversalLedgerExternalKey =
    input.reversalLedgerExternalKey === null
      ? null
      : text(input.reversalLedgerExternalKey, 160);
  const createdAt = time(input.createdAt);
  const updatedAt = time(input.updatedAt);
  const reversedAt = input.reversedAt === null ? null : time(input.reversedAt);
  if (
    !id ||
    !paymentId ||
    !reconciliationRunId ||
    !grossAmount ||
    grossAmount.minorUnits <= 0 ||
    !platformAmount ||
    platformAmount.currency !== grossAmount.currency ||
    platformAmount.minorUnits > grossAmount.minorUnits ||
    !SHA256.test(allocationHash) ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (status === "claimed" && ledgerExternalKey !== null) ||
    (status === "active" && !ledgerExternalKey) ||
    (status === "reversed" &&
      (!ledgerExternalKey || !reversalLedgerExternalKey || !reversedAt))
  ) {
    return null;
  }
  return Object.freeze({
    id,
    paymentId,
    reconciliationRunId,
    grossAmount,
    platformAmount,
    allocationHash,
    status,
    ledgerExternalKey,
    reversalLedgerExternalKey,
    createdAt,
    updatedAt,
    reversedAt,
  });
}

export function normalizeFinancialPayable(
  input: Readonly<{
    id?: unknown;
    allocationId?: unknown;
    paymentId?: unknown;
    beneficiaryReference?: unknown;
    amount?: unknown;
    status?: unknown;
    settlementId?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  }>,
): FinancialPayable | null {
  const id = normalizeFinancialPayableId(input.id);
  const allocationId = normalizeFinancialAllocationId(input.allocationId);
  const paymentId = normalizePaymentId(input.paymentId);
  const beneficiaryReference = normalizeFinancialBeneficiaryReference(
    input.beneficiaryReference,
  );
  const amount = money(input.amount);
  const statuses: readonly FinancialPayableStatus[] = [
    "blocked",
    "ready",
    "transfer_pending",
    "settled",
    "failed",
    "reversed",
  ];
  const status =
    typeof input.status === "string" &&
    statuses.includes(input.status as FinancialPayableStatus)
      ? (input.status as FinancialPayableStatus)
      : null;
  const settlementId =
    input.settlementId === null
      ? null
      : normalizeFinancialSettlementId(input.settlementId);
  const createdAt = time(input.createdAt);
  const updatedAt = time(input.updatedAt);
  if (
    !id ||
    !allocationId ||
    !paymentId ||
    !beneficiaryReference ||
    !amount ||
    amount.minorUnits <= 0 ||
    !status ||
    !createdAt ||
    !updatedAt ||
    ((status === "blocked" || status === "ready") && settlementId !== null) ||
    (["transfer_pending", "settled", "failed", "reversed"] as const).includes(
      status as "transfer_pending" | "settled" | "failed" | "reversed",
    ) && settlementId === null
  ) {
    return null;
  }
  return Object.freeze({
    id,
    allocationId,
    paymentId,
    beneficiaryReference,
    amount,
    status,
    settlementId,
    createdAt,
    updatedAt,
  });
}

export function normalizeFinancialSettlement(
  input: Readonly<{
    id?: unknown;
    payableId?: unknown;
    paymentId?: unknown;
    beneficiaryReference?: unknown;
    amount?: unknown;
    idempotencyKey?: unknown;
    status?: unknown;
    providerTransferReference?: unknown;
    ledgerExternalKey?: unknown;
    reversalLedgerExternalKey?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    settledAt?: unknown;
    reversedAt?: unknown;
  }>,
): FinancialSettlement | null {
  const id = normalizeFinancialSettlementId(input.id);
  const payableId = normalizeFinancialPayableId(input.payableId);
  const paymentId = normalizePaymentId(input.paymentId);
  const beneficiaryReference = normalizeFinancialBeneficiaryReference(
    input.beneficiaryReference,
  );
  const amount = money(input.amount);
  const expectedKey = createFinancialSettlementIdempotencyKey(payableId);
  const idempotencyKey = text(input.idempotencyKey, 160);
  const statuses: readonly FinancialSettlementStatus[] = [
    "claimed",
    "provider_accepted",
    "settled",
    "failed",
    "reversed",
  ];
  const status =
    typeof input.status === "string" &&
    statuses.includes(input.status as FinancialSettlementStatus)
      ? (input.status as FinancialSettlementStatus)
      : null;
  const providerTransferReference =
    input.providerTransferReference === null
      ? null
      : text(input.providerTransferReference, 160);
  const ledgerExternalKey =
    input.ledgerExternalKey === null ? null : text(input.ledgerExternalKey, 160);
  const reversalLedgerExternalKey =
    input.reversalLedgerExternalKey === null
      ? null
      : text(input.reversalLedgerExternalKey, 160);
  const createdAt = time(input.createdAt);
  const updatedAt = time(input.updatedAt);
  const settledAt = input.settledAt === null ? null : time(input.settledAt);
  const reversedAt = input.reversedAt === null ? null : time(input.reversedAt);
  if (
    !id ||
    !payableId ||
    !paymentId ||
    !beneficiaryReference ||
    !amount ||
    amount.minorUnits <= 0 ||
    !expectedKey ||
    idempotencyKey !== expectedKey ||
    !status ||
    !createdAt ||
    !updatedAt ||
    (providerTransferReference !== null &&
      !PROVIDER_REFERENCE.test(providerTransferReference)) ||
    (status === "claimed" &&
      (providerTransferReference !== null || ledgerExternalKey !== null)) ||
    (status === "provider_accepted" &&
      (!providerTransferReference || ledgerExternalKey !== null)) ||
    (status === "settled" &&
      (!providerTransferReference || !ledgerExternalKey || !settledAt)) ||
    (status === "failed" && !providerTransferReference) ||
    (status === "reversed" &&
      (!providerTransferReference ||
        !ledgerExternalKey ||
        !reversalLedgerExternalKey ||
        !settledAt ||
        !reversedAt))
  ) {
    return null;
  }
  return Object.freeze({
    id,
    payableId,
    paymentId,
    beneficiaryReference,
    amount,
    idempotencyKey: expectedKey,
    status,
    providerTransferReference,
    ledgerExternalKey,
    reversalLedgerExternalKey,
    createdAt,
    updatedAt,
    settledAt,
    reversedAt,
  });
}

export function createFinancialSettlementProviderCommand(
  input: Readonly<{
    settlementId?: unknown;
    payableId?: unknown;
    paymentId?: unknown;
    beneficiaryReference?: unknown;
    amount?: unknown;
    idempotencyKey?: unknown;
  }>,
): FinancialSettlementProviderCommand | null {
  const settlementId = normalizeFinancialSettlementId(input.settlementId);
  const payableId = normalizeFinancialPayableId(input.payableId);
  const paymentId = normalizePaymentId(input.paymentId);
  const beneficiaryReference = normalizeFinancialBeneficiaryReference(
    input.beneficiaryReference,
  );
  const amount = money(input.amount);
  const expectedKey = createFinancialSettlementIdempotencyKey(payableId);
  if (
    !settlementId ||
    !payableId ||
    !paymentId ||
    !beneficiaryReference ||
    !amount ||
    amount.minorUnits <= 0 ||
    !expectedKey ||
    input.idempotencyKey !== expectedKey
  ) {
    return null;
  }
  return Object.freeze({
    settlementId,
    payableId,
    paymentId,
    beneficiaryReference,
    amount,
    idempotencyKey: expectedKey,
  });
}

export function normalizeFinancialSettlementProviderReceipt(
  input: Readonly<{ accepted?: unknown; providerTransferReference?: unknown }>,
): FinancialSettlementProviderReceipt | null {
  const providerTransferReference = text(input.providerTransferReference, 160);
  return input.accepted === true && PROVIDER_REFERENCE.test(providerTransferReference)
    ? Object.freeze({ accepted: true as const, providerTransferReference })
    : null;
}

export function normalizeFinancialSettlementProviderSnapshot(
  input: Readonly<{
    settlementId?: unknown;
    providerTransferReference?: unknown;
    status?: unknown;
    amount?: unknown;
    observedAt?: unknown;
  }>,
): FinancialSettlementProviderSnapshot | null {
  const settlementId = normalizeFinancialSettlementId(input.settlementId);
  const providerTransferReference = text(input.providerTransferReference, 160);
  const statuses: readonly FinancialSettlementProviderStatus[] = [
    "pending",
    "paid",
    "failed",
    "reversed",
  ];
  const status =
    typeof input.status === "string" &&
    statuses.includes(input.status as FinancialSettlementProviderStatus)
      ? (input.status as FinancialSettlementProviderStatus)
      : null;
  const amount = money(input.amount);
  const observedAt = time(input.observedAt);
  if (
    !settlementId ||
    !PROVIDER_REFERENCE.test(providerTransferReference) ||
    !status ||
    !amount ||
    amount.minorUnits <= 0 ||
    !observedAt
  ) {
    return null;
  }
  return Object.freeze({
    settlementId,
    providerTransferReference,
    status,
    amount,
    observedAt,
  });
}
