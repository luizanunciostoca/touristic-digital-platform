import type { Result } from "../core/contracts.js";
import type { Clock } from "../core/runtime.js";
import type { TelemetrySink } from "../observability/telemetry.js";
import type { ConfirmationReceipt } from "./prepared-actions.js";
import type {
  ConfirmationEngine,
  SandboxActionExecutor,
  SandboxExecutionReceipt,
} from "./confirmation-engine.js";

export interface ActionTelemetryContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly correlationId: string;
}

export class ActionLifecycleController {
  constructor(
    private readonly confirmation: ConfirmationEngine,
    private readonly sandboxExecutor: SandboxActionExecutor,
    private readonly telemetry: TelemetrySink,
    private readonly clock: Clock,
  ) {}

  confirm(
    preparedActionId: string,
    contextFingerprint: string,
    context: ActionTelemetryContext,
  ): Result<ConfirmationReceipt> {
    const result = this.confirmation.confirm(preparedActionId, contextFingerprint);
    this.telemetry.emit({
      name: result.ok ? "assistant.action.confirmed" : "assistant.action.denied",
      ...context,
      timestamp: this.clock.now().toISOString(),
      ...(result.ok ? { result: preparedActionId } : { error: result.error.code }),
    });
    return result;
  }

  executeSandbox(
    preparedActionId: string,
    contextFingerprint: string,
    context: ActionTelemetryContext,
  ): Result<SandboxExecutionReceipt> {
    const result = this.sandboxExecutor.execute(preparedActionId, contextFingerprint);
    if (!result.ok) {
      this.telemetry.emit({
        name: "assistant.action.denied",
        ...context,
        timestamp: this.clock.now().toISOString(),
        error: result.error.code,
      });
      return result;
    }
    for (const name of ["assistant.action.executed", "assistant.action.verified"] as const) {
      this.telemetry.emit({
        name,
        ...context,
        timestamp: this.clock.now().toISOString(),
        result: preparedActionId,
        tool: result.value.tool,
      });
    }
    return result;
  }
}
