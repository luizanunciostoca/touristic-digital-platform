import type { AuthSessionIdentity } from "@touristic/auth";

import {
  crmLeadStatuses,
  isCrmLeadStage,
  normalizeCrmId,
  type CrmId,
  type CrmLead,
  type CrmLeadQuery,
  type CrmLeadStage,
  type CrmLeadStatus,
  type CrmMoney,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmLeadBoundaryOperation =
  | "lead.list"
  | "lead.get"
  | "lead.create"
  | "lead.update"
  | "lead.update_stage"
  | "lead.delete";

export interface CrmLeadAuditEvent {
  readonly operation: CrmLeadBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmAuthorizationReason | "invalid_input" | "not_found";
  readonly actorSubject: string | null;
  readonly leadId: CrmId | null;
}

export interface CrmLeadAuditPort {
  readonly record: (event: CrmLeadAuditEvent) => Promise<void>;
}

export interface CrmLeadCreateInput {
  readonly companyName: unknown;
  readonly segment?: unknown;
  readonly contactName?: unknown;
  readonly phone?: unknown;
  readonly whatsapp?: unknown;
  readonly email?: unknown;
  readonly address?: unknown;
  readonly website?: unknown;
  readonly notes?: unknown;
  readonly source?: unknown;
  readonly monthlyValue?: unknown;
}

export interface CrmLeadUpdateInput extends Partial<CrmLeadCreateInput> {
  readonly id: unknown;
  readonly status?: unknown;
}

export interface CrmLeadStageInput {
  readonly id: unknown;
  readonly stage: unknown;
}

export interface CrmLeadDeleteInput {
  readonly id: unknown;
}

export interface CrmLeadCreateRecord {
  readonly companyName: string;
  readonly segment?: string;
  readonly contactName?: string;
  readonly phone?: string;
  readonly whatsapp?: string;
  readonly email?: string;
  readonly address?: string;
  readonly website?: string;
  readonly notes?: string;
  readonly source?: string;
  readonly monthlyValue?: CrmMoney;
  readonly assignedToSubject: string;
  readonly stage: "new_lead";
  readonly status: "active";
}

export interface CrmLeadUpdateRecord {
  readonly companyName?: string;
  readonly segment?: string;
  readonly contactName?: string;
  readonly phone?: string;
  readonly whatsapp?: string;
  readonly email?: string;
  readonly address?: string;
  readonly website?: string;
  readonly notes?: string;
  readonly source?: string;
  readonly monthlyValue?: CrmMoney;
  readonly status?: CrmLeadStatus;
}

export interface CrmLeadBoundaryRepository {
  readonly list: (query?: CrmLeadQuery) => Promise<readonly CrmLead[]>;
  readonly findById: (id: CrmId) => Promise<CrmLead | null>;
  readonly create: (record: CrmLeadCreateRecord) => Promise<CrmLead>;
  readonly update: (id: CrmId, patch: CrmLeadUpdateRecord) => Promise<CrmLead>;
  readonly updateStage: (
    id: CrmId,
    stage: CrmLeadStage,
    lastContactAt: Date,
  ) => Promise<CrmLead>;
  readonly delete: (id: CrmId) => Promise<void>;
  readonly initializeChecklist: (leadId: CrmId) => Promise<void>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly type: "system" | "stage_change";
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }) => Promise<void>;
}

