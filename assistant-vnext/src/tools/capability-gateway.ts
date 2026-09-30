import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { AssistantFailure, Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import { composeAbortSignal } from "../core/runtime.js";
import type { AssistantPolicyEngine } from "../policy/policy-engine.js";
import type { AssistantToolRegistry, ToolExecutionContext, ToolSuccess } from "./tool-registry.js";

export interface ToolCallProposal {
  readonly name: string;
  readonly version?: string;
  readonly arguments: unknown;
}

function publicFailure(failure: AssistantFailure): Result<never> {
  const messages: Record<AssistantFailure["code"], string> = {
    UNAVAILABLE: "Tool unavailable",
    INSUFFICIENT_EVIDENCE: "Insufficient evidence",
    POLICY_DENIED: "Tool request denied",
    VALIDATION_FAILED: "Tool validation failed",
    TIMEOUT: "Tool call timed out",
    CANCELLED: "Tool call cancelled",
    NOT_FOUND: "Requested data not found",
    CONFLICT: "Tool result conflict",
    EXPIRED: "Prepared state expired",
    DUPLICATE: "Duplicate operation denied",
    PROVIDER_ERROR: "Provider unavailable",
  };
  return err(failure.code, messages[failure.code], failure.retryable);
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function validSuccess(result: ToolSuccess<unknown>): boolean {
  if (!validTimestamp(result.observedAt)) return false;
  if (result.validUntil && !validTimestamp(result.validUntil)) return false;
  return result.evidence.every(
    (item) =>
      item.id.trim().length > 0 &&
      item.source.trim().length > 0 &&
      item.sourceType.trim().length > 0,
  );
}

function executeBounded<T>(execute: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("aborted"));
  return Promise.race([
    execute(),
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), {
        once: true,
      });
    }),
  ]);
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

    if (contextEnvelope.user.authenticated) {
      if (
        !contextEnvelope.user.userId ||
        !executionContext.userId ||
        contextEnvelope.user.userId !== executionContext.userId
      ) {
        return err("POLICY_DENIED", "Authenticated identity mismatch");
      }
    }

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

    const executionScopes = new Set(executionContext.authScopes);
    if (tool.permissions.some((permission) => !executionScopes.has(permission))) {
      return err("POLICY_DENIED", "Execution identity lacks required permission");
    }

    const input = tool.inputSchema.safeParse(proposal.arguments);
    if (!input.success) return err("VALIDATION_FAILED", "Tool input schema validation failed");

    const maxAttempts = 1 + tool.retryAttempts;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const bounded = composeAbortSignal(executionContext.abortSignal, tool.timeoutMs);
      try {
        const result = await executeBounded(
          () => tool.execute({ ...executionContext, abortSignal: bounded.signal }, input.data),
          bounded.signal,
        );
        if (!result.ok) {
          if (result.error.retryable && attempt < maxAttempts) continue;
          return publicFailure(result.error);
        }
        if (!validSuccess(result.value)) {
          return err("VALIDATION_FAILED", "Tool result metadata validation failed");
        }
        const output = tool.outputSchema.safeParse(result.value.data);
        if (!output.success) {
          return err("VALIDATION_FAILED", "Tool output schema validation failed");
        }
        return ok({ ...result.value, data: output.data });
      } catch {
        if (executionContext.abortSignal.aborted) {
          return err("CANCELLED", "Tool call cancelled", false);
        }
        if (bounded.signal.aborted) {
          if (attempt < maxAttempts) continue;
          return err("TIMEOUT", "Tool call timed out", true);
        }
        if (attempt < maxAttempts) continue;
        return err("UNAVAILABLE", "Tool execution failed", true);
      } finally {
        bounded.dispose();
      }
    }
    return err("UNAVAILABLE", "Tool retry budget exhausted", true);
  }
}
