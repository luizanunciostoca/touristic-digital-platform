import type { Pool, RowDataPacket } from "mysql2/promise";

const PRODUCT_KIND_ENUM =
  "ENUM('tour','business_experience','transport') NOT NULL";

const PRODUCT_KIND_TABLES = Object.freeze([
  "ticketing_tickets",
  "ticketing_inventory",
  "ticketing_reservations",
] as const);

interface ProductKindColumnRow extends RowDataPacket {
  column_type: string;
}

async function ensureTransportProductKind(
  pool: Pool,
  tableName: (typeof PRODUCT_KIND_TABLES)[number],
): Promise<void> {
  const [rows] = await pool.query<ProductKindColumnRow[]>(
    "SELECT COLUMN_TYPE AS column_type FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? " +
      "AND COLUMN_NAME = 'product_kind' LIMIT 1",
    [tableName],
  );
  const columnType = rows[0]?.column_type?.toLowerCase() ?? "";
  if (!columnType) {
    throw new Error("TICKETING_PRODUCT_KIND_COLUMN_MISSING:" + tableName);
  }
  if (columnType.includes("'transport'")) return;

  await pool.query(
    "ALTER TABLE " +
      tableName +
      " MODIFY COLUMN product_kind " +
      PRODUCT_KIND_ENUM,
  );
}

/**
 * Additive migration for transport ticket inventory.
 *
 * Fresh schemas already contain the expanded ENUM; existing databases are
 * changed only when their product_kind column does not yet allow transport.
 */
export async function applyTicketingTransportProductKindSchema(
  pool: Pool,
): Promise<void> {
  for (const tableName of PRODUCT_KIND_TABLES) {
    await ensureTransportProductKind(pool, tableName);
  }
}