export type CrmLeadBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | CrmAuthorizationReason
        | "invalid_input"
        | "not_found";
    };

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function safeEmail(value: unknown): string | undefined {
  const email = safeText(value, 160)?.toLowerCase();
  if (!email) return undefined;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function safeMoney(value: unknown): CrmMoney | undefined {
  const money = safeText(value, 40);
  if (!money) return undefined;
  return /^\d+(?:\.\d{1,2})?$/.test(money) ? money : undefined;
}

function isLeadStatus(value: unknown): value is CrmLeadStatus {
  return (
    typeof value === "string" &&
    (crmLeadStatuses as readonly string[]).includes(value)
  );
}

function normalizeQuery(value: unknown): CrmLeadQuery | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const stage = input.stage === undefined ? undefined : input.stage;
  const status = input.status === undefined ? undefined : input.status;
  const search = input.search === undefined ? undefined : safeText(input.search, 120);
  const limit = input.limit === undefined ? undefined : input.limit;
  const offset = input.offset === undefined ? undefined : input.offset;

  if (stage !== undefined && !isCrmLeadStage(stage)) return undefined;
  if (status !== undefined && !isLeadStatus(status)) return undefined;
  if (input.search !== undefined && !search) return undefined;
  if (
    limit !== undefined &&
    (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 200)
  ) {
    return undefined;
  }
  if (
    offset !== undefined &&
    (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0)
  ) {
    return undefined;
  }

  return Object.freeze({
    ...(stage !== undefined ? { stage } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(search !== undefined ? { search } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  });
}

function normalizeCreate(input: CrmLeadCreateInput): CrmLeadCreateRecord | null {
  const companyName = safeText(input.companyName, 160);
  if (!companyName) return null;

  const optionalEmail = input.email === undefined || input.email === "" ? undefined : safeEmail(input.email);
  if (input.email !== undefined && input.email !== "" && !optionalEmail) return null;
  const monthlyValue = input.monthlyValue === undefined || input.monthlyValue === "" ? undefined : safeMoney(input.monthlyValue);
  if (input.monthlyValue !== undefined && input.monthlyValue !== "" && !monthlyValue) return null;

  return {
    companyName,
    ...(safeText(input.segment, 120) ? { segment: safeText(input.segment, 120) } : {}),
    ...(safeText(input.contactName, 160) ? { contactName: safeText(input.contactName, 160) } : {}),
    ...(safeText(input.phone, 80) ? { phone: safeText(input.phone, 80) } : {}),
    ...(safeText(input.whatsapp, 80) ? { whatsapp: safeText(input.whatsapp, 80) } : {}),
    ...(optionalEmail ? { email: optionalEmail } : {}),
    ...(safeText(input.address, 240) ? { address: safeText(input.address, 240) } : {}),
    ...(safeText(input.website, 240) ? { website: safeText(input.website, 240) } : {}),
    ...(safeText(input.notes, 4000) ? { notes: safeText(input.notes, 4000) } : {}),
    ...(safeText(input.source, 160) ? { source: safeText(input.source, 160) } : {}),
    ...(monthlyValue ? { monthlyValue } : {}),
    assignedToSubject: "",
    stage: "new_lead",
    status: "active",
  };
}

function normalizeUpdate(input: CrmLeadUpdateInput): CrmLeadUpdateRecord | null {
  const patch: Record<string, unknown> = {};
  const textFields = [
    ["companyName", 160],
    ["segment", 120],
    ["contactName", 160],
    ["phone", 80],
    ["whatsapp", 80],
    ["address", 240],
    ["website", 240],
    ["notes", 4000],
    ["source", 160],
  ] as const;

  for (const [field, maxLength] of textFields) {
    if (input[field] === undefined) continue;
    const normalized = safeText(input[field], maxLength);
    if (!normalized) return null;
    patch[field] = normalized;
  }

  if (input.email !== undefined) {
    const email = input.email === "" ? "" : safeEmail(input.email);
    if (email === undefined) return null;
    patch.email = email;
  }
  if (input.monthlyValue !== undefined) {
    const monthlyValue = input.monthlyValue === "" ? "" : safeMoney(input.monthlyValue);
    if (monthlyValue === undefined) return null;
    patch.monthlyValue = monthlyValue;
  }
  if (input.status !== undefined) {
    if (!isLeadStatus(input.status)) return null;
    patch.status = input.status;
  }

  return Object.keys(patch).length > 0 ? (patch as CrmLeadUpdateRecord) : null;
}

export class CrmLeadServerBoundary {
  constructor(
    private readonly repository: CrmLeadBoundaryRepository,
    private readonly audit: CrmLeadAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmLeadBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    leadId: CrmId | null = null,
  ): Promise<CrmLeadBoundaryResult<true>> {
    const auth = authorizeCrmAccess(session, {
      mutation,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (!auth.allowed) {
      await this.audit.record({
        operation,
        allowed: false,
        reason: auth.reason,
        actorSubject: session?.subject ?? null,
        leadId,
      });
      return { ok: false, reason: auth.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmLeadBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: "invalid_input" | "not_found",
    leadId: CrmId | null = null,
  ): Promise<CrmLeadBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      leadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    query?: unknown,
  ): Promise<CrmLeadBoundaryResult<readonly CrmLead[]>> {
    const auth = await this.authorize("lead.list", session, false);
    if (!auth.ok) return auth;
    const normalized = normalizeQuery(query);
    if (query !== undefined && normalized === undefined) {
      return this.reject("lead.list", session, "invalid_input");
    }
    return { ok: true, value: await this.repository.list(normalized) };
  }

  async get(
    session: AuthSessionIdentity | null,
    idValue: unknown,
  ): Promise<CrmLeadBoundaryResult<CrmLead>> {
    const id = normalizeCrmId(idValue);
    const auth = await this.authorize("lead.get", session, false, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("lead.get", session, "invalid_input");
    const lead = await this.repository.findById(id);
    if (!lead) return this.reject("lead.get", session, "not_found", id);
    return { ok: true, value: lead };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmLeadCreateInput,
  ): Promise<CrmLeadBoundaryResult<CrmLead>> {
    const auth = await this.authorize("lead.create", session, true);
    if (!auth.ok) return auth;
    const normalized = normalizeCreate(input);
    if (!normalized || !session) {
      return this.reject("lead.create", session, "invalid_input");
    }
    const lead = await this.repository.create({
      ...normalized,
      assignedToSubject: session.subject,
    });
    await this.repository.initializeChecklist(lead.id);
    await this.repository.appendInteraction({
      leadId: lead.id,
      type: "system",
      content: "Lead cadastrado no sistema",
      actorSubject: session.subject,
    });
    return { ok: true, value: lead };
  }

  async update(
    session: AuthSessionIdentity | null,
    input: CrmLeadUpdateInput,
  ): Promise<CrmLeadBoundaryResult<CrmLead>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("lead.update", session, true, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("lead.update", session, "invalid_input");
    const patch = normalizeUpdate(input);
    if (!patch) return this.reject("lead.update", session, "invalid_input", id);
    if (!(await this.repository.findById(id))) {
      return this.reject("lead.update", session, "not_found", id);
    }
    return { ok: true, value: await this.repository.update(id, patch) };
  }

  async updateStage(
    session: AuthSessionIdentity | null,
    input: CrmLeadStageInput,
  ): Promise<CrmLeadBoundaryResult<CrmLead>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("lead.update_stage", session, true, id);
    if (!auth.ok) return auth;
    if (!id || !isCrmLeadStage(input.stage)) {
      return this.reject("lead.update_stage", session, "invalid_input", id);
    }
    const existing = await this.repository.findById(id);
    if (!existing) return this.reject("lead.update_stage", session, "not_found", id);
    const updated = await this.repository.updateStage(id, input.stage, this.now());
    await this.repository.appendInteraction({
      leadId: id,
      type: "stage_change",
      content: `Etapa alterada de "${existing.stage}" para "${input.stage}"`,
      actorSubject: session?.subject ?? "",
      metadata: { from: existing.stage, to: input.stage },
    });
    return { ok: true, value: updated };
  }

  async delete(
    session: AuthSessionIdentity | null,
    input: CrmLeadDeleteInput,
  ): Promise<CrmLeadBoundaryResult<true>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("lead.delete", session, true, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("lead.delete", session, "invalid_input");
    if (!(await this.repository.findById(id))) {
      return this.reject("lead.delete", session, "not_found", id);
    }
    await this.repository.delete(id);
    return { ok: true, value: true };
  }
}
