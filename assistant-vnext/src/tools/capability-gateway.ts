import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import { composeAbortSignal } from "../core/runtime.js";
import type { AssistantPolicyEngine } from "../policy/policy-engine.js";
import type { AssistantToolRegistry, ToolExecutionContext, ToolSuccess } from "./tool-registry.js";

export interface ToolCallProposal {
  readonly name: string;
  readonly version?: string;
  readonly arguments: unknown;
}

export class AssistantCapabilityGateway {
  constructor(
    private readonly registry: AssistantToolRegistry,
    private readonly policy: AssistantPolicyEngine,
  ) {}

  async invoke(
    proposal: ToolCallProposal,
    contextEnvelope: Readonly<AssistantContextEnvelope>,
    executionContext: ToolExecutionContext,
  ): Promise<Result<ToolSuccess<unknown>>> {
    const resolved = this.registry.resolve(proposal.name, proposal.version ?? "1");
    if (!resolved.ok) return resolved;
    const tool = resolved.value;

    const policy = this.policy.evaluateTool(
      {
        name: tool.name,
        effect: tool.effect,
        permissions: tool.permissions,
        offlineAllowed: tool.offlineAllowed,
        domain: tool.domain,
      },
      contextEnvelope,
    );
    if (!policy.ok) return policy;

    const input = tool.inputSchema.safeParse(proposal.arguments);
    if (!input.success) return err("VALIDATION_FAILED", "Tool input schema validation failed");

    const maxAttempts = 1 + tool.retryAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const bounded = composeAbortSignal(executionContext.abortSignal, tool.timeoutMs);
      try {
        if (bounded.signal.aborted) {
          const isParent = executionContext.abortSignal.aborted;
          return err(
            isParent ? "CANCELLED" : "TIMEOUT",
            isParent ? "Tool call cancelled" : "Tool call timed out",
            !isParent,
          );
        }
        const result = await tool.execute(
          { ...executionContext, abortSignal: bounded.signal },
          input.data,
        );
        if (!result.ok) {
          if (result.error.retryable && attempt < maxAttempts) continue;
          return result;
        }
        const output = tool.outputSchema.safeParse(result.value.data);
        if (!output.success) {
          return err("VALIDATION_FAILED", "Tool output schema validation failed");
        }
        return ok({ ...result.value, data: output.data });
      } catch (cause) {
        if (executionContext.abortSignal.aborted) {
          return err("CANCELLED", "Tool call cancelled", false);
        }
        if (bounded.signal.aborted) {
          if (attempt < maxAttempts) continue;
          return err("TIMEOUT", "Tool call timed out", true);
        }
        if (attempt < maxAttempts) continue;
        return err(
          "UNAVAILABLE",
          cause instanceof Error ? cause.message : "Tool execution failed",
          true,
        );
      } finally {
        bounded.dispose();
      }
    }
    return err("UNAVAILABLE", "Tool retry budget exhausted", true);
  }
}
