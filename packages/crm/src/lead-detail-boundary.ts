import type { AuthSessionIdentity } from "@touristic/auth";

import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";
import type {
  CrmChecklistStep,
  CrmId,
  CrmInteractionType,
  CrmLead,
} from "./index.js";
import { normalizeCrmId } from "./index.js";
import {
  crmLeadDetailChecklist,
  isCrmLeadDetailManualInteractionType,
  type CrmLeadDetailManualInteractionType,
} from "./lead-detail-contract.js";

export type CrmLeadDetailOperation =
  | "lead.detail"
  | "lead.checklist_toggle"
  | "lead.interaction_add";

export type CrmLeadDetailReason =
  | CrmAuthorizationReason
  | "invalid_input"
  | "not_found";

export interface CrmLeadDetailAuditEvent {
  readonly operation: CrmLeadDetailOperation;
  readonly allowed: boolean;
  readonly reason: CrmLeadDetailReason;
  readonly actorSubject: string | null;
  readonly leadId: CrmId | null;
}

export interface CrmLeadDetailAuditPort {
  readonly record: (event: CrmLeadDetailAuditEvent) => Promise<void>;
}

export interface CrmLeadDetailChecklistRecord {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly step: CrmChecklistStep;
  readonly completed: boolean;
  readonly completedAt: Date | null;
  readonly completedBySubject: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface CrmLeadDetailInteractionRecord {
  readonly id: CrmId;
  readonly leadId: CrmId;
  readonly type: CrmInteractionType;
  readonly content: string;
  readonly metadata: unknown;
  readonly actorSubject: string;
  readonly createdAt: Date;
}

export interface CrmLeadDetailChecklistItem {
  readonly id: CrmId | null;
  readonly leadId: CrmId;
  readonly step: CrmChecklistStep;
  readonly label: string;
  readonly description: string;
  readonly completed: boolean;
  readonly completedAt: Date | null;
  readonly completedBySubject: string | null;
  readonly notes: string | null;
}

export interface CrmLeadDetailSnapshot {
  readonly lead: CrmLead;
  readonly checklist: readonly CrmLeadDetailChecklistItem[];
  readonly interactions: readonly CrmLeadDetailInteractionRecord[];
}

export interface CrmLeadDetailRepository {
  readonly findLeadById: (id: CrmId) => Promise<CrmLead | null>;
  readonly listChecklist: (
    leadId: CrmId,
  ) => Promise<readonly CrmLeadDetailChecklistRecord[]>;
  readonly findChecklistItemById: (
    id: CrmId,
  ) => Promise<CrmLeadDetailChecklistRecord | null>;
  readonly setChecklistCompletion: (input: {
    readonly id: CrmId;
    readonly leadId: CrmId;
    readonly completed: boolean;
    readonly completedAt: Date | null;
    readonly completedBySubject: string | null;
  }) => Promise<CrmLeadDetailChecklistRecord | null>;
  readonly listInteractions: (
    leadId: CrmId,
  ) => Promise<readonly CrmLeadDetailInteractionRecord[]>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly type: CrmInteractionType;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }) => Promise<void>;
  readonly touchLeadLastContactAt: (
    leadId: CrmId,
    lastContactAt: Date,
  ) => Promise<void>;
}

export type CrmLeadDetailBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmLeadDetailReason };

function safeContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized.length >= 1 && normalized.length <= 4000
    ? normalized
    : null;
}

