import type { CrmId, CrmLeadStage, CrmProposal } from "./index.js";

export type CrmProposalPublicReason =
  | "invalid_token"
  | "not_found"
  | "invalid_input"
  | "invalid_transition"
  | "expired";

export type CrmProposalPublicResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmProposalPublicReason };

export interface CrmProposalPublicView {
  readonly title: string;
  readonly planName: string | null;
  readonly monthlyValue: string;
  readonly setupFee: string | null;
  readonly trialDays: number;
  readonly features: unknown;
  readonly customMessage: string | null;
  readonly pdfUrl: string | null;
  readonly status: CrmProposal["status"];
  readonly sentAt: Date | null;
  readonly viewedAt: Date | null;
  readonly respondedAt: Date | null;
  readonly validUntil: Date | null;
}

export interface CrmProposalPublicRespondInput {
  readonly token: unknown;
  readonly accepted: unknown;
  readonly respondentName?: unknown;
}

export interface CrmProposalPublicRespondRecord {
  readonly token: string;
  readonly status: "accepted" | "rejected";
  readonly respondedAt: Date;
}

export interface CrmProposalPublicRepository {
  readonly findByShareToken: (token: string) => Promise<CrmProposal | null>;
  readonly markViewedByToken: (
    token: string,
    viewedAt: Date,
  ) => Promise<CrmProposal | null>;
  readonly respondActiveByToken: (
    record: CrmProposalPublicRespondRecord,
  ) => Promise<CrmProposal | null>;
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

function safeToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  return /^[A-Za-z0-9_-]{16,64}$/u.test(token) ? token : null;
}

function safeOptionalText(value: unknown, maxLength: number): string | null | undefined {
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

function publicView(proposal: CrmProposal): CrmProposalPublicView {
  return Object.freeze({
    title: proposal.title,
    planName: proposal.planName,
    monthlyValue: proposal.monthlyValue,
    setupFee: proposal.setupFee,
    trialDays: proposal.trialDays,
    features: proposal.features,
    customMessage: proposal.customMessage,
    pdfUrl: proposal.pdfUrl,
    status: proposal.status,
    sentAt: proposal.sentAt,
    viewedAt: proposal.viewedAt,
    respondedAt: proposal.respondedAt,
    validUntil: proposal.validUntil,
  });
}

function isExpired(proposal: CrmProposal, now: Date): boolean {
  return Boolean(proposal.validUntil && proposal.validUntil.getTime() < now.getTime());
}

export class CrmProposalPublicBoundary {
  constructor(
    private readonly repository: CrmProposalPublicRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async view(
    tokenValue: unknown,
  ): Promise<CrmProposalPublicResult<CrmProposalPublicView>> {
    const token = safeToken(tokenValue);
    if (!token) return { ok: false, reason: "invalid_token" };

    const proposal = await this.repository.findByShareToken(token);
    if (!proposal) return { ok: false, reason: "not_found" };
    if (proposal.status !== "sent") {
      return { ok: true, value: publicView(proposal) };
    }

    const viewed = await this.repository.markViewedByToken(token, this.now());
    return viewed
      ? { ok: true, value: publicView(viewed) }
      : { ok: false, reason: "not_found" };
  }

  async respond(
    input: CrmProposalPublicRespondInput,
  ): Promise<CrmProposalPublicResult<CrmProposalPublicView>> {
    const token = safeToken(input.token);
    if (!token) return { ok: false, reason: "invalid_token" };
    if (typeof input.accepted !== "boolean") {
      return { ok: false, reason: "invalid_input" };
    }
    const respondentName = safeOptionalText(input.respondentName, 180);
    if (respondentName === undefined) {
      return { ok: false, reason: "invalid_input" };
    }

    const proposal = await this.repository.findByShareToken(token);
    if (!proposal) return { ok: false, reason: "not_found" };
    if (proposal.status === "accepted" || proposal.status === "rejected") {
      return { ok: false, reason: "invalid_transition" };
    }
    if (proposal.status !== "sent" && proposal.status !== "viewed") {
      return { ok: false, reason: "invalid_transition" };
    }

    const respondedAt = this.now();
    if (isExpired(proposal, respondedAt)) {
      return { ok: false, reason: "expired" };
    }

    const status = input.accepted ? "accepted" : "rejected";
    const updated = await this.repository.respondActiveByToken({
      token,
      status,
      respondedAt,
    });
    if (!updated) return { ok: false, reason: "invalid_transition" };

    if (input.accepted) {
      await this.repository.updateLeadStage(updated.leadId, "contract_sent");
    }
    await this.repository.appendInteraction({
      leadId: updated.leadId,
      content: `Proposta ${input.accepted ? "aceita" : "recusada"} pelo cliente${respondentName ? ` (${respondentName})` : ""} via link público`,
      actorSubject: "public-proposal-token",
      metadata: {
        proposalId: String(updated.id),
        status,
        ...(respondentName ? { respondentName } : {}),
      },
    });
    return { ok: true, value: publicView(updated) };
  }
}
