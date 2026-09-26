import { describe, expect, it } from "vitest";

import {
  ticketingPublicApiRollbackSql,
  ticketingPublicApiSchemaSql,
} from "./public-api-schema.js";

describe("Ticketing Admission profile schema authority", () => {
  it("stores presentation metadata without duplicating canonical offer binding", () => {
    const table = ticketingPublicApiSchemaSql.slice(
      ticketingPublicApiSchemaSql.indexOf(
        "CREATE TABLE IF NOT EXISTS ticketing_admission_profiles",
      ),
      ticketingPublicApiSchemaSql.indexOf(
        "CREATE TABLE IF NOT EXISTS ticketing_inventory_catalog_bindings",
      ),
    );

    expect(table).toContain("inventory_id");
    expect(table).toContain("place_id");
    expect(table).toContain("admission_subtype");
    expect(table).toContain("ticket_type");
    expect(table).toContain("tier_label");
    expect(table).toContain("display_order");
    expect(table).not.toContain("offering_id");
    expect(table).not.toContain("offer_id");
  });

  it("drops the Admission profile before inventory ownership on rollback", () => {
    expect(
      ticketingPublicApiRollbackSql.indexOf("ticketing_admission_profiles"),
    ).toBeLessThan(
      ticketingPublicApiRollbackSql.indexOf("ticketing_inventory_ownership"),
    );
  });
});
