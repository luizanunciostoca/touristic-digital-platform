import { describe, expect, it, vi } from "vitest";
import { createTicket } from "@touristic/ticketing";
import {
  createTicketReservation,
  createTicketReservationRequestKey,
} from "@touristic/ticketing/reservations";
import {
  createTicketingOperatorAuthorization,
  requireTicketingOperatorAuthority,
} from "./operator-authorization.js";

const authority = requireTicketingOperatorAuthority({
  subject: "operator-a",
  capabilities: ["ticketing.manage"],
  scope: { kind: "business", businessIds: ["business-a"] },
});

function fixture() {
  const now = "2026-11-01T10:00:00.000Z";
  const amount = { minorUnits: 5000, currency: "BRL" };
  const product = { kind: "business_experience", reference: "legacy:sunset" };
  const ticket = createTicket({
    id: "tck_operator_test_0001",
    orderId: "ord_operator_test_0001",
    paymentId: "pay_operator_test_0001",
    destinationId: "destination-a",
    product,
    holderName: "Visitante Teste",
    quantity: 1,
    amount,
    code: "OPER-TEST-0001-TCKT",
    issuedAt: now,
  });
  const reservation = createTicketReservation({
    id: "trv_operator_test_0001",
    requestKey: createTicketReservationRequestKey(
      "mpi_operator_test_0001",
      "operator_attempt_0001",
    ),
    inventoryId: "mpi_operator_test_0001",
    destinationId: "destination-a",
    product,
    unitAmount: amount,
    pricingVersion: "v1",
    holderReference: "visitor-a",
    quantity: 1,
    status: "confirmed",
    expiresAt: "2026-11-01T10:10:00.000Z",
    orderId: ticket?.orderId,
    paymentId: ticket?.paymentId,
    createdAt: now,
    confirmedAt: now,
  });
  if (!ticket || !reservation) throw new Error("FIXTURE_INVALID");
  const facts = {
    binding: {
      orderId: ticket.orderId,
      reservationReference: reservation.id,
      productReference: "business_experience:legacy:sunset",
      quantity: 1,
      amount,
      pricingVersion: "v1",
      boundAt: now,
    },
    reservation,
    inventory: {
      id: reservation.inventoryId,
      businessId: "business-a",
      destinationId: ticket.destinationId,
      productKind: product.kind,
      productReference: product.reference,
      admission: { placeId: "place-a" },
    },
    catalog: {
      inventoryId: reservation.inventoryId,
      businessId: "business-a",
      offerId: "offer-a",
    },
    business: { businessId: "business-a", destinationId: ticket.destinationId },
    offer: {
      id: "offer-a",
      businessId: "business-a",
      destinationId: ticket.destinationId,
      placeId: "place-a",
      productId: "canonical-product-unrelated-to-reference",
    },
    place: {
      id: "place-a",
      businessId: "business-a",
      destinationId: ticket.destinationId,
    },
  };
  const read = {
    binding: vi.fn().mockResolvedValue(facts.binding),
    reservation: vi.fn().mockResolvedValue(facts.reservation),
    inventory: vi.fn().mockResolvedValue(facts.inventory),
    catalog: vi.fn().mockResolvedValue(facts.catalog),
    business: vi.fn().mockResolvedValue(facts.business),
    offer: vi.fn().mockResolvedValue(facts.offer),
    place: vi.fn().mockResolvedValue(facts.place),
  };
  const port = createTicketingOperatorAuthorization({
    bindings: { findByOrderId: read.binding },
    reservations: { findReservationById: read.reservation },
    businessInventory: {
      findByInventoryId: read.inventory,
      findCatalogBindingByInventoryId: read.catalog,
    },
    owner: {
      findBusiness: read.business,
      findOffer: read.offer,
      findPlace: read.place,
    },
  });
  return { ticket, facts, read, port };
}

