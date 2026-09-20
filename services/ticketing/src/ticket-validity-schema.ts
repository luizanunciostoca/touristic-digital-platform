import type { Pool, RowDataPacket } from "mysql2/promise";

interface ColumnRow extends RowDataPacket {
  column_name: string;
}

async function hasColumn(
  pool: Pool,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const [rows] = await pool.query<ColumnRow[]>(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1",
    [tableName, columnName],
  );
  return Boolean(rows[0]?.column_name);
}

/**
 * Additive validity migration for existing Ticketing databases.
 *
 * Reservations can be backfilled deterministically from their immutable
 * inventory reference. Existing issued tickets predate the validity contract,
 * so they remain nullable rather than receiving an invented expiry.
 */
export async function applyTicketingValiditySchema(pool: Pool): Promise<void> {
  if (!(await hasColumn(pool, "ticketing_tickets", "valid_until"))) {
    await pool.query(
      "ALTER TABLE ticketing_tickets ADD COLUMN valid_until DATETIME(3) NULL AFTER issued_at",
    );
  }

  if (!(await hasColumn(pool, "ticketing_reservations", "valid_until"))) {
    await pool.query(
      "ALTER TABLE ticketing_reservations ADD COLUMN valid_until DATETIME(3) NULL AFTER expires_at",
    );
  }

  await pool.query(
    `UPDATE ticketing_reservations AS r
     INNER JOIN ticketing_inventory AS i ON i.inventory_id = r.inventory_id
     SET r.valid_until = i.ends_at
     WHERE r.valid_until IS NULL`,
  );
}
