import type {
  CrmTrialAuditEvent,
  CrmTrialAuditPort,
} from "@touristic/crm/trials-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmTrialAuditPort implements CrmTrialAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmTrialAuditEvent): Promise<void> {
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
