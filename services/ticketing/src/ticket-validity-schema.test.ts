import { describe, expect, it, vi } from "vitest";

import { applyTicketingValiditySchema } from "./ticket-validity-schema.js";

describe("Ticketing validity schema migration", () => {
  it("adds missing validity columns and backfills reservations from inventory", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    await applyTicketingValiditySchema({ query } as never);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("information_schema.COLUMNS"),
      ["ticketing_tickets", "valid_until"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      "ALTER TABLE ticketing_tickets ADD COLUMN valid_until DATETIME(3) NULL AFTER issued_at",
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("information_schema.COLUMNS"),
      ["ticketing_reservations", "valid_until"],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      "ALTER TABLE ticketing_reservations ADD COLUMN valid_until DATETIME(3) NULL AFTER expires_at",
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining("SET r.valid_until = i.ends_at"),
    );
  });

  it("is additive and skips ALTER TABLE when both columns already exist", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([[{ column_name: "valid_until" }], []])
      .mockResolvedValueOnce([[{ column_name: "valid_until" }], []])
      .mockResolvedValueOnce([[], []]);

    await applyTicketingValiditySchema({ query } as never);

    expect(query).toHaveBeenCalledTimes(3);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes("ALTER TABLE")),
    ).toBe(false);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE r.valid_until IS NULL"),
    );
  });
});
