import type {
  CrmProposalAuditEvent,
  CrmProposalAuditPort,
} from "@touristic/crm/proposals-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmProposalAuditPort implements CrmProposalAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmProposalAuditEvent): Promise<void> {
    await this.pool.execute(
      `INSERT INTO crm_audit_events (operation, allowed, reason, actor_subject, lead_id)
       VALUES (?, ?, ?, ?, ?)`,
      [
        event.operation,
        event.allowed,
        event.reason,
        event.actorSubject,
        event.leadId,
      ],
    );
  }
}
