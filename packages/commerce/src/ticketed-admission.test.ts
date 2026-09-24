import { describe, expect, it } from "vitest";

import { normalizeTicketedAdmissionProfile } from "./ticketed-admission.js";

describe("ticketed admission profile", () => {
  it("normalizes explicit event identity without owning price or capacity", () => {
    expect(
      normalizeTicketedAdmissionProfile({
        offeringId: "event_the_party_20260926",
        placeId: "place_toca_do_morcego",
        subtype: "party",
        ticketType: "Pista",
        tierLabel: "1º lote",
        displayOrder: 10,
      }),
    ).toEqual({
      offeringId: "event_the_party_20260926",
      placeId: "place_toca_do_morcego",
      subtype: "party",
      ticketType: "Pista",
      tierLabel: "1º lote",
      displayOrder: 10,
    });
  });

  it("rejects implicit or malformed identity", () => {
    expect(
      normalizeTicketedAdmissionProfile({
        offeringId: "",
        placeId: "Toca do Morcego",
        subtype: "party",
        ticketType: "Pista",
        displayOrder: 0,
      }),
    ).toBeNull();
  });
});
