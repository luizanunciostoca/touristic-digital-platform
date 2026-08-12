import type { AuthSessionIdentity } from "@touristic/auth";

import {
  crmContractStatuses,
  normalizeCrmId,
  type CrmContract,
  type CrmContractStatus,
  type CrmId,
  type CrmLeadStage,
  type CrmMoney,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmContractBoundaryOperation =
  | "contract.list"
  | "contract.create"
  | "contract.send"
  | "contract.sign"
  | "contract.cancel";

export type CrmContractBoundaryReason =
  CrmAuthorizationReason | "invalid_input" | "not_found" | "invalid_transition";

export interface CrmContractAuditEvent {
  readonly operation: CrmContractBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmContractBoundaryReason;
  readonly actorSubject: string | null;
  readonly contractId: CrmId | null;
  readonly leadId: CrmId | null;
}

export interface CrmContractAuditPort {
  readonly record: (event: CrmContractAuditEvent) => Promise<void>;
}

export interface CrmContractCreateInput {
  readonly leadId: unknown;
  readonly proposalId?: unknown;
  readonly title: unknown;
  readonly content: unknown;
  readonly monthlyValue?: unknown;
}

export interface CrmContractCommandInput {
  readonly id: unknown;
}

export interface CrmContractSignInput extends CrmContractCommandInput {
  readonly signatureData?: unknown;
}

export interface CrmContractCancelInput extends CrmContractCommandInput {
  readonly reason?: unknown;
}

export interface CrmContractCreateRecord {
  readonly leadId: CrmId;
  readonly proposalId: CrmId | null;
  readonly title: string;
  readonly content: string;
  readonly monthlyValue: CrmMoney | null;
  readonly status: "draft";
  readonly shareToken: string;
  readonly createdBySubject: string;
}

export interface CrmContractUpdateRecord {
  readonly status?: CrmContractStatus;
  readonly sentAt?: Date;
  readonly signedAt?: Date;
  readonly signatureData?: string | null;
}

export interface CrmContractBoundaryRepository {
  readonly list: (leadId?: CrmId) => Promise<readonly CrmContract[]>;
  readonly findById: (id: CrmId) => Promise<CrmContract | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly proposalBelongsToLead: (
    proposalId: CrmId,
    leadId: CrmId,
  ) => Promise<boolean>;
  readonly create: (record: CrmContractCreateRecord) => Promise<CrmContract>;
  readonly update: (
    id: CrmId,
    patch: CrmContractUpdateRecord,
  ) => Promise<CrmContract>;
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

export type CrmContractBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmContractBoundaryReason };

export type CrmContractTokenFactory = () => string;

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
  const text = safeText(value, maxLength);
  return typeof text === "string" && text.length > 0 ? text : null;
}

function safeContractContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return null;
  return normalized.slice(0, 100_000);
}

function safeOptionalMoney(value: unknown): CrmMoney | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return undefined;
  return normalized;
}

function isContractStatus(value: unknown): value is CrmContractStatus {
  return (
    typeof value === "string" &&
    (crmContractStatuses as readonly string[]).includes(value)
  );
}

