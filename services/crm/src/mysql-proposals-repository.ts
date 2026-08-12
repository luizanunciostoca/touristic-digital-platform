import type { CrmId, CrmProposal } from "@touristic/crm";
import type {
  CrmProposalBoundaryRepository,
  CrmProposalCreateRecord,
  CrmProposalUpdateRecord,
} from "@touristic/crm/proposals-boundary";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";

interface ProposalRow extends RowDataPacket {
  id: number;
  lead_id: number;
  title: string;
  plan_name: string | null;
  monthly_value: string;
  setup_fee: string | null;
  trial_days: number;
  features: unknown;
  custom_message: string | null;
  pdf_url: string | null;
  share_token: string | null;
  status: CrmProposal["status"];
  sent_at: Date | null;
  viewed_at: Date | null;
  responded_at: Date | null;
  valid_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

const proposalColumns =
  "id, lead_id, title, plan_name, monthly_value, setup_fee, trial_days, features, custom_message, pdf_url, share_token, status, sent_at, viewed_at, responded_at, valid_until, created_at, updated_at";

function parseFeatures(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function mapProposal(row: ProposalRow): CrmProposal {
  return {
    id: row.id,
    leadId: row.lead_id,
    title: row.title,
    planName: row.plan_name,
    monthlyValue: row.monthly_value,
    setupFee: row.setup_fee,
    trialDays: row.trial_days,
    features: parseFeatures(row.features),
    customMessage: row.custom_message,
    pdfUrl: row.pdf_url,
    shareToken: row.share_token,
    status: row.status,
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    respondedAt: row.responded_at,
    validUntil: row.valid_until,
    createdById: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlCrmProposalRepository
  implements CrmProposalBoundaryRepository
{
  constructor(private readonly pool: Pool) {}

  async list(leadId?: CrmId): Promise<readonly CrmProposal[]> {
    const [rows] = leadId
      ? await this.pool.execute<ProposalRow[]>(
          `SELECT ${proposalColumns} FROM crm_proposals WHERE lead_id = ? ORDER BY created_at DESC, id DESC`,
          [leadId],
        )
      : await this.pool.execute<ProposalRow[]>(
          `SELECT ${proposalColumns} FROM crm_proposals ORDER BY created_at DESC, id DESC`,
        );
    return rows.map(mapProposal);
  }

  async findById(id: CrmId): Promise<CrmProposal | null> {
    const [rows] = await this.pool.execute<ProposalRow[]>(
      `SELECT ${proposalColumns} FROM crm_proposals WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows[0] ? mapProposal(rows[0]) : null;
  }

  async leadExists(leadId: CrmId): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT id FROM crm_leads WHERE id = ? LIMIT 1",
      [leadId],
    );
    return rows.length > 0;
  }

  async create(record: CrmProposalCreateRecord): Promise<CrmProposal> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO crm_proposals
       (lead_id, title, plan_name, monthly_value, setup_fee, trial_days, features, custom_message, share_token, status, valid_until, created_by_subject)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.leadId,
        record.title,
        record.planName,
        record.monthlyValue,
        record.setupFee,
        record.trialDays,
        record.features ? JSON.stringify(record.features) : null,
        record.customMessage,
        record.shareToken,
        record.status,
        record.validUntil,
        record.createdBySubject,
      ],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new Error("crm_proposal_create_readback_failed");
    return created;
  }

  async update(
    id: CrmId,
    patch: CrmProposalUpdateRecord,
  ): Promise<CrmProposal> {
    const columns: Record<keyof CrmProposalUpdateRecord, string> = {
      status: "status",
      sentAt: "sent_at",
      respondedAt: "responded_at",
    };
    const entries = Object.entries(patch) as Array<
      [keyof CrmProposalUpdateRecord, string | Date]
    >;
    if (!entries.length) throw new Error("crm_proposal_empty_update");
    await this.pool.execute(
      `UPDATE crm_proposals SET ${entries
        .map(([key]) => `${columns[key]} = ?`)
        .join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id],
    );
    const updated = await this.findById(id);
    if (!updated) throw new Error("crm_proposal_update_readback_failed");
    return updated;
  }

  async updateLeadStage(
    leadId: CrmId,
    stage: "contract_sent",
  ): Promise<void> {
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
      "INSERT INTO crm_interactions (lead_id, type, content, metadata, actor_subject) VALUES (?, 'proposal', ?, ?, ?)",
      [
        input.leadId,
        input.content,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.actorSubject,
      ],
    );
  }
}
