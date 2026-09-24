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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id VARCHAR(160) COLLATE utf8mb4_bin PRIMARY KEY,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      type ENUM('image') NOT NULL,
      provider VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
      provider_reference VARCHAR(500) COLLATE utf8mb4_bin NOT NULL,
      mime_type VARCHAR(120) COLLATE utf8mb4_bin NOT NULL,
      width INT UNSIGNED NOT NULL,
      height INT UNSIGNED NOT NULL,
      byte_size BIGINT UNSIGNED NOT NULL,
      checksum_sha256 CHAR(64) COLLATE ascii_bin NOT NULL,
      alt_text VARCHAR(300) NOT NULL,
      publication_state ENUM('draft','published') NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      UNIQUE KEY uq_media_business_checksum (business_id, checksum_sha256),
      INDEX idx_media_business_publication (business_id, publication_state, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS place_media (
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      media_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      role ENUM('cover','gallery','logo','menu','product','other') NOT NULL,
      sort_order INT UNSIGNED NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (place_id, media_id),
      INDEX idx_place_media_order (place_id, sort_order, media_id),
      INDEX idx_place_media_role (place_id, role),
      CONSTRAINT fk_place_media_asset
        FOREIGN KEY (media_id) REFERENCES media_assets(id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
