export type RecoveryAction =
  | "no_op"
  | "retry_delivery"
  | "dead_letter"
  | "halt_for_reconciliation";

export interface RecoveryDecisionInput {
  readonly ownerStateCommitted: boolean;
  readonly downstreamAcknowledged: boolean;
  readonly idempotencyEvidencePresent: boolean;
  readonly attempts: number;
  readonly maximumAttempts: number;
}

export interface RecoveryDecision {
  readonly action: RecoveryAction;
  readonly code: string;
}

export function decideRecovery(
  input: RecoveryDecisionInput,
): RecoveryDecision {
  if (
    !Number.isSafeInteger(input.attempts) ||
    !Number.isSafeInteger(input.maximumAttempts) ||
    input.attempts < 0 ||
    input.maximumAttempts < 1
  ) {
    return {
      action: "halt_for_reconciliation",
      code: "RECOVERY_POLICY_INVALID",
    };
  }

  if (input.downstreamAcknowledged) {
    return { action: "no_op", code: "ALREADY_ACKNOWLEDGED" };
  }

  if (!input.ownerStateCommitted) {
    return {
      action: "halt_for_reconciliation",
      code: "OWNER_STATE_NOT_CONFIRMED",
    };
  }

  if (!input.idempotencyEvidencePresent) {
    return {
      action: "halt_for_reconciliation",
      code: "IDEMPOTENCY_EVIDENCE_MISSING",
    };
  }

  if (input.attempts >= input.maximumAttempts) {
    return { action: "dead_letter", code: "RETRY_BUDGET_EXHAUSTED" };
  }

  return { action: "retry_delivery", code: "SAFE_IDEMPOTENT_RETRY" };
}