export class CrmLeadDetailServerBoundary {
  constructor(
    private readonly repository: CrmLeadDetailRepository,
    private readonly audit: CrmLeadDetailAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmLeadDetailOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    leadId: CrmId | null,
  ): Promise<CrmLeadDetailBoundaryResult<true>> {
    const decision = authorizeCrmAccess(session, {
      mutation,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (decision.allowed) return { ok: true, value: true };
    await this.audit.record({
      operation,
      allowed: false,
      reason: decision.reason,
      actorSubject: session?.subject ?? null,
      leadId,
    });
    return { ok: false, reason: decision.reason };
  }

  private async reject(
    operation: CrmLeadDetailOperation,
    session: AuthSessionIdentity | null,
    reason: "invalid_input" | "not_found",
    leadId: CrmId | null,
  ): Promise<CrmLeadDetailBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      leadId,
    });
    return { ok: false, reason };
  }

  async get(
    session: AuthSessionIdentity | null,
    idValue: unknown,
  ): Promise<CrmLeadDetailBoundaryResult<CrmLeadDetailSnapshot>> {
    const id = normalizeCrmId(
      typeof idValue === "string" && /^\d+$/u.test(idValue)
        ? Number(idValue)
        : idValue,
    );
    const auth = await this.authorize("lead.detail", session, false, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("lead.detail", session, "invalid_input", null);

    const lead = await this.repository.findLeadById(id);
    if (!lead) return this.reject("lead.detail", session, "not_found", id);

    const [persistedChecklist, interactions] = await Promise.all([
      this.repository.listChecklist(id),
      this.repository.listInteractions(id),
    ]);
    const byStep = new Map(
      persistedChecklist.map((item) => [item.step, item] as const),
    );
    const checklist = crmLeadDetailChecklist.map((definition) => {
      const item = byStep.get(definition.step);
      return Object.freeze({
        id: item?.id ?? null,
        leadId: id,
        step: definition.step,
        label: definition.label,
        description: definition.description,
        completed: item?.completed ?? false,
        completedAt: item?.completedAt ?? null,
        completedBySubject: item?.completedBySubject ?? null,
        notes: item?.notes ?? null,
      });
    });

    return {
      ok: true,
      value: Object.freeze({ lead, checklist, interactions }),
    };
  }

  async toggleChecklist(
    session: AuthSessionIdentity | null,
    input: {
      readonly leadId?: unknown;
      readonly id?: unknown;
      readonly completed?: unknown;
    },
  ): Promise<CrmLeadDetailBoundaryResult<CrmLeadDetailChecklistRecord>> {
    const leadId = normalizeCrmId(
      typeof input.leadId === "string" && /^\d+$/u.test(input.leadId)
        ? Number(input.leadId)
        : input.leadId,
    );
    const auth = await this.authorize(
      "lead.checklist_toggle",
      session,
      true,
      leadId,
    );
    if (!auth.ok) return auth;
    if (!session) {
      return this.reject(
        "lead.checklist_toggle",
        session,
        "invalid_input",
        leadId,
      );
    }
    const id = normalizeCrmId(
      typeof input.id === "string" && /^\d+$/u.test(input.id)
        ? Number(input.id)
        : input.id,
    );
    if (!leadId || !id || typeof input.completed !== "boolean") {
      return this.reject(
        "lead.checklist_toggle",
        session,
        "invalid_input",
        leadId,
      );
    }

    const [lead, item] = await Promise.all([
      this.repository.findLeadById(leadId),
      this.repository.findChecklistItemById(id),
    ]);
    if (!lead || !item || item.leadId !== leadId) {
      return this.reject(
        "lead.checklist_toggle",
        session,
        "not_found",
        leadId,
      );
    }

    const completedAt = input.completed ? this.now() : null;
    const updated = await this.repository.setChecklistCompletion({
      id,
      leadId,
      completed: input.completed,
      completedAt,
      completedBySubject: input.completed ? session.subject : null,
    });
    if (!updated) {
      return this.reject(
        "lead.checklist_toggle",
        session,
        "not_found",
        leadId,
      );
    }
    await this.repository.appendInteraction({
      leadId,
      type: "system",
      content: `Checklist: etapa ${input.completed ? "concluída" : "desmarcada"}`,
      actorSubject: session.subject,
    });
    return { ok: true, value: updated };
  }

  async addInteraction(
    session: AuthSessionIdentity | null,
    input: {
      readonly leadId?: unknown;
      readonly type?: unknown;
      readonly content?: unknown;
    },
  ): Promise<CrmLeadDetailBoundaryResult<true>> {
    const leadId = normalizeCrmId(
      typeof input.leadId === "string" && /^\d+$/u.test(input.leadId)
        ? Number(input.leadId)
        : input.leadId,
    );
    const auth = await this.authorize(
      "lead.interaction_add",
      session,
      true,
      leadId,
    );
    if (!auth.ok) return auth;
    if (!session) {
      return this.reject(
        "lead.interaction_add",
        session,
        "invalid_input",
        leadId,
      );
    }
    const content = safeContent(input.content);
    if (
      !leadId ||
      !isCrmLeadDetailManualInteractionType(input.type) ||
      !content
    ) {
      return this.reject(
        "lead.interaction_add",
        session,
        "invalid_input",
        leadId,
      );
    }
    const lead = await this.repository.findLeadById(leadId);
    if (!lead) {
      return this.reject(
        "lead.interaction_add",
        session,
        "not_found",
        leadId,
      );
    }

    const timestamp = this.now();
    await this.repository.appendInteraction({
      leadId,
      type: input.type as CrmLeadDetailManualInteractionType,
      content,
      actorSubject: session.subject,
    });
    await this.repository.touchLeadLastContactAt(leadId, timestamp);
    return { ok: true, value: true };
  }
}
