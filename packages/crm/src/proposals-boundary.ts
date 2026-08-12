import type { AuthSessionIdentity } from "@touristic/auth";

import {
  normalizeCrmId,
  type CrmId,
  type CrmMoney,
  type CrmProposal,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmProposalBoundaryOperation =
  | "proposal.list"
  | "proposal.create"
  | "proposal.send"
  | "proposal.get_accepted"
  | "proposal.respond";

export interface CrmProposalAuditEvent {
  readonly operation: CrmProposalBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmAuthorizationReason | "invalid_input" | "not_found";
  readonly actorSubject: string | null;
  readonly proposalId: CrmId | null;
  readonly leadId: CrmId | null;
}

export interface CrmProposalAuditPort {
  readonly record: (event: CrmProposalAuditEvent) => Promise<void>;
}

export interface CrmProposalCreateInput {
  readonly leadId: unknown;
  readonly title: unknown;
  readonly planName?: unknown;
  readonly monthlyValue: unknown;
  readonly setupFee?: unknown;
  readonly trialDays?: unknown;
  readonly features?: unknown;
  readonly customMessage?: unknown;
  readonly validUntil?: unknown;
}

export interface CrmProposalSendInput {
  readonly id: unknown;
}

export interface CrmProposalRespondInput {
  readonly id: unknown;
  readonly accepted: unknown;
}

export interface CrmProposalCreateRecord {
  readonly leadId: CrmId;
  readonly title: string;
  readonly planName: string | null;
  readonly monthlyValue: CrmMoney;
  readonly setupFee: CrmMoney | null;
  readonly trialDays: number;
  readonly features: readonly string[] | null;
  readonly customMessage: string | null;
  readonly shareToken: string;
  readonly status: "draft";
  readonly validUntil: Date | null;
  readonly createdBySubject: string;
}

export interface CrmProposalUpdateRecord {
  readonly status?: "sent" | "accepted" | "rejected";
  readonly sentAt?: Date;
  readonly respondedAt?: Date;
}

export interface CrmProposalBoundaryRepository {
  readonly list: (leadId?: CrmId) => Promise<readonly CrmProposal[]>;
  readonly findById: (id: CrmId) => Promise<CrmProposal | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly create: (record: CrmProposalCreateRecord) => Promise<CrmProposal>;
  readonly update: (
    id: CrmId,
    patch: CrmProposalUpdateRecord,
  ) => Promise<CrmProposal>;
  readonly updateLeadStage: (
    leadId: CrmId,
    stage: "contract_sent",
  ) => Promise<void>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }) => Promise<void>;
}

export type CrmProposalBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: CrmAuthorizationReason | "invalid_input" | "not_found";
    };

function safeText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null || value === "") return null;
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

function requiredText(value: unknown, maxLength: number): string | null {
  const normalized = safeText(value, maxLength);
  return typeof normalized === "string" && normalized.length > 0
    ? normalized
    : null;
}

function safeMoney(value: unknown, required: boolean): CrmMoney | null | undefined {
  if (value === null || value === "") return required ? undefined : null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return undefined;
  return normalized;
}

