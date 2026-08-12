import type { AuthSessionIdentity } from "@touristic/auth";

import {
  normalizeCrmId,
  type CrmFollowUp,
  type CrmFollowUpSetting,
  type CrmId,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmFollowUpBoundaryOperation =
  | "follow_up.settings_list"
  | "follow_up.setting_save"
  | "follow_up.list"
  | "follow_up.pending"
  | "follow_up.create"
  | "follow_up.mark_sent"
  | "follow_up.mark_responded";

export type CrmFollowUpBoundaryReason =
  | CrmAuthorizationReason
  | "invalid_input"
  | "not_found"
  | "invalid_transition";

export interface CrmFollowUpAuditEvent {
  readonly operation: CrmFollowUpBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmFollowUpBoundaryReason;
  readonly actorSubject: string | null;
  readonly followUpId: CrmId | null;
  readonly leadId: CrmId | null;
}

export interface CrmFollowUpAuditPort {
  readonly record: (event: CrmFollowUpAuditEvent) => Promise<void>;
}

export interface CrmFollowUpSettingSaveInput {
  readonly id?: unknown;
  readonly name: unknown;
  readonly intervalDays: unknown;
  readonly maxAttempts: unknown;
  readonly messageTemplate?: unknown;
  readonly isActive?: unknown;
}

export interface CrmFollowUpCreateInput {
  readonly leadId: unknown;
  readonly settingId?: unknown;
  readonly scheduledAt: unknown;
  readonly attemptNumber?: unknown;
}

export interface CrmFollowUpIdInput {
  readonly id: unknown;
}

export interface CrmFollowUpSettingRecord {
  readonly id: CrmId | null;
  readonly name: string;
  readonly intervalDays: number;
  readonly maxAttempts: number;
  readonly messageTemplate: string | null;
  readonly isActive: boolean;
}

export interface CrmFollowUpCreateRecord {
  readonly leadId: CrmId;
  readonly settingId: CrmId | null;
  readonly scheduledAt: Date;
  readonly attemptNumber: number;
  readonly status: "pending";
}

export interface CrmFollowUpBoundaryRepository {
  readonly listSettings: () => Promise<readonly CrmFollowUpSetting[]>;
  readonly upsertSetting: (
    record: CrmFollowUpSettingRecord,
  ) => Promise<CrmFollowUpSetting>;
  readonly list: (leadId?: CrmId) => Promise<readonly CrmFollowUp[]>;
  readonly listPending: () => Promise<readonly CrmFollowUp[]>;
  readonly findById: (id: CrmId) => Promise<CrmFollowUp | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly settingExists: (settingId: CrmId) => Promise<boolean>;
  readonly create: (record: CrmFollowUpCreateRecord) => Promise<CrmFollowUp>;
  readonly markSent: (id: CrmId, sentAt: Date) => Promise<CrmFollowUp>;
  readonly markResponded: (
    id: CrmId,
    respondedAt: Date,
  ) => Promise<CrmFollowUp>;
  readonly updateLeadLastContact: (leadId: CrmId, at: Date) => Promise<void>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export type CrmFollowUpBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmFollowUpBoundaryReason };

function safeText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function safeRequiredText(value: unknown, maxLength: number): string | null {
  const normalized = safeText(value, maxLength);
  return typeof normalized === "string" && normalized.length > 0
    ? normalized
    : null;
}

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

function safeDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export class CrmFollowUpServerBoundary {
  constructor(
    private readonly repository: CrmFollowUpBoundaryRepository,
    private readonly audit: CrmFollowUpAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmFollowUpBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    followUpId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmFollowUpBoundaryResult<true>> {
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
        followUpId,
        leadId,
      });
      return { ok: false, reason: authorization.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmFollowUpBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: Exclude<CrmFollowUpBoundaryReason, CrmAuthorizationReason>,
    followUpId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmFollowUpBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      followUpId,
      leadId,
    });
    return { ok: false, reason };
  }

  async listSettings(
    session: AuthSessionIdentity | null,
  ): Promise<CrmFollowUpBoundaryResult<readonly CrmFollowUpSetting[]>> {
    const authorization = await this.authorize(
      "follow_up.settings_list",
      session,
      false,
    );
    if (!authorization.ok) return authorization;
    return { ok: true, value: await this.repository.listSettings() };
  }

  async saveSetting(
    session: AuthSessionIdentity | null,
    input: CrmFollowUpSettingSaveInput,
  ): Promise<CrmFollowUpBoundaryResult<CrmFollowUpSetting>> {
    const id = input.id === undefined ? null : normalizeCrmId(input.id);
    const authorization = await this.authorize(
      "follow_up.setting_save",
      session,
      true,
    );
    if (!authorization.ok) return authorization;

    const name = safeRequiredText(input.name, 160);
    const intervalDays = safePositiveInteger(input.intervalDays, 365);
    const maxAttempts = safePositiveInteger(input.maxAttempts, 100);
    const messageTemplate = safeText(input.messageTemplate, 4000);
    const isActive = input.isActive === undefined ? true : input.isActive;
    if (
      (input.id !== undefined && !id) ||
      !name ||
      intervalDays === null ||
      maxAttempts === null ||
      messageTemplate === undefined ||
      typeof isActive !== "boolean"
    ) {
      return this.reject("follow_up.setting_save", session, "invalid_input");
    }

    return {
      ok: true,
      value: await this.repository.upsertSetting({
        id,
        name,
        intervalDays,
        maxAttempts,
        messageTemplate,
        isActive,
      }),
    };
  }

  async list(
    session: AuthSessionIdentity | null,
    leadIdValue?: unknown,
  ): Promise<CrmFollowUpBoundaryResult<readonly CrmFollowUp[]>> {
    const leadId =
      leadIdValue === undefined ? undefined : normalizeCrmId(leadIdValue);
    const authorization = await this.authorize(
      "follow_up.list",
      session,
      false,
      null,
      leadId ?? null,
    );
    if (!authorization.ok) return authorization;
    if (leadIdValue !== undefined && !leadId) {
      return this.reject("follow_up.list", session, "invalid_input");
    }
    return { ok: true, value: await this.repository.list(leadId) };
  }

  async pending(
    session: AuthSessionIdentity | null,
  ): Promise<CrmFollowUpBoundaryResult<readonly CrmFollowUp[]>> {
    const authorization = await this.authorize(
      "follow_up.pending",
      session,
      false,
    );
    if (!authorization.ok) return authorization;
    return { ok: true, value: await this.repository.listPending() };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmFollowUpCreateInput,
  ): Promise<CrmFollowUpBoundaryResult<CrmFollowUp>> {
    const leadId = normalizeCrmId(input.leadId);
    const settingId =
      input.settingId === undefined || input.settingId === null
        ? null
        : normalizeCrmId(input.settingId);
    const authorization = await this.authorize(
      "follow_up.create",
      session,
      true,
      null,
      leadId,
    );
    if (!authorization.ok) return authorization;

    const scheduledAt = safeDate(input.scheduledAt);
    const attemptNumber = safePositiveInteger(input.attemptNumber, 100, 1);
    if (
      !leadId ||
      (input.settingId !== undefined && input.settingId !== null && !settingId) ||
      !scheduledAt ||
      attemptNumber === null
    ) {
      return this.reject(
        "follow_up.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }
    if (!(await this.repository.leadExists(leadId))) {
      return this.reject("follow_up.create", session, "not_found", null, leadId);
    }
    if (settingId && !(await this.repository.settingExists(settingId))) {
      return this.reject("follow_up.create", session, "not_found", null, leadId);
    }

    return {
      ok: true,
      value: await this.repository.create({
        leadId,
        settingId,
        scheduledAt,
        attemptNumber,
        status: "pending",
      }),
    };
  }

  async markSent(
    session: AuthSessionIdentity | null,
    input: CrmFollowUpIdInput,
  ): Promise<CrmFollowUpBoundaryResult<CrmFollowUp>> {
    const id = normalizeCrmId(input.id);
    const authorization = await this.authorize(
      "follow_up.mark_sent",
      session,
      true,
      id,
    );
    if (!authorization.ok) return authorization;
    if (!id) return this.reject("follow_up.mark_sent", session, "invalid_input");

    const followUp = await this.repository.findById(id);
    if (!followUp) return this.reject("follow_up.mark_sent", session, "not_found", id);
    if (followUp.status !== "pending") {
      return this.reject(
        "follow_up.mark_sent",
        session,
        "invalid_transition",
        id,
        followUp.leadId,
      );
    }

    const sentAt = this.now();
    const updated = await this.repository.markSent(id, sentAt);
    await this.repository.appendInteraction({
      leadId: followUp.leadId,
      content: "Follow-up enviado via WhatsApp",
      actorSubject: session?.subject ?? "",
    });
    await this.repository.updateLeadLastContact(followUp.leadId, sentAt);
    return { ok: true, value: updated };
  }

  async markResponded(
    session: AuthSessionIdentity | null,
    input: CrmFollowUpIdInput,
  ): Promise<CrmFollowUpBoundaryResult<CrmFollowUp>> {
    const id = normalizeCrmId(input.id);
    const authorization = await this.authorize(
      "follow_up.mark_responded",
      session,
      true,
      id,
    );
    if (!authorization.ok) return authorization;
    if (!id) {
      return this.reject("follow_up.mark_responded", session, "invalid_input");
    }

    const followUp = await this.repository.findById(id);
    if (!followUp) {
      return this.reject("follow_up.mark_responded", session, "not_found", id);
    }
    if (followUp.status !== "sent") {
      return this.reject(
        "follow_up.mark_responded",
        session,
        "invalid_transition",
        id,
        followUp.leadId,
      );
    }

    const updated = await this.repository.markResponded(id, this.now());
    await this.repository.appendInteraction({
      leadId: followUp.leadId,
      content: "Lead respondeu ao follow-up",
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }
}
