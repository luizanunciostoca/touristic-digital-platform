import { z } from "zod";
import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { Clock, IdGenerator } from "../core/runtime.js";
import { sha256Json } from "../core/runtime.js";

export const PreparedActionSchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.string().min(1).max(120),
    tool: z.string().min(1).max(160),
    toolVersion: z.string().min(1).max(30),
    requestedBy: z.string().min(1).max(160),
    input: z.unknown(),
    summary: z.string().min(1).max(1000),
    effect: z.enum(["prepare", "execute"]),
    requiresConfirmation: z.boolean(),
    confirmationText: z.string().min(1).max(1000).optional(),
    idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u),
    expiresAt: z.string().datetime({ offset: true }),
    contextFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export type PreparedAction = z.infer<typeof PreparedActionSchema>;

export interface ConfirmationReceipt {
  readonly preparedActionId: string;
  readonly confirmedAt: string;
  readonly contextFingerprint: string;
  readonly confirmationId: string;
}

export class PreparedActionStore {
  private readonly actions = new Map<string, PreparedAction>();
  private readonly confirmations = new Map<string, ConfirmationReceipt>();
  private readonly executed = new Set<string>();

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  prepare(
    input: Readonly<{
      type: string;
      tool: string;
      toolVersion?: string;
      requestedBy: string;
      input: unknown;
      summary: string;
      requiresConfirmation: boolean;
      confirmationText?: string;
      expiresInMs: number;
      contextFingerprint: string;
      sessionId: string;
    }>,
  ): PreparedAction {
    const id = this.ids.next("action");
    const preparedVersion = "1";
    const action: PreparedAction = {
      id,
      type: input.type,
      tool: input.tool,
      toolVersion: input.toolVersion ?? "1",
      requestedBy: input.requestedBy,
      input: structuredClone(input.input),
      summary: input.summary,
      effect: "prepare",
      requiresConfirmation: input.requiresConfirmation,
      ...(input.confirmationText ? { confirmationText: input.confirmationText } : {}),
      idempotencyKey: sha256Json({
        sessionId: input.sessionId,
        actionId: id,
        preparedVersion,
      }),
      expiresAt: new Date(this.clock.now().getTime() + input.expiresInMs).toISOString(),
      contextFingerprint: input.contextFingerprint,
    };
    const validated = PreparedActionSchema.parse(action);
    this.actions.set(id, structuredClone(validated));
    return structuredClone(validated);
  }

  confirm(actionId: string, contextFingerprint: string): Result<ConfirmationReceipt> {
    const action = this.actions.get(actionId);
    if (!action) return err("NOT_FOUND", "Prepared action not found");
    if (new Date(action.expiresAt).getTime() <= this.clock.now().getTime()) {
      return err("EXPIRED", "Prepared action expired");
    }
    if (action.contextFingerprint !== contextFingerprint) {
      return err("POLICY_DENIED", "Context changed since action was prepared");
    }
    const receipt: ConfirmationReceipt = {
      preparedActionId: actionId,
      confirmedAt: this.clock.now().toISOString(),
      contextFingerprint,
      confirmationId: this.ids.next("confirmation"),
    };
    this.confirmations.set(actionId, receipt);
    return ok(structuredClone(receipt));
  }

  claimForSandboxExecution(actionId: string, contextFingerprint: string): Result<PreparedAction> {
    const action = this.actions.get(actionId);
    if (!action) return err("NOT_FOUND", "Prepared action not found");
    if (new Date(action.expiresAt).getTime() <= this.clock.now().getTime()) {
      return err("EXPIRED", "Prepared action expired");
    }
    if (action.contextFingerprint !== contextFingerprint) {
      return err("POLICY_DENIED", "Context fingerprint mismatch");
    }
    if (action.requiresConfirmation && !this.confirmations.has(actionId)) {
      return err("POLICY_DENIED", "Confirmation required");
    }
    if (this.executed.has(action.idempotencyKey)) {
      return err("DUPLICATE", "Prepared action already executed");
    }
    this.executed.add(action.idempotencyKey);
    return ok(structuredClone({ ...action, effect: "execute" as const }));
  }

  get(actionId: string): PreparedAction | null {
    const action = this.actions.get(actionId);
    return action ? structuredClone(action) : null;
  }
}
