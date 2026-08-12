import type { AuthSessionIdentity } from "@touristic/auth";

import { normalizeCrmId, type CrmId, type CrmTrial } from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmTrialBoundaryOperation =
  | "trial.list"
  | "trial.create"
  | "trial.convert"
  | "trial.cancel"
  | "trial.expire";

export type CrmTrialBoundaryReason =
  CrmAuthorizationReason | "invalid_input" | "not_found" | "invalid_transition";

export interface CrmTrialAuditEvent {
  readonly operation: CrmTrialBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmTrialBoundaryReason;
  readonly actorSubject: string | null;
  readonly trialId: CrmId | null;
  readonly leadId: CrmId | null;
}

export interface CrmTrialAuditPort {
  readonly record: (event: CrmTrialAuditEvent) => Promise<void>;
}

export interface CrmTrialCreateInput {
  readonly leadId: unknown;
  readonly durationDays?: unknown;
  readonly startDate?: unknown;
}

export interface CrmTrialIdInput {
  readonly id: unknown;
}

export interface CrmTrialCreateRecord {
  readonly leadId: CrmId;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly durationDays: number;
  readonly status: "active";
}

export interface CrmTrialBoundaryRepository {
  readonly list: (leadId?: CrmId) => Promise<readonly CrmTrial[]>;
  readonly findById: (id: CrmId) => Promise<CrmTrial | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly create: (record: CrmTrialCreateRecord) => Promise<CrmTrial>;
  readonly markConverted: (id: CrmId, convertedAt: Date) => Promise<CrmTrial>;
  readonly markCancelled: (id: CrmId) => Promise<CrmTrial>;
  readonly markExpired: (id: CrmId) => Promise<CrmTrial>;
  readonly updateLeadStage: (input: {
    readonly leadId: CrmId;
    readonly stage: "trial" | "active_client";
    readonly convertedAt?: Date;
  }) => Promise<void>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export type CrmTrialBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmTrialBoundaryReason };

function safePositiveInteger(
  value: unknown,
  maximum: number,
  fallback?: number,
): number | null {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < 1 || value > maximum) return null;
  return value;
}

function safeDate(value: unknown, fallback?: Date): Date | null {
  if (value === undefined && fallback) return new Date(fallback.getTime());
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export class CrmTrialServerBoundary {
  constructor(
    private readonly repository: CrmTrialBoundaryRepository,
    private readonly audit: CrmTrialAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmTrialBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    trialId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmTrialBoundaryResult<true>> {
    const authorization = authorizeCrmAccess(session, {
      mutation,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (!authorization.allowed) {
      await this.audit.record({
        operation,
        allowed: false,
        reason: authorization.reason,
        actorSubject: session?.subject ?? null,
        trialId,
        leadId,
      });
      return { ok: false, reason: authorization.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmTrialBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: Exclude<CrmTrialBoundaryReason, CrmAuthorizationReason>,
    trialId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmTrialBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      trialId,
      leadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    leadIdValue?: unknown,
  ): Promise<CrmTrialBoundaryResult<readonly CrmTrial[]>> {
    const leadId =
      leadIdValue === undefined ? undefined : normalizeCrmId(leadIdValue);
    const authorization = await this.authorize(
      "trial.list",
      session,
      false,
      null,
      leadId ?? null,
    );
    if (!authorization.ok) return authorization;
    if (leadIdValue !== undefined && !leadId) {
      return this.reject("trial.list", session, "invalid_input");
    }
    return { ok: true, value: await this.repository.list(leadId) };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmTrialCreateInput,
  ): Promise<CrmTrialBoundaryResult<CrmTrial>> {
    const leadId = normalizeCrmId(input.leadId);
    const authorization = await this.authorize(
      "trial.create",
      session,
      true,
      null,
      leadId,
    );
    if (!authorization.ok) return authorization;

    const durationDays = safePositiveInteger(input.durationDays, 365, 30);
    const startDate = safeDate(input.startDate, this.now());
    if (!leadId || durationDays === null || !startDate) {
      return this.reject(
        "trial.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }
    if (!(await this.repository.leadExists(leadId))) {
      return this.reject("trial.create", session, "not_found", null, leadId);
    }

    const endDate = new Date(
      startDate.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );
    const created = await this.repository.create({
      leadId,
      startDate,
      endDate,
      durationDays,
      status: "active",
    });
    await this.repository.updateLeadStage({ leadId, stage: "trial" });
    await this.repository.appendInteraction({
      leadId,
      content: `Trial de ${durationDays} dias iniciado`,
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: created };
  }

  async convert(
    session: AuthSessionIdentity | null,
    input: CrmTrialIdInput,
  ): Promise<CrmTrialBoundaryResult<CrmTrial>> {
    const resolved = await this.resolveActive(
      "trial.convert",
      session,
      input.id,
    );
    if (!resolved.ok) return resolved;
    const convertedAt = this.now();
    const updated = await this.repository.markConverted(
      resolved.value.id,
      convertedAt,
    );
    await this.repository.updateLeadStage({
      leadId: resolved.value.leadId,
      stage: "active_client",
      convertedAt,
    });
    await this.repository.appendInteraction({
      leadId: resolved.value.leadId,
      content: "Trial convertido manualmente — cliente ativo!",
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }

  async cancel(
    session: AuthSessionIdentity | null,
    input: CrmTrialIdInput,
  ): Promise<CrmTrialBoundaryResult<CrmTrial>> {
    const resolved = await this.resolveActive("trial.cancel", session, input.id);
    if (!resolved.ok) return resolved;
    const updated = await this.repository.markCancelled(resolved.value.id);
    await this.repository.appendInteraction({
      leadId: resolved.value.leadId,
      content: "Trial cancelado manualmente.",
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }

  async expire(
    session: AuthSessionIdentity | null,
    input: CrmTrialIdInput,
  ): Promise<CrmTrialBoundaryResult<CrmTrial>> {
    const resolved = await this.resolveActive("trial.expire", session, input.id);
    if (!resolved.ok) return resolved;
    const updated = await this.repository.markExpired(resolved.value.id);
    await this.repository.appendInteraction({
      leadId: resolved.value.leadId,
      content: "Trial marcado como expirado manualmente.",
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }

  private async resolveActive(
    operation: Exclude<CrmTrialBoundaryOperation, "trial.list" | "trial.create">,
    session: AuthSessionIdentity | null,
    idValue: unknown,
  ): Promise<CrmTrialBoundaryResult<CrmTrial>> {
    const id = normalizeCrmId(idValue);
    const authorization = await this.authorize(operation, session, true, id);
    if (!authorization.ok) return authorization;
    if (!id) return this.reject(operation, session, "invalid_input");
    const trial = await this.repository.findById(id);
    if (!trial) return this.reject(operation, session, "not_found", id);
    if (trial.status !== "active") {
      return this.reject(
        operation,
        session,
        "invalid_transition",
        id,
        trial.leadId,
      );
    }
    return { ok: true, value: trial };
  }
}
