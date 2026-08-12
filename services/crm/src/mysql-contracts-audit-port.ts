import type {
  CrmContractAuditEvent,
  CrmContractAuditPort,
} from "@touristic/crm/contracts-boundary";
import type { Pool } from "mysql2/promise";

export class MySqlCrmContractAuditPort implements CrmContractAuditPort {
  constructor(private readonly pool: Pool) {}

  async record(event: CrmContractAuditEvent): Promise<void> {
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
