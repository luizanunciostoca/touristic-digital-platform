import type { AuthSessionIdentity } from "@touristic/auth";

import {
  authorizeCrmAccess,
  type CrmAuthorizationReason,
} from "./authorization.js";
import { normalizeCrmId, type CrmId, type CrmLead } from "./index.js";

export const crmAiContentKinds = [
  "follow_up_message",
  "proposal_message",
  "contract_draft",
  "partnership_announcement",
] as const;
export type CrmAiContentKind = (typeof crmAiContentKinds)[number];

export interface CrmAiContentInteraction {
  readonly type: string;
  readonly content: string;
}
export interface CrmAiContentContext {
  readonly leadId: CrmId;
  readonly companyName: string;
  readonly segment: string | null;
  readonly contactName: string | null;
  readonly monthlyValue: string | null;
  readonly recentInteractions: readonly CrmAiContentInteraction[];
}
export interface CrmAiContentRepositoryPort {
  readonly findLead: (leadId: CrmId) => Promise<CrmLead | null>;
  readonly listRecentInteractions: (
    leadId: CrmId,
    limit: number,
  ) => Promise<readonly CrmAiContentInteraction[]>;
}
export interface CrmSharedAssistantContentPort {
  readonly generate: (input: {
    readonly capability: "crm.content.generate";
    readonly kind: CrmAiContentKind;
    readonly locale: "pt-BR";
    readonly context: CrmAiContentContext;
    readonly maxCharacters: number;
  }) => Promise<{ readonly text: string }>;
}
export type CrmAiContentReason =
  CrmAuthorizationReason | "invalid_input" | "not_found" | "provider_failure";
export interface CrmAiContentAuditEvent {
  readonly operation: "crm.ai_content.generate";
  readonly allowed: boolean;
  readonly reason: CrmAiContentReason | "allowed";
  readonly actorSubject: string | null;
  readonly leadId: CrmId | null;
  readonly kind: CrmAiContentKind | null;
}
export interface CrmAiContentAuditPort {
  readonly record: (event: CrmAiContentAuditEvent) => Promise<void>;
}
export type CrmAiContentResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly leadId: CrmId;
        readonly kind: CrmAiContentKind;
        readonly text: string;
      };
    }
  | { readonly ok: false; readonly reason: CrmAiContentReason };

const maxCharactersByKind: Readonly<Record<CrmAiContentKind, number>> = {
  follow_up_message: 1200,
  proposal_message: 1800,
  contract_draft: 12000,
  partnership_announcement: 1800,
};
function isKind(value: unknown): value is CrmAiContentKind {
  return (
    typeof value === "string" &&
    (crmAiContentKinds as readonly string[]).includes(value)
  );
}
function normalizeGeneratedText(
  value: unknown,
  maximum: number,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 8 ||
      codePoint === 11 ||
      codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) ||
      codePoint === 127
      ? " "
      : character;
  })
    .join("")
    .trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export class CrmAiContentBoundary {
  constructor(
    private readonly repository: CrmAiContentRepositoryPort,
    private readonly sharedAssistant: CrmSharedAssistantContentPort,
    private readonly audit: CrmAiContentAuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async generate(
    session: AuthSessionIdentity | null,
    input: { readonly leadId: unknown; readonly kind: unknown },
  ): Promise<CrmAiContentResult> {
    const leadId = normalizeCrmId(input.leadId);
    const kind = isKind(input.kind) ? input.kind : null;
    const authorization = authorizeCrmAccess(session, {
      mutation: true,
      nowEpochSeconds: Math.floor(this.now().getTime() / 1000),
    });
    if (!authorization.allowed) {
      await this.audit.record({
        operation: "crm.ai_content.generate",
        allowed: false,
        reason: authorization.reason,
        actorSubject: session?.subject ?? null,
        leadId,
        kind,
      });
      return { ok: false, reason: authorization.reason };
    }
    if (!leadId || !kind) {
      await this.audit.record({
        operation: "crm.ai_content.generate",
        allowed: false,
        reason: "invalid_input",
        actorSubject: session?.subject ?? null,
        leadId,
        kind,
      });
      return { ok: false, reason: "invalid_input" };
    }
    const lead = await this.repository.findLead(leadId);
    if (!lead) {
      await this.audit.record({
        operation: "crm.ai_content.generate",
        allowed: false,
        reason: "not_found",
        actorSubject: session?.subject ?? null,
        leadId,
        kind,
      });
      return { ok: false, reason: "not_found" };
    }
    const recentInteractions = (
      await this.repository.listRecentInteractions(leadId, 5)
    ).slice(0, 5);
    const context: CrmAiContentContext = Object.freeze({
      leadId,
      companyName: lead.companyName,
      segment: lead.segment,
      contactName: lead.contactName,
      monthlyValue: lead.monthlyValue,
      recentInteractions: Object.freeze(
        recentInteractions.map((item) =>
          Object.freeze({ type: item.type, content: item.content }),
        ),
      ),
    });
    try {
      const generated = await this.sharedAssistant.generate({
        capability: "crm.content.generate",
        kind,
        locale: "pt-BR",
        context,
        maxCharacters: maxCharactersByKind[kind],
      });
      const text = normalizeGeneratedText(
        generated.text,
        maxCharactersByKind[kind],
      );
      if (!text) throw new Error("empty_shared_assistant_output");
      await this.audit.record({
        operation: "crm.ai_content.generate",
        allowed: true,
        reason: "allowed",
        actorSubject: session?.subject ?? null,
        leadId,
        kind,
      });
      return { ok: true, value: { leadId, kind, text } };
    } catch {
      await this.audit.record({
        operation: "crm.ai_content.generate",
        allowed: false,
        reason: "provider_failure",
        actorSubject: session?.subject ?? null,
        leadId,
        kind,
      });
      return { ok: false, reason: "provider_failure" };
    }
  }
}
