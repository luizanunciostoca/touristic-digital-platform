import type { Result } from "../core/contracts.js";
import type { PreparedAction, ConfirmationReceipt } from "./prepared-actions.js";
import type { PreparedActionStore } from "./prepared-actions.js";

export class ConfirmationEngine {
  constructor(private readonly store: PreparedActionStore) {}

  confirm(preparedActionId: string, contextFingerprint: string): Result<ConfirmationReceipt> {
    return this.store.confirm(preparedActionId, contextFingerprint);
  }
}

export interface SandboxExecutionReceipt {
  readonly actionId: string;
  readonly tool: string;
  readonly idempotencyKey: string;
  readonly sandbox: true;
  readonly output: unknown;
}

export class SandboxActionExecutor {
  constructor(private readonly store: PreparedActionStore) {}

  execute(
    preparedActionId: string,
    contextFingerprint: string,
  ): Result<PreparedAction | SandboxExecutionReceipt> {
    const claimed = this.store.claimForSandboxExecution(preparedActionId, contextFingerprint);
    if (!claimed.ok) return claimed;
    return {
      ok: true,
      value: {
        actionId: claimed.value.id,
        tool: claimed.value.tool,
        idempotencyKey: claimed.value.idempotencyKey,
        sandbox: true,
        output: { accepted: true, input: structuredClone(claimed.value.input) },
      },
    };
  }
}
