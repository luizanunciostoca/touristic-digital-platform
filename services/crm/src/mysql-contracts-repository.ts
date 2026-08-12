import type { CrmContract, CrmId, CrmLeadStage } from "@touristic/crm";
import type {
  CrmContractBoundaryRepository,
  CrmContractCreateRecord,
  CrmContractUpdateRecord,
} from "@touristic/crm/contracts-boundary";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface ContractRow extends RowDataPacket {
  id: number;
  lead_id: number;
  proposal_id: number | null;
  title: string;
  content: string;
  monthly_value: string | null;
  status: CrmContract["status"];
  share_token: string;
  sent_at: Date | null;
  signed_at: Date | null;
  signature_data: string | null;
  signer_name: string | null;
  signer_ip: string | null;
  created_at: Date;
  updated_at: Date;
}

const contractColumns =
  "id, lead_id, proposal_id, title, content, monthly_value, status, share_token, sent_at, signed_at, signature_data, signer_name, signer_ip, created_at, updated_at";

function mapContract(row: ContractRow): CrmContract {
  return {
    id: row.id,
    leadId: row.lead_id,
    proposalId: row.proposal_id,
    title: row.title,
    content: row.content,
    monthlyValue: row.monthly_value,
    status: row.status,
    shareToken: row.share_token,
    sentAt: row.sent_at,
    signedAt: row.signed_at,
    signatureData: row.signature_data,
    signerName: row.signer_name,
    signerIp: row.signer_ip,
    createdById: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmContractRepository implements CrmContractBoundaryRepository {
  constructor(private readonly pool: Pool) {}

  async list(leadId?: CrmId): Promise<readonly CrmContract[]> {
    const [rows] = leadId
      ? await this.pool.execute<ContractRow[]>(
          `SELECT ${contractColumns} FROM crm_contracts WHERE lead_id = ? ORDER BY created_at DESC, id DESC`,
          [leadId],
        )
      : await this.pool.execute<ContractRow[]>(
          `SELECT ${contractColumns} FROM crm_contracts ORDER BY created_at DESC, id DESC`,
        );
    return rows.map(mapContract);
  }

  async findById(id: CrmId): Promise<CrmContract | null> {
    const [rows] = await this.pool.execute<ContractRow[]>(
      `SELECT ${contractColumns} FROM crm_contracts WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapContract(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async proposalBelongsToLead(proposalId: CrmId, leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_proposals WHERE id = ? AND lead_id = ? LIMIT 1",
      [proposalId, leadId],
    );
    return rows.length > 0;
  }

  async create(record: CrmContractCreateRecord): Promise<CrmContract> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO crm_contracts (lead_id, proposal_id, title, content, monthly_value, status, share_token, created_by_subject)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.leadId,
        record.proposalId,
        record.title,
        record.content,
        record.monthlyValue,
        record.status,
        record.shareToken,
        record.createdBySubject,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_contract_create_readback_failed");
    return created;
  }

  async update(
    id: CrmId,
    patch: CrmContractUpdateRecord,
  ): Promise<CrmContract> {
    const columns: Record<keyof CrmContractUpdateRecord, string> = {
      status: "status",
      sentAt: "sent_at",
      signedAt: "signed_at",
      signatureData: "signature_data",
    };
    const entries = Object.entries(patch) as Array<
      [keyof CrmContractUpdateRecord, string | Date | null]
    >;
    if (!entries.length) throw new Error("crm_contract_empty_update");
    await this.pool.execute(
      `UPDATE crm_contracts SET ${entries
        .map(([key]) => `${columns[key]} = ?`)
        .join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id],
    );
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_contract_update_readback_failed");
    return updated;
  }

  async updateLeadStage(leadId: CrmId, stage: CrmLeadStage): Promise<void> {
    await this.pool.execute(
      "UPDATE crm_leads SET stage = ?, last_contact_at = CURRENT_TIMESTAMP(3) WHERE id = ?",
      [stage, leadId],
    );
  }

  async appendInteraction(input: {
    readonly leadId: CrmId;
    readonly content: string;
    readonly actorSubject: string;
    readonly metadata?: Readonly<Record<string, string>>;
  }): Promise<void> {
    await this.pool.execute(
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, 'contract', ?, ?, ?)",
      [
        input.leadId,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.actorSubject,
      ],
    );
  }
}
