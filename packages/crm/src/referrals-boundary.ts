import type { AuthSessionIdentity } from "@touristic/auth";

import {
  normalizeCrmId,
  type CrmId,
  type CrmReferral,
  type CrmReferralStatus,
} from "./index.js";
import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";

export type CrmReferralBoundaryOperation =
  | "referral.list"
  | "referral.create"
  | "referral.edit"
  | "referral.contact"
  | "referral.convert"
  | "referral.lose"
  | "referral.link_lead"
  | "referral.grant_benefit";

export type CrmReferralBoundaryReason =
  | CrmAuthorizationReason
  | "invalid_input"
  | "not_found"
  | "invalid_transition";

export interface CrmReferralAuditEvent {
  readonly operation: CrmReferralBoundaryOperation;
  readonly allowed: boolean;
  readonly reason: CrmReferralBoundaryReason;
  readonly actorSubject: string | null;
  readonly referralId: CrmId | null;
  readonly referrerLeadId: CrmId | null;
}

export interface CrmReferralAuditPort {
  readonly record: (event: CrmReferralAuditEvent) => Promise<void>;
}

export interface CrmReferralCreateInput {
  readonly referrerLeadId: unknown;
  readonly referredName: unknown;
  readonly referredPhone?: unknown;
  readonly referredEmail?: unknown;
  readonly notes?: unknown;
}

export interface CrmReferralEditInput {
  readonly id: unknown;
  readonly referredName?: unknown;
  readonly referredPhone?: unknown;
  readonly referredEmail?: unknown;
  readonly notes?: unknown;
}

export interface CrmReferralIdInput {
  readonly id: unknown;
}

export interface CrmReferralLinkLeadInput extends CrmReferralIdInput {
  readonly referredLeadId: unknown;
}

export interface CrmReferralGrantBenefitInput extends CrmReferralIdInput {
  readonly benefitDescription: unknown;
}

export interface CrmReferralCreateRecord {
  readonly referrerLeadId: CrmId;
  readonly referredLeadId: null;
  readonly referredName: string;
  readonly referredPhone: string | null;
  readonly referredEmail: string | null;
  readonly status: "pending";
  readonly benefitDescription: null;
  readonly benefitGrantedAt: null;
  readonly notes: string | null;
}

export interface CrmReferralPatch {
  readonly referredName?: string;
  readonly referredPhone?: string | null;
  readonly referredEmail?: string | null;
  readonly notes?: string | null;
  readonly referredLeadId?: CrmId;
  readonly status?: CrmReferralStatus;
  readonly benefitDescription?: string;
  readonly benefitGrantedAt?: Date;
}

export interface CrmReferralBoundaryRepository {
  readonly list: (referrerLeadId?: CrmId) => Promise<readonly CrmReferral[]>;
  readonly findById: (id: CrmId) => Promise<CrmReferral | null>;
  readonly leadExists: (leadId: CrmId) => Promise<boolean>;
  readonly create: (record: CrmReferralCreateRecord) => Promise<CrmReferral>;
  readonly update: (id: CrmId, patch: CrmReferralPatch) => Promise<CrmReferral>;
  readonly appendInteraction: (input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
  }) => Promise<void>;
}

export type CrmReferralBoundaryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmReferralBoundaryReason };

function safeRequiredText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) return null;
  return normalized;
}

function safeOptionalText(
  value: unknown,
  maximum: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maximum) return undefined;
  return normalized;
}