describe("Ticketing operator canonical authority", () => {
  it("authorizes explicit IDs even when Catalog product IDs differ from legacy references", async () => {
    const { ticket, port, read, facts } = fixture();
    await expect(port.authorize(ticket, authority)).resolves.toBeUndefined();
    expect(read.binding).toHaveBeenCalledWith(ticket.orderId);
    expect(read.reservation).toHaveBeenCalledWith(facts.reservation.id);
    expect(read.inventory).toHaveBeenCalledWith(facts.reservation.inventoryId);
    expect(read.offer).toHaveBeenCalledWith("offer-a");
    expect(read.place).toHaveBeenCalledWith("place-a");
    await expect(
      port.authorize(ticket, { ...authority, scope: { kind: "platform" } }),
    ).resolves.toBeUndefined();
  });

  it.each(
    [
      undefined,
      null,
      {},
      [],
      { ...authority, capabilities: [] },
      { ...authority, subject: "guest:customer" },
      { ...authority, scope: { kind: "business", businessIds: [] } },
      { ...authority, scope: { kind: "editor" } },
    ].map((input) => ({ input })),
  )(
    "rejects invalid authority before any owner lookup: %j",
    async ({ input }) => {
      const { port, ticket, read } = fixture();
      await expect(
        port.authorize(ticket, input as typeof authority),
      ).rejects.toThrow("TICKETING_OPERATOR_FORBIDDEN");
      for (const lookup of Object.values(read))
        expect(lookup).not.toHaveBeenCalled();
    },
  );

  it("does not accept another subject as the audited operator", () => {
    expect(() => requireTicketingOperatorAuthority(authority, "other")).toThrow(
      "TICKETING_OPERATOR_FORBIDDEN",
    );
  });

  it.each([
    "binding",
    "reservation",
    "inventory",
    "business",
    "offer",
    "place",
  ] as const)("fails closed when canonical %s is absent", async (source) => {
    const { port, ticket, read } = fixture();
    read[source].mockResolvedValue(null);
    await expect(port.authorize(ticket, authority)).rejects.toThrow(
      "TICKETING_OPERATOR_NOT_FOUND",
    );
  });

  it.each([
    ["binding", { productReference: "legacy:sunset" }],
    ["binding", { reservationReference: "trv_wrong_00000001" }],
    ["reservation", { paymentId: "pay_wrong_00000001" }],
    ["reservation", { quantity: 2 }],
    ["reservation", { status: "cancelled" }],
    ["inventory", { businessId: "business-b" }],
    ["inventory", { destinationId: "destination-b" }],
    ["catalog", { businessId: "business-b" }],
    ["offer", { businessId: "business-b" }],
    ["offer", { destinationId: "destination-b" }],
    ["offer", { placeId: "place-b" }],
    ["place", { businessId: "business-b" }],
    ["place", { destinationId: "destination-b" }],
  ] as const)("rejects contradictory %s facts: %j", async (source, patch) => {
    const { port, ticket, read, facts } = fixture();
    read[source].mockResolvedValue({ ...facts[source], ...patch });
    await expect(port.authorize(ticket, authority)).rejects.toThrow(
      "TICKETING_OPERATOR_NOT_FOUND",
    );
  });

  it("allows optional Catalog bindings and nullable Offer location without a heuristic Place", async () => {
    const { port, ticket, read, facts } = fixture();
    read.inventory.mockResolvedValue({
      ...facts.inventory,
      admission: undefined,
    });
    read.offer.mockResolvedValue({
      ...facts.offer,
      destinationId: null,
      placeId: null,
    });
    await expect(port.authorize(ticket, authority)).resolves.toBeUndefined();
    read.catalog.mockResolvedValue(null);
    await expect(port.authorize(ticket, authority)).resolves.toBeUndefined();
    expect(read.place).not.toHaveBeenCalled();
    expect(read.offer).toHaveBeenCalledTimes(1);
  });

  it.each([
    "binding",
    "reservation",
    "inventory",
    "catalog",
    "business",
    "offer",
    "place",
  ] as const)("sanitizes unavailable %s owner errors", async (source) => {
    const { port, ticket, read } = fixture();
    read[source].mockRejectedValue(new Error("SQL INVALID secret://private"));
    await expect(port.authorize(ticket, authority)).rejects.toThrow(
      /^TICKETING_OPERATOR_UNAVAILABLE$/u,
    );
  });
});
