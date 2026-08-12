import type { CrmContract, CrmId, CrmLeadStage } from "./index.js";

export type CrmContractPublicReason =
  | "invalid_token"
  | "not_found"
  | "invalid_input"
  | "invalid_transition";

export type CrmContractPublicResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CrmContractPublicReason };

export interface CrmContractPublicSignInput {
  readonly token: unknown;
  readonly signatureData: unknown;
  readonly signerName: unknown;
  readonly signerIp: unknown;
}

export interface CrmContractPublicSignRecord {
  readonly token: string;
  readonly signedAt: Date;
  readonly signatureData: string;
  readonly signerName: string;
  readonly signerIp: string;
}

export interface CrmContractPublicRepository {
  readonly findByShareToken: (token: string) => Promise<CrmContract | null>;
  readonly signSentByToken: (
    record: CrmContractPublicSignRecord,
  ) => Promise<CrmContract | null>;
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

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
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

function safeSignature(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const signature = value.trim();
  if (!signature || signature.length > 20_000) return null;
  return signature;
}

export class CrmContractPublicBoundary {
  constructor(
    private readonly repository: CrmContractPublicRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async view(tokenValue: unknown): Promise<CrmContractPublicResult<CrmContract>> {
    const token = safeToken(tokenValue);
    if (!token) return { ok: false, reason: "invalid_token" };
    const contract = await this.repository.findByShareToken(token);
    return contract
      ? { ok: true, value: contract }
      : { ok: false, reason: "not_found" };
  }

  async sign(
    input: CrmContractPublicSignInput,
  ): Promise<CrmContractPublicResult<CrmContract>> {
    const token = safeToken(input.token);
    if (!token) return { ok: false, reason: "invalid_token" };

    const contract = await this.repository.findByShareToken(token);
    if (!contract) return { ok: false, reason: "not_found" };
    if (contract.status !== "sent") {
      return { ok: false, reason: "invalid_transition" };
    }

    const signatureData = safeSignature(input.signatureData);
    const signerName = safeText(input.signerName, 180);
    const signerIp = safeText(input.signerIp, 128);
    if (!signatureData || !signerName || !signerIp) {
      return { ok: false, reason: "invalid_input" };
    }

    const signedAt = this.now();
    const signed = await this.repository.signSentByToken({
      token,
      signedAt,
      signatureData,
      signerName,
      signerIp,
    });
    if (!signed) return { ok: false, reason: "invalid_transition" };

    await this.repository.updateLeadStage(signed.leadId, "contract_signed");
    await this.repository.appendInteraction({
      leadId: signed.leadId,
      content: `Contrato assinado digitalmente por ${signerName} (IP: ${signerIp}) via link público`,
      actorSubject: "public-contract-token",
      metadata: {
        contractId: String(signed.id),
        status: "signed",
        signerName,
        signerIp,
      },
    });
    return { ok: true, value: signed };
  }
}