function safeDate(value: unknown): Date | null | undefined {
  if (value === null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function safeFeatures(value: unknown): readonly string[] | null | undefined {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 64) return undefined;
  const normalized: string[] = [];
  for (const item of value) {
    const feature = requiredText(item, 240);
    if (!feature) return undefined;
    normalized.push(feature);
  }
  return Object.freeze(normalized);
}

export class CrmProposalServerBoundary {
  constructor(
    private readonly repository: CrmProposalBoundaryRepository,
    private readonly audit: CrmProposalAuditPort,
    private readonly createShareToken: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmProposalBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    proposalId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmProposalBoundaryResult<true>> {
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
        proposalId,
        leadId,
      });
      return { ok: false, reason: authorization.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmProposalBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: "invalid_input" | "not_found",
    proposalId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmProposalBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      proposalId,
      leadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    leadIdValue?: unknown,
  ): Promise<CrmProposalBoundaryResult<readonly CrmProposal[]>> {
    const leadId =
      leadIdValue === undefined ? undefined : normalizeCrmId(leadIdValue);
    const auth = await this.authorize(
      "proposal.list",
      session,
      false,
      null,
      leadId ?? null,
    );
    if (!auth.ok) return auth;
    if (leadIdValue !== undefined && !leadId) {
      return this.reject("proposal.list", session, "invalid_input");
    }
    return { ok: true, value: await this.repository.list(leadId) };
  }

  async getAccepted(
    session: AuthSessionIdentity | null,
    leadIdValue: unknown,
  ): Promise<CrmProposalBoundaryResult<CrmProposal | null>> {
    const leadId = normalizeCrmId(leadIdValue);
    const auth = await this.authorize(
      "proposal.get_accepted",
      session,
      false,
      null,
      leadId,
    );
    if (!auth.ok) return auth;
    if (!leadId) {
      return this.reject("proposal.get_accepted", session, "invalid_input");
    }
    const proposals = await this.repository.list(leadId);
    return {
      ok: true,
      value: proposals.find((proposal) => proposal.status === "accepted") ?? null,
    };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmProposalCreateInput,
  ): Promise<CrmProposalBoundaryResult<CrmProposal>> {
    const leadId = normalizeCrmId(input.leadId);
    const auth = await this.authorize(
      "proposal.create",
      session,
      true,
      null,
      leadId,
    );
    if (!auth.ok) return auth;

    const title = requiredText(input.title, 255);
    const monthlyValue = safeMoney(input.monthlyValue, true);
    const planName =
      input.planName === undefined ? null : safeText(input.planName, 100);
    const setupFee =
      input.setupFee === undefined ? null : safeMoney(input.setupFee, false);
    const features = safeFeatures(input.features);
    const customMessage =
      input.customMessage === undefined
        ? null
        : safeText(input.customMessage, 8000);
    const validUntil =
      input.validUntil === undefined ? null : safeDate(input.validUntil);
    const trialDays = input.trialDays === undefined ? 0 : input.trialDays;
    const shareToken = this.createShareToken();

    if (
      !session ||
      !leadId ||
      !title ||
      typeof monthlyValue !== "string" ||
      planName === undefined ||
      setupFee === undefined ||
      features === undefined ||
      customMessage === undefined ||
      validUntil === undefined ||
      typeof trialDays !== "number" ||
      !Number.isSafeInteger(trialDays) ||
      trialDays < 0 ||
      trialDays > 3650 ||
      typeof shareToken !== "string" ||
      !/^[A-Za-z0-9_-]{32,64}$/u.test(shareToken)
    ) {
      return this.reject(
        "proposal.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }
    if (!(await this.repository.leadExists(leadId))) {
      return this.reject("proposal.create", session, "not_found", null, leadId);
    }

    const proposal = await this.repository.create({
      leadId,
      title,
      planName,
      monthlyValue,
      setupFee,
      trialDays,
      features,
      customMessage,
      shareToken,
      status: "draft",
      validUntil,
      createdBySubject: session.subject,
    });
    await this.repository.appendInteraction({
      leadId,
      content: `Proposta "${title}" criada — R$ ${monthlyValue}/mês`,
      actorSubject: session.subject,
      metadata: { proposalId: String(proposal.id) },
    });
    return { ok: true, value: proposal };
  }

  async send(
    session: AuthSessionIdentity | null,
    input: CrmProposalSendInput,
  ): Promise<CrmProposalBoundaryResult<CrmProposal>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("proposal.send", session, true, id);
    if (!auth.ok) return auth;
    if (!id || !session) {
      return this.reject("proposal.send", session, "invalid_input");
    }
    const existing = await this.repository.findById(id);
    if (!existing) return this.reject("proposal.send", session, "not_found", id);

    const proposal = await this.repository.update(id, {
      status: "sent",
      sentAt: this.now(),
    });
    await this.repository.appendInteraction({
      leadId: existing.leadId,
      content: "Proposta enviada ao cliente",
      actorSubject: session.subject,
      metadata: { proposalId: String(id) },
    });
    return { ok: true, value: proposal };
  }

  async respond(
    session: AuthSessionIdentity | null,
    input: CrmProposalRespondInput,
  ): Promise<CrmProposalBoundaryResult<CrmProposal>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("proposal.respond", session, true, id);
    if (!auth.ok) return auth;
    if (!id || !session || typeof input.accepted !== "boolean") {
      return this.reject("proposal.respond", session, "invalid_input", id);
    }
    const existing = await this.repository.findById(id);
    if (!existing) {
      return this.reject("proposal.respond", session, "not_found", id);
    }

    const proposal = await this.repository.update(id, {
      status: input.accepted ? "accepted" : "rejected",
      respondedAt: this.now(),
    });
    if (input.accepted) {
      await this.repository.updateLeadStage(existing.leadId, "contract_sent");
    }
    await this.repository.appendInteraction({
      leadId: existing.leadId,
      content: `Proposta ${input.accepted ? "aceita" : "recusada"} pelo cliente`,
      actorSubject: session.subject,
      metadata: { proposalId: String(id) },
    });
    return { ok: true, value: proposal };
  }
}
