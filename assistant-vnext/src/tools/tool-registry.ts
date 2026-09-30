import { z } from "zod";
import type { EvidenceReference, Result, ToolEffect } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";

export interface ToolExecutionContext {
  readonly conversationId: string;
  readonly turnId: string;
  readonly userId?: string;
  readonly locale: "pt" | "en" | "es" | "he";
  readonly authScopes: readonly string[];
  readonly correlationId: string;
  readonly featureFlags: Readonly<Record<string, boolean>>;
  readonly abortSignal: AbortSignal;
}

export interface ToolSuccess<T> {
  readonly data: T;
  readonly evidence: readonly EvidenceReference[];
  readonly observedAt: string;
  readonly validUntil?: string;
}

export interface AssistantToolDefinition<I, O> {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly effect: ToolEffect;
  readonly domain: string;
  readonly inputSchema: z.ZodType<I>;
  readonly outputSchema: z.ZodType<O>;
  readonly permissions: readonly string[];
  readonly timeoutMs: number;
  readonly retryAttempts: number;
  readonly idempotent: boolean;
  readonly offlineAllowed: boolean;
  execute(context: ToolExecutionContext, input: I): Promise<Result<ToolSuccess<O>>>;
}

export class AssistantToolRegistry {
  private readonly tools = new Map<string, AssistantToolDefinition<unknown, unknown>>();

  register<I, O>(definition: AssistantToolDefinition<I, O>): void {
    const key = this.key(definition.name, definition.version);
    if (this.tools.has(key)) throw new Error("Duplicate tool registration: " + key);
    if (definition.timeoutMs < 1 || definition.timeoutMs > 30000) {
      throw new Error("Invalid timeout for " + key);
    }
    if (definition.retryAttempts < 0 || definition.retryAttempts > 3) {
      throw new Error("Invalid retry count for " + key);
    }
    const frozen = Object.freeze({
      ...definition,
      permissions: Object.freeze([...definition.permissions]),
    }) as AssistantToolDefinition<unknown, unknown>;
    this.tools.set(key, frozen);
  }

  resolve(name: string, version = "1"): Result<AssistantToolDefinition<unknown, unknown>> {
    const tool = this.tools.get(this.key(name, version));
    return tool ? ok(tool) : err("POLICY_DENIED", "Tool is not allowlisted");
  }

  list(): readonly Readonly<{
    name: string;
    version: string;
    effect: ToolEffect;
    domain: string;
    permissions: readonly string[];
  }>[] {
    return [...this.tools.values()]
      .map((tool) => ({
        name: tool.name,
        version: tool.version,
        effect: tool.effect,
        domain: tool.domain,
        permissions: tool.permissions,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private key(name: string, version: string): string {
    return name + "@" + version;
  }
}

export const EmptyObjectSchema = z.object({}).strict();
