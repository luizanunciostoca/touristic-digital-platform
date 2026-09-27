export const analyticsSchemaSql = `
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id VARCHAR(160) COLLATE utf8mb4_bin PRIMARY KEY,
  schema_version CHAR(1) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_name VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  destination_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  tenant_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
  locale VARCHAR(40) COLLATE utf8mb4_bin NULL,
  source VARCHAR(160) COLLATE utf8mb4_bin NULL,
  attributes_json JSON NOT NULL,
  received_at DATETIME(3) NOT NULL,
  retention_until DATETIME(3) NOT NULL,
  INDEX idx_analytics_event_name_time (event_name, occurred_at),
  INDEX idx_analytics_destination_time (destination_id, occurred_at),
  INDEX idx_analytics_tenant_time (tenant_id, occurred_at),
  INDEX idx_analytics_tenant_destination_time (
    tenant_id,
    destination_id,
    occurred_at
  ),
  INDEX idx_analytics_session_time (session_hash, occurred_at),
  INDEX idx_analytics_retention (retention_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

interface AnalyticsColumnRow {
  readonly column_name: string;
}

export async function applyAnalyticsTenantScopeSchema(
  pool: import("mysql2/promise").Pool,
): Promise<void> {
  const [rows] = await pool.query<
    (AnalyticsColumnRow & import("mysql2/promise").RowDataPacket)[]
  >(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_events' " +
      "AND COLUMN_NAME = 'tenant_id' LIMIT 1",
  );
  if (!rows[0]?.column_name) {
    await pool.query(
      "ALTER TABLE analytics_events ADD COLUMN tenant_id VARCHAR(160) " +
        "COLLATE utf8mb4_bin NULL AFTER destination_id",
    );
  }

  const [indexes] = await pool.query<import("mysql2/promise").RowDataPacket[]>(
    "SELECT INDEX_NAME AS index_name FROM information_schema.STATISTICS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_events'",
  );
  const names = new Set(indexes.map((row) => String(row.index_name)));
  if (!names.has("idx_analytics_tenant_time")) {
    await pool.query(
      "ALTER TABLE analytics_events ADD INDEX idx_analytics_tenant_time " +
        "(tenant_id, occurred_at)",
    );
  }
  if (!names.has("idx_analytics_tenant_destination_time")) {
    await pool.query(
      "ALTER TABLE analytics_events ADD INDEX idx_analytics_tenant_destination_time " +
        "(tenant_id, destination_id, occurred_at)",
    );
  }
}
