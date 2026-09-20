import type { Pool } from "mysql2/promise";

export async function applyContentM156Schema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS content_documents (
      id VARCHAR(160) COLLATE utf8mb4_bin PRIMARY KEY,
      destination_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      kind VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
      locale VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
      source_reference VARCHAR(240) COLLATE utf8mb4_bin NULL,
      status ENUM('draft','preview','published','scheduled','archived') NOT NULL,
      version INT UNSIGNED NOT NULL,
      fields_json JSON NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      scheduled_for DATETIME(3) NULL,
      published_at DATETIME(3) NULL,
      archived_at DATETIME(3) NULL,
      INDEX idx_content_destination_status (destination_id, status, updated_at),
      INDEX idx_content_kind_locale (kind, locale, updated_at),
      INDEX idx_content_source_reference (source_reference)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
