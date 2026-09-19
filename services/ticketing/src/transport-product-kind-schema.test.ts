import { describe, expect, it } from "vitest";

import { applyTicketingTransportProductKindSchema } from "./transport-product-kind-schema.js";

describe("ticketing transport product kind migration", () => {
  it("does not alter schemas that already accept transport", async () => {
    const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const pool = {
      query: async (sql: string, values?: readonly unknown[]) => {
        queries.push({ sql, values });
        if (sql.includes("information_schema.COLUMNS")) {
          return [
            [
              {
                column_type:
                  "enum('tour','business_experience','transport')",
              },
            ],
            [],
          ];
        }
        return [[], []];
      },
    };

    await applyTicketingTransportProductKindSchema(pool as never);

    expect(
      queries.filter(({ sql }) => sql.includes("ALTER TABLE")),
    ).toHaveLength(0);
  });

  it("expands each legacy product_kind enum exactly once", async () => {
    const queries: Array<{ sql: string; values?: readonly unknown[] }> = [];
    const pool = {
      query: async (sql: string, values?: readonly unknown[]) => {
        queries.push({ sql, values });
        if (sql.includes("information_schema.COLUMNS")) {
          return [
            [{ column_type: "enum('tour','business_experience')" }],
            [],
          ];
        }
        return [[], []];
      },
    };

    await applyTicketingTransportProductKindSchema(pool as never);

    const alters = queries.filter(({ sql }) => sql.includes("ALTER TABLE"));
    expect(alters).toHaveLength(3);
    expect(alters.map(({ sql }) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("ALTER TABLE ticketing_tickets"),
        expect.stringContaining("ALTER TABLE ticketing_inventory"),
        expect.stringContaining("ALTER TABLE ticketing_reservations"),
      ]),
    );
    for (const { sql } of alters) {
      expect(sql).toContain(
        "ENUM('tour','business_experience','transport') NOT NULL",
      );
    }
  });

  it("fails closed when a required product_kind column is missing", async () => {
    const pool = {
      query: async () => [[], []],
    };

    await expect(
      applyTicketingTransportProductKindSchema(pool as never),
    ).rejects.toThrow("TICKETING_PRODUCT_KIND_COLUMN_MISSING");
  });
});