export class CrmReferralServerBoundary {
  constructor(
    private readonly repository: CrmReferralBoundaryRepository,
    private readonly audit: CrmReferralAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async authorize(
    operation: CrmReferralBoundaryOperation,
    session: AuthSessionIdentity | null,
    mutation: boolean,
    referralId: CrmId | null = null,
    referrerLeadId: CrmId | null = null,
  ): Promise<CrmReferralBoundaryResult<true>> {
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
        referralId,
        referrerLeadId,
      });
      return { ok: false, reason: authorization.reason };
    }
    return { ok: true, value: true };
  }

  private async reject(
    operation: CrmReferralBoundaryOperation,
    session: AuthSessionIdentity | null,
    reason: Exclude<CrmReferralBoundaryReason, CrmAuthorizationReason>,
    referralId: CrmId | null = null,
    referrerLeadId: CrmId | null = null,
  ): Promise<CrmReferralBoundaryResult<never>> {
    await this.audit.record({
      operation,
      allowed: false,
      reason,
      actorSubject: session?.subject ?? null,
      referralId,
      referrerLeadId,
    });
    return { ok: false, reason };
  }

  async list(
    session: AuthSessionIdentity | null,
    referrerLeadIdValue?: unknown,
  ): Promise<CrmReferralBoundaryResult<readonly CrmReferral[]>> {
    const referrerLeadId =
      referrerLeadIdValue === undefined
        ? undefined
        : normalizeCrmId(referrerLeadIdValue);
    const authorization = await this.authorize(
      "referral.list",
      session,
      false,
      null,
      referrerLeadId ?? null,
    );
    if (!authorization.ok) return authorization;
    if (referrerLeadIdValue !== undefined && !referrerLeadId) {
      return this.reject("referral.list", session, "invalid_input");
    }
    return {
      ok: true,
      value: await this.repository.list(referrerLeadId ?? undefined),
    };
  }

  async create(
    session: AuthSessionIdentity | null,
    input: CrmReferralCreateInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const referrerLeadId = normalizeCrmId(input.referrerLeadId);
    const authorization = await this.authorize(
      "referral.create",
      session,
      true,
      null,
      referrerLeadId,
    );
    if (!authorization.ok) return authorization;

    const referredName = safeRequiredText(input.referredName, 255);
    const referredPhone =
      input.referredPhone === undefined
        ? null
        : safeOptionalText(input.referredPhone, 30);
    const referredEmail =
      input.referredEmail === undefined
        ? null
        : safeOptionalText(input.referredEmail, 320);
    const notes =
      input.notes === undefined ? null : safeOptionalText(input.notes, 10_000);
    if (
      !referrerLeadId ||
      !referredName ||
      referredPhone === undefined ||
      referredEmail === undefined ||
      notes === undefined
    ) {
      return this.reject(
        "referral.create",
        session,
        "invalid_input",
        null,
        referrerLeadId,
      );
    }
    if (!(await this.repository.leadExists(referrerLeadId))) {
      return this.reject(
        "referral.create",
        session,
        "not_found",
        null,
        referrerLeadId,
      );
    }

    const created = await this.repository.create({
      referrerLeadId,
      referredLeadId: null,
      referredName,
      referredPhone,
      referredEmail,
      status: "pending",
      benefitDescription: null,
      benefitGrantedAt: null,
      notes,
    });
    await this.repository.appendInteraction({
      leadId: referrerLeadId,
      content: `Indicação registrada: ${referredName}`,
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: created };
  }

  async edit(
    session: AuthSessionIdentity | null,
    input: CrmReferralEditInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const resolved = await this.resolve("referral.edit", session, input.id);
    if (!resolved.ok) return resolved;

    const referredName = safeOptionalText(input.referredName, 255);
    const referredPhone = safeOptionalText(input.referredPhone, 30);
    const referredEmail = safeOptionalText(input.referredEmail, 320);
    const notes = safeOptionalText(input.notes, 10_000);
    if (
      referredName === undefined &&
      referredPhone === undefined &&
      referredEmail === undefined &&
      notes === undefined
    ) {
      return this.reject(
        "referral.edit",
        session,
        "invalid_input",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }
    if (input.referredName !== undefined && referredName === null) {
      return this.reject(
        "referral.edit",
        session,
        "invalid_input",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }

    const updated = await this.repository.update(resolved.value.id, {
      ...(referredName !== undefined ? { referredName } : {}),
      ...(referredPhone !== undefined ? { referredPhone } : {}),
      ...(referredEmail !== undefined ? { referredEmail } : {}),
      ...(notes !== undefined ? { notes } : {}),
    });
    return { ok: true, value: updated };
  }

  async contact(
    session: AuthSessionIdentity | null,
    input: CrmReferralIdInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    return this.transition("referral.contact", session, input.id, "contacted");
  }

  async convert(
    session: AuthSessionIdentity | null,
    input: CrmReferralIdInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    return this.transition("referral.convert", session, input.id, "converted");
  }

  async lose(
    session: AuthSessionIdentity | null,
    input: CrmReferralIdInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    return this.transition("referral.lose", session, input.id, "lost");
  }

  async linkLead(
    session: AuthSessionIdentity | null,
    input: CrmReferralLinkLeadInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const resolved = await this.resolve("referral.link_lead", session, input.id);
    if (!resolved.ok) return resolved;
    const referredLeadId = normalizeCrmId(input.referredLeadId);
    if (!referredLeadId) {
      return this.reject(
        "referral.link_lead",
        session,
        "invalid_input",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }
    if (!(await this.repository.leadExists(referredLeadId))) {
      return this.reject(
        "referral.link_lead",
        session,
        "not_found",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }
    return {
      ok: true,
      value: await this.repository.update(resolved.value.id, { referredLeadId }),
    };
  }

  async grantBenefit(
    session: AuthSessionIdentity | null,
    input: CrmReferralGrantBenefitInput,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const resolved = await this.resolve(
      "referral.grant_benefit",
      session,
      input.id,
    );
    if (!resolved.ok) return resolved;
    const benefitDescription = safeRequiredText(input.benefitDescription, 10_000);
    if (!benefitDescription || resolved.value.benefitGrantedAt !== null) {
      return this.reject(
        "referral.grant_benefit",
        session,
        benefitDescription ? "invalid_transition" : "invalid_input",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }
    const updated = await this.repository.update(resolved.value.id, {
      benefitDescription,
      benefitGrantedAt: this.now(),
    });
    await this.repository.appendInteraction({
      leadId: resolved.value.referrerLeadId,
      content: `Benefício de indicação concedido: ${benefitDescription}`,
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }

  private async transition(
    operation: "referral.contact" | "referral.convert" | "referral.lose",
    session: AuthSessionIdentity | null,
    idValue: unknown,
    nextStatus: Exclude<CrmReferralStatus, "pending">,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const resolved = await this.resolve(operation, session, idValue);
    if (!resolved.ok) return resolved;

    const allowed =
      (nextStatus === "contacted" && resolved.value.status === "pending") ||
      (nextStatus === "converted" &&
        (resolved.value.status === "pending" ||
          resolved.value.status === "contacted")) ||
      (nextStatus === "lost" &&
        (resolved.value.status === "pending" ||
          resolved.value.status === "contacted"));
    if (!allowed) {
      return this.reject(
        operation,
        session,
        "invalid_transition",
        resolved.value.id,
        resolved.value.referrerLeadId,
      );
    }

    const updated = await this.repository.update(resolved.value.id, {
      status: nextStatus,
    });
    await this.repository.appendInteraction({
      leadId: resolved.value.referrerLeadId,
      content:
        nextStatus === "contacted"
          ? "Indicação marcada como contatada"
          : nextStatus === "converted"
            ? "Indicação convertida"
            : "Indicação marcada como perdida",
      actorSubject: session?.subject ?? "",
    });
    return { ok: true, value: updated };
  }

  private async resolve(
    operation: Exclude<
      CrmReferralBoundaryOperation,
      "referral.list" | "referral.create"
    >,
    session: AuthSessionIdentity | null,
    idValue: unknown,
  ): Promise<CrmReferralBoundaryResult<CrmReferral>> {
    const id = normalizeCrmId(idValue);
    const authorization = await this.authorize(operation, session, true, id);
    if (!authorization.ok) return authorization;
    if (!id) return this.reject(operation, session, "invalid_input");
    const referral = await this.repository.findById(id);
    if (!referral) return this.reject(operation, session, "not_found", id);
    return { ok: true, value: referral };
  }
}
