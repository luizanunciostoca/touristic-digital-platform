import type { AuthSessionIdentity } from "@touristic/auth";

import {
  crmProposalStatuses,
  normalizeCrmId,
  type CrmId,
  type CrmLeadStage,
  type CrmMoney,
  type CrmProposal,
  type CrmProposalStatus,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmProposalBoundaryOperation =
  | "proposal.list"
  | "proposal.create"
  | "proposal.send"
  | "proposal.respond"
  | "proposal.get_accepted";

export type CrmProposalBoundaryReason =
  | CrmAuthorizationReason
  | "invalid_input"
  | "not_found"
  | "invalid_transition"
  | "expired";

export interface CrmProposalAuditEvent {
  readonly operation: CrmProposalBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmProposalBoundaryReason;
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
  readonly status?: CrmProposalStatus;
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
    stage: CrmLeadStage,
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
  | { readonly ok: false; readonly reason: CrmProposalBoundaryReason };

export type CrmProposalTokenFactory = () => string;

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

function safeRequiredText(value: unknown, maxLength: number): string | null {
  const text = safeText(value, maxLength);
  return typeof text === "string" && text.length > 0 ? text : null;
}

function safeMoney(value: unknown): CrmMoney | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return null;
  return normalized;
}

function safeOptionalMoney(value: unknown): CrmMoney | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  return safeMoney(value) ?? undefined;
}

function safeDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function safeTrialDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  if (!Number.isSafeInteger(value) || typeof value !== "number") return null;
  if (value < 0 || value > 365) return null;
  return value;
}

function safeFeatures(value: unknown): readonly string[] | null | undefined {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 30) return undefined;
  const normalized: string[] = [];
  for (const item of value) {
    const feature = safeRequiredText(item, 240);
    if (!feature) return undefined;
    normalized.push(feature);
  }
  return Object.freeze(normalized);
}

function isProposalStatus(value: unknown): value is CrmProposalStatus {
  return (
    typeof value === "string" &&
    (crmProposalStatuses as readonly string[]).includes(value)
  );
}

function isFinalStatus(status: CrmProposalStatus): boolean {
  return status === "accepted" || status === "rejected";
}

export class CrmProposalServerBoundary {
  constructor(
    private readonly repository: CrmProposalBoundaryRepository,
    private readonly audit: CrmProposalAuditPort,
    private readonly tokenFactory: CrmProposalTokenFactory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmProposalBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    proposalId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmProposalBoundaryResult<true>> {
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
        proposalId,
        leadId,
      });
      return { ok: false, reason: auth.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmProposalBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: Exclude<CrmProposalBoundaryReason, CrmAuthorizationReason>,
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
    return { ok: true, value: await this.repository.list(leadId ?? undefined) };
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
      value:
        proposals.find((proposal) => proposal.status === "accepted") ?? null,
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

    const title = safeRequiredText(input.title, 180);
    const monthlyValue = safeMoney(input.monthlyValue);
    const setupFee = safeOptionalMoney(input.setupFee);
    const trialDays = safeTrialDays(input.trialDays);
    const features = safeFeatures(input.features);
    const validUntil = safeDate(input.validUntil);
    const planName =
      input.planName === undefined ? null : safeText(input.planName, 120);
    const customMessage =
      input.customMessage === undefined
        ? null
        : safeText(input.customMessage, 4000);
    const shareToken = this.tokenFactory().trim();

    if (
      !session ||
      !leadId ||
      !title ||
      !monthlyValue ||
      setupFee === undefined ||
      trialDays === null ||
      features === undefined ||
      validUntil === undefined ||
      planName === undefined ||
      customMessage === undefined ||
      !/^[A-Za-z0-9_-]{16,64}$/u.test(shareToken)
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
      metadata: { proposalId: String(proposal.id), status: "draft" },
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
    if (!id) return this.reject("proposal.send", session, "invalid_input");

    const proposal = await this.repository.findById(id);
    if (!proposal)
      return this.reject("proposal.send", session, "not_found", id);
    if (!isProposalStatus(proposal.status) || proposal.status !== "draft") {
      return this.reject(
        "proposal.send",
        session,
        "invalid_transition",
        id,
        proposal.leadId,
      );
    }
    if (
      proposal.validUntil &&
      proposal.validUntil.getTime() < this.now().getTime()
    ) {
      return this.reject(
        "proposal.send",
        session,
        "expired",
        id,
        proposal.leadId,
      );
    }

    const sentAt = this.now();
    const updated = await this.repository.update(id, {
      status: "sent",
      sentAt,
    });
    await this.repository.appendInteraction({
      leadId: proposal.leadId,
      content: "Proposta enviada ao cliente",
      actorSubject: session?.subject ?? "",
      metadata: { proposalId: String(id), status: "sent" },
    });
    return { ok: true, value: updated };
  }

  async respond(
    session: AuthSessionIdentity | null,
    input: CrmProposalRespondInput,
  ): Promise<CrmProposalBoundaryResult<CrmProposal>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("proposal.respond", session, true, id);
    if (!auth.ok) return auth;
    if (!id || typeof input.accepted !== "boolean") {
      return this.reject("proposal.respond", session, "invalid_input", id);
    }

    const proposal = await this.repository.findById(id);
    if (!proposal)
      return this.reject("proposal.respond", session, "not_found", id);
    if (
      isFinalStatus(proposal.status) ||
      !["sent", "viewed"].includes(proposal.status)
    ) {
      return this.reject(
        "proposal.respond",
        session,
        "invalid_transition",
        id,
        proposal.leadId,
      );
    }
    if (
      proposal.validUntil &&
      proposal.validUntil.getTime() < this.now().getTime()
    ) {
      return this.reject(
        "proposal.respond",
        session,
        "expired",
        id,
        proposal.leadId,
      );
    }

    const status: CrmProposalStatus = input.accepted ? "accepted" : "rejected";
    const updated = await this.repository.update(id, {
      status,
      respondedAt: this.now(),
    });
    if (input.accepted) {
      await this.repository.updateLeadStage(proposal.leadId, "contract_sent");
    }
    await this.repository.appendInteraction({
      leadId: proposal.leadId,
      content: `Proposta ${input.accepted ? "aceita" : "recusada"} pelo cliente`,
      actorSubject: session?.subject ?? "",
      metadata: { proposalId: String(id), status },
    });
    return { ok: true, value: updated };
  }
}
