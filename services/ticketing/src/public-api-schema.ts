export const ticketingPublicApiSchemaSql = `
CREATE TABLE IF NOT EXISTS ticketing_holder_profiles (
  holder_reference VARCHAR(120) COLLATE utf8mb4_bin PRIMARY KEY,
  holder_name VARCHAR(160) NOT NULL,
  email VARCHAR(200) COLLATE utf8mb4_bin NOT NULL,
  phone VARCHAR(40) NULL,
  document VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_ticketing_holder_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

export const ticketingPublicApiRollbackSql = `
DROP TABLE IF EXISTS ticketing_holder_profiles;
`;
