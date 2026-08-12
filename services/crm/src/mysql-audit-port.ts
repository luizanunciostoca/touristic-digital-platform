import type { CrmLeadAuditEvent, CrmLeadAuditPort } from "@touristic/crm/leads-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmLeadAuditPort implements CrmLeadAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmLeadAuditEvent): Promise<void> {
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