export class CrmContractServerBoundary {
  constructor(
    private readonly repository: CrmContractBoundaryRepository,
    private readonly audit: CrmContractAuditPort,
    private readonly tokenFactory: CrmContractTokenFactory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmContractBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    contractId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmContractBoundaryResult<true>> {
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
        contractId,
        leadId,
      });
      return { ok: false, reason: auth.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmContractBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: Exclude<CrmContractBoundaryReason, CrmAuthorizationReason>,
    contractId: CrmId | null = null,
    leadId: CrmId | null = null,
  ): Promise<CrmContractBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      contractId,
      leadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    leadIdValue?: unknown,
  ): Promise<CrmContractBoundaryResult<readonly CrmContract[]>> {
    const leadId =
      leadIdValue === undefined ? undefined : normalizeCrmId(leadIdValue);
    const auth = await this.authorize(
      "contract.list",
      session,
      false,
      null,
      leadId ?? null,
    );
    if (!auth.ok) return auth;
    if (leadIdValue !== undefined && !leadId) {
      return this.reject("contract.list", session, "invalid_input");
    }
    return {
      ok: true,
      value: await this.repository.list(leadId ?? undefined),
    };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmContractCreateInput,
  ): Promise<CrmContractBoundaryResult<CrmContract>> {
    const leadId = normalizeCrmId(input.leadId);
    const proposalId =
      input.proposalId === undefined || input.proposalId === null
        ? null
        : normalizeCrmId(input.proposalId);
    const auth = await this.authorize(
      "contract.create",
      session,
      true,
      null,
      leadId,
    );
    if (!auth.ok) return auth;

    const title = safeRequiredText(input.title, 180);
    const content = safeContractContent(input.content);
    const monthlyValue = safeOptionalMoney(input.monthlyValue);
    const shareToken = this.tokenFactory().trim();
    if (
      !session ||
      !leadId ||
      !title ||
      !content ||
      monthlyValue === undefined ||
      (input.proposalId !== undefined &&
        input.proposalId !== null &&
        !proposalId) ||
      !/^[A-Za-z0-9_-]{16,64}$/u.test(shareToken)
    ) {
      return this.reject(
        "contract.create",
        session,
        "invalid_input",
        null,
        leadId,
      );
    }
    if (!(await this.repository.leadExists(leadId))) {
      return this.reject("contract.create", session, "not_found", null, leadId);
    }
    if (
      proposalId &&
      !(await this.repository.proposalBelongsToLead(proposalId, leadId))
    ) {
      return this.reject("contract.create", session, "not_found", null, leadId);
    }

    const contract = await this.repository.create({
      leadId,
      proposalId,
      title,
      content,
      monthlyValue,
      status: "draft",
      shareToken,
      createdBySubject: session.subject,
    });
    await this.repository.appendInteraction({
      leadId,
      content: `Contrato "${title}" redigido`,
      actorSubject: session.subject,
      metadata: { contractId: String(contract.id), status: "draft" },
    });
    return { ok: true, value: contract };
  }

  async send(
    session: AuthSessionIdentity | null,
    input: CrmContractCommandInput,
  ): Promise<CrmContractBoundaryResult<CrmContract>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("contract.send", session, true, id);
    if (!auth.ok) return auth;
    if (!id) return this.reject("contract.send", session, "invalid_input");

    const contract = await this.repository.findById(id);
    if (!contract)
      return this.reject("contract.send", session, "not_found", id);
    if (!isContractStatus(contract.status) || contract.status !== "draft") {
      return this.reject(
        "contract.send",
        session,
        "invalid_transition",
        id,
        contract.leadId,
      );
    }

    const updated = await this.repository.update(id, {
      status: "sent",
      sentAt: this.now(),
    });
    await this.repository.appendInteraction({
      leadId: contract.leadId,
      content: "Contrato enviado para assinatura",
      actorSubject: session?.subject ?? "",
      metadata: { contractId: String(id), status: "sent" },
    });
    return { ok: true, value: updated };
  }

  async sign(
    session: AuthSessionIdentity | null,
    input: CrmContractSignInput,
  ): Promise<CrmContractBoundaryResult<CrmContract>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("contract.sign", session, true, id);
    if (!auth.ok) return auth;
    const signatureData =
      input.signatureData === undefined
        ? null
        : safeText(input.signatureData, 20_000);
    if (!id || signatureData === undefined) {
      return this.reject("contract.sign", session, "invalid_input", id);
    }

    const contract = await this.repository.findById(id);
    if (!contract)
      return this.reject("contract.sign", session, "not_found", id);
    if (
      !isContractStatus(contract.status) ||
      !["draft", "sent"].includes(contract.status)
    ) {
      return this.reject(
        "contract.sign",
        session,
        "invalid_transition",
        id,
        contract.leadId,
      );
    }

    const updated = await this.repository.update(id, {
      status: "signed",
      signedAt: this.now(),
      signatureData,
    });
    await this.repository.updateLeadStage(contract.leadId, "contract_signed");
    await this.repository.appendInteraction({
      leadId: contract.leadId,
      content: "Contrato assinado pelo cliente (via painel)",
      actorSubject: session?.subject ?? "",
      metadata: { contractId: String(id), status: "signed" },
    });
    return { ok: true, value: updated };
  }

  async cancel(
    session: AuthSessionIdentity | null,
    input: CrmContractCancelInput,
  ): Promise<CrmContractBoundaryResult<CrmContract>> {
    const id = normalizeCrmId(input.id);
    const auth = await this.authorize("contract.cancel", session, true, id);
    if (!auth.ok) return auth;
    const reason =
      input.reason === undefined ? null : safeText(input.reason, 1000);
    if (!id || reason === undefined) {
      return this.reject("contract.cancel", session, "invalid_input", id);
    }

    const contract = await this.repository.findById(id);
    if (!contract)
      return this.reject("contract.cancel", session, "not_found", id);
    if (
      !isContractStatus(contract.status) ||
      contract.status === "signed" ||
      contract.status === "cancelled"
    ) {
      return this.reject(
        "contract.cancel",
        session,
        "invalid_transition",
        id,
        contract.leadId,
      );
    }

    const updated = await this.repository.update(id, { status: "cancelled" });
    await this.repository.appendInteraction({
      leadId: contract.leadId,
      content: `Contrato cancelado${reason ? `: ${reason}` : ""}`,
      actorSubject: session?.subject ?? "",
      metadata: { contractId: String(id), status: "cancelled" },
    });
    return { ok: true, value: updated };
  }
}
