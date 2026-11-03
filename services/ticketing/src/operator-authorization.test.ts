import { describe, expect, it, vi } from "vitest";

import { createTicketingOrderBinding } from "@touristic/ordering/ticketing-reservation";
import { createTicket, createTicketCode } from "@touristic/ticketing";
import {
  createTicketInventoryOffer,
  createTicketReservation,
  createTicketReservationRequestKey,
} from "@touristic/ticketing/reservations";

import {
  createTicketingOperatorAuthorization,
  requireTicketingOperatorAuthority,
  type TicketingOperatorAuthority,
  type TicketingOperatorAuthorizationDependencies as Dependencies,
} from "./operator-authorization.js";

const authority: TicketingOperatorAuthority = {
  subject: "operator-a",
  capabilities: ["ticketing.manage"],
  scope: { kind: "business", businessIds: ["business-a"] },
};
const platform: TicketingOperatorAuthority = {
  ...authority,
  scope: { kind: "platform" },
};
const expectedOwner = { businessId: "business-a" };

function required<T>(value: T | null): T {
  if (value === null) throw new Error("OPERATOR_FIXTURE_INVALID");
  return value;
}

function read<T>(value: T) {
  return vi.fn(async (): Promise<T | null> => value);
}

type CatalogFact = NonNullable<
  Awaited<ReturnType<Dependencies["owner"]["findProduct"]>>
>;

function fixture() {
  const now = "2026-11-02T09:00:00.000Z";
  const inventory = required(
    createTicketInventoryOffer({
      id: "tin_operator_00000001",
      destinationId: "morro-de-sao-paulo",
      product: { kind: "business_experience", reference: "entry-a" },
      label: "Admission A",
      unitAmount: { minorUnits: 600, currency: "BRL" },
      pricingVersion: "entry-v1",
      capacity: 20,
      maxPerReservation: 4,
      salesStartAt: "2026-11-02T08:00:00.000Z",
      salesEndAt: "2026-11-02T10:00:00.000Z",
      startsAt: "2026-11-02T18:00:00.000Z",
      endsAt: "2026-11-02T20:00:00.000Z",
      createdAt: now,
    }),
  );
  const ticket = required(
    createTicket({
      id: "tck_operator_00000001",
      orderId: "ord_operator_00000001",
      paymentId: "pay_operator_00000001",
      destinationId: inventory.destinationId,
      product: inventory.product,
      holderName: "Holder A",
      quantity: 2,
      amount: { minorUnits: 1200, currency: "BRL" },
      code: createTicketCode("A".repeat(64)),
      status: "issued",
      issuedAt: "2026-11-02T09:05:00.000Z",
      validUntil: "2026-11-03T00:00:00.000Z",
      updatedAt: "2026-11-02T09:05:00.000Z",
    }),
  );
  const reservation = required(
    createTicketReservation({
      id: "trv_operator_00000001",
      requestKey: createTicketReservationRequestKey(
        inventory.id,
        "attempt_00000001",
      ),
      inventoryId: inventory.id,
      destinationId: ticket.destinationId,
      product: ticket.product,
      unitAmount: inventory.unitAmount,
      pricingVersion: inventory.pricingVersion,
      holderReference: "holder_a",
      quantity: ticket.quantity,
      status: "confirmed",
      orderId: ticket.orderId,
      paymentId: ticket.paymentId,
      expiresAt: "2026-11-02T09:15:00.000Z",
      confirmedAt: ticket.issuedAt,
      createdAt: now,
      updatedAt: ticket.issuedAt,
    }),
  );
  const binding = required(
    createTicketingOrderBinding({
      reservationReference: reservation.id,
      orderId: ticket.orderId,
      productReference: "business_experience:entry-a",
      quantity: ticket.quantity,
      amount: ticket.amount,
      pricingVersion: reservation.pricingVersion,
      boundAt: "2026-11-02T09:01:00.000Z",
    }),
  );
  const businessId = "business-a";
  const place = {
    id: "place-a",
    businessId,
    destinationId: ticket.destinationId,
  };
  const product: CatalogFact = {
    ...place,
    id: "catalog-product-a",
    placeId: place.id,
  };
  const offer = { ...product, id: "catalog-offer-a", productId: product.id };
  const facts = {
    ticket,
    binding,
    reservation,
    inventory,
    product,
    offer,
    place,
    ownership: { inventoryId: inventory.id, businessId },
    admission: {
      inventoryId: inventory.id,
      admission: {
        placeId: place.id,
        subtype: "party" as const,
        ticketType: "Pista",
        tierLabel: null,
        displayOrder: 0,
      },
    },
    catalog: { inventoryId: inventory.id, businessId, offerId: offer.id },
    business: { businessId, destinationId: ticket.destinationId },
    destination: {
      id: ticket.destinationId,
      status: "active" as "active" | "suspended",
    },
  };
  const readers = {
    binding: read(binding),
    reservation: read(reservation),
    inventory: read(inventory),
    ownership: read(facts.ownership),
    admission: read(facts.admission),
    catalog: read(facts.catalog),
    business: read(facts.business),
    place: read(place),
    offer: read(offer),
    product: read(product),
    destination: read(facts.destination),
  };
  const resolver = createTicketingOperatorAuthorization({
    bindings: { findByOrderId: readers.binding },
    reservations: {
      findReservationById: readers.reservation,
      findInventoryById: readers.inventory,
    },
    businessInventory: {
      findOwnershipByInventoryId: readers.ownership,
      findAdmissionProfileByInventoryId: readers.admission,
      findCatalogBindingByInventoryId: readers.catalog,
    },
    owner: {
      findBusiness: readers.business,
      findPlace: readers.place,
      findOffer: readers.offer,
      findProduct: readers.product,
    },
    destinations: { findDestination: readers.destination },
  });
  return {
    facts,
    readers,
    authorize: (actor = authority) => resolver.authorize(ticket, actor),
  };
}

type Reader = keyof ReturnType<typeof fixture>["readers"];

describe("Ticketing operator ownership resolution", () => {
  it("resolves exact current owners without deriving Catalog identity from a ticket product", async () => {
    const f = fixture();
    const result = await f.authorize();
    expect(result).toEqual({
      subject: authority.subject,
      businessId: "business-a",
      destinationId: f.facts.ticket.destinationId,
      destinationStatus: "active",
    });
    expect(Object.isFrozen(result)).toBe(true);
    const { ticket, reservation, inventory } = f.facts;
    const calls: [Reader, ...string[]][] = [
      ["binding", ticket.orderId],
      ["reservation", reservation.id],
      ["inventory", inventory.id],
      ["ownership", inventory.id],
      ["admission", inventory.id],
      ["catalog", inventory.id],
      ["business", "business-a", ticket.destinationId],
      ["destination", ticket.destinationId],
      ["offer", "catalog-offer-a"],
      ["product", "catalog-product-a"],
      ["place", "place-a"],
    ];
    for (const [reader, ...args] of calls) {
      expect(f.readers[reader]).toHaveBeenCalledWith(...args);
    }
    expect(f.readers.place).toHaveBeenCalledOnce();
  });

  it("allows explicit platform scope but rejects another Business and rereads current ownership", async () => {
    const f = fixture();
    await expect(f.authorize(platform)).resolves.toMatchObject(expectedOwner);
    const other = {
      ...authority,
      scope: { kind: "business" as const, businessIds: ["business-b"] },
    };
    await expect(f.authorize(other)).rejects.toMatchObject({
      code: "TICKETING_OPERATOR_FORBIDDEN",
      reason: "BUSINESS_SCOPE_MISMATCH",
    });
    f.readers.ownership.mockResolvedValue({
      ...f.facts.ownership,
      businessId: "business-b",
    });
    await expect(f.authorize()).rejects.toMatchObject({
      reason: "BUSINESS_SCOPE_MISMATCH",
    });
    expect(f.readers.ownership).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["binding", "ORDER_BINDING_MISSING"],
    ["reservation", "RESERVATION_MISSING"],
    ["inventory", "INVENTORY_MISSING"],
    ["ownership", "INVENTORY_OWNERSHIP_MISSING"],
    ["business", "BUSINESS_DESTINATION_MISSING"],
    ["destination", "DESTINATION_MISSING"],
    ["offer", "CATALOG_OFFER_MISSING"],
    ["product", "CATALOG_PRODUCT_MISSING"],
    ["place", "PLACE_MISSING"],
  ] as const)(
    "denies missing %s even for explicit platform authority",
    async (reader, reason) => {
      const f = fixture();
      f.readers[reader].mockResolvedValue(null);
      await expect(f.authorize(platform)).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_NOT_FOUND",
        reason,
        message: "TICKETING_OPERATOR_NOT_FOUND",
      });
    },
  );

  const contradictions: readonly [Reader, Readonly<Record<string, unknown>>][] =
    [
      ["binding", { orderId: "ord_other_00000001" }],
      ["binding", { reservationReference: "trv_other_00000001" }],
      ["binding", { productReference: "tour:other" }],
      ["binding", { quantity: 1 }],
      ["binding", { amount: { minorUnits: 1201, currency: "BRL" } }],
      ["binding", { amount: { minorUnits: 1200, currency: "USD" } }],
      ["binding", { pricingVersion: "other" }],
      ["reservation", { orderId: null }],
      ["reservation", { paymentId: null }],
      ["reservation", { destinationId: "other-destination" }],
      ["reservation", { product: { kind: "tour", reference: "entry-a" } }],
      ["reservation", { quantity: 1 }],
      ["reservation", { unitAmount: { minorUnits: 601, currency: "BRL" } }],
      ["reservation", { unitAmount: { minorUnits: 600, currency: "USD" } }],
      ["inventory", { id: "tin_other_00000001" }],
      ["inventory", { destinationId: "other-destination" }],
      [
        "inventory",
        { product: { kind: "business_experience", reference: "other" } },
      ],
      ["ownership", { inventoryId: "tin_other_00000001" }],
      ["ownership", { businessId: "" }],
      ["business", { businessId: "business-b" }],
      ["business", { destinationId: "other-destination" }],
      ["destination", { id: "other-destination" }],
      ["destination", { status: "unknown" }],
      ["admission", { inventoryId: "tin_other_00000001" }],
      ["catalog", { inventoryId: "tin_other_00000001" }],
      ["catalog", { businessId: "business-b" }],
      ["offer", { id: "other-offer" }],
      ["offer", { businessId: "business-b" }],
      ["offer", { destinationId: "other-destination" }],
      ["offer", { productId: "other-product" }],
      ["offer", { placeId: "other-place" }],
      ["product", { businessId: "business-b" }],
      ["product", { destinationId: "other-destination" }],
      ["product", { placeId: "other-place" }],
      ["place", { id: "other-place" }],
      ["place", { businessId: "business-b" }],
      ["place", { destinationId: "other-destination" }],
    ];
  it.each(contradictions)(
    "rejects contradictory %s facts (%#)",
    async (reader, patch) => {
      const f = fixture();
      // Deliberately corrupt a persisted read result, including branded IDs.
      f.readers[reader].mockResolvedValue({
        ...f.facts[reader],
        ...patch,
      } as never);
      await expect(f.authorize(platform)).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_FORBIDDEN",
        reason: "CONTRADICTORY_FACTS",
      });
    },
  );

  it("allows valid Inventory without Catalog or admission and never guesses a Place", async () => {
    const f = fixture();
    f.readers.catalog.mockResolvedValue(null);
    f.readers.admission.mockResolvedValue(null);
    await expect(f.authorize()).resolves.toMatchObject(expectedOwner);
    expect(f.readers.offer).not.toHaveBeenCalled();
    expect(f.readers.product).not.toHaveBeenCalled();
    expect(f.readers.place).not.toHaveBeenCalled();
  });

  it("preserves nullable Catalog scope while following an explicit admission Place", async () => {
    const f = fixture();
    f.readers.offer.mockResolvedValue({
      ...f.facts.offer,
      placeId: null,
      destinationId: null,
    });
    f.readers.product.mockResolvedValue({
      ...f.facts.product,
      placeId: null,
      destinationId: null,
    });
    await expect(f.authorize()).resolves.toMatchObject(expectedOwner);
    expect(f.readers.place).toHaveBeenCalledWith("place-a");
    f.readers.admission.mockResolvedValue(null);
    f.readers.place.mockClear();
    await expect(f.authorize()).resolves.toMatchObject(expectedOwner);
    expect(f.readers.place).not.toHaveBeenCalled();
  });

  it("uses the separate admission reader and rejects a conflicting admission Place", async () => {
    const f = fixture();
    const other = { ...f.facts.admission.admission, placeId: "other-place" };
    f.readers.inventory.mockResolvedValue({
      ...f.facts.inventory,
      admission: other,
    });
    await expect(f.authorize()).resolves.toMatchObject(expectedOwner);
    f.readers.admission.mockResolvedValue({
      ...f.facts.admission,
      admission: other,
    });
    await expect(f.authorize()).rejects.toMatchObject({
      reason: "CONTRADICTORY_FACTS",
    });
  });

  it("returns suspended status without rejecting historical ownership or current price changes", async () => {
    const f = fixture();
    f.readers.destination.mockResolvedValue({
      ...f.facts.destination,
      status: "suspended",
    });
    f.readers.inventory.mockResolvedValue({
      ...f.facts.inventory,
      enabled: false,
      pricingVersion: "entry-v2",
      unitAmount: { ...f.facts.inventory.unitAmount, minorUnits: 900 },
    });
    f.readers.reservation.mockResolvedValue({
      ...f.facts.reservation,
      status: "cancelled",
      cancelledAt: "2026-11-02T10:00:00.000Z",
    });
    await expect(f.authorize()).resolves.toMatchObject({
      destinationStatus: "suspended",
    });
  });

  it.each(Object.keys(fixture().readers) as Reader[])(
    "sanitizes unavailable %s dependencies",
    async (reader) => {
      const f = fixture();
      f.readers[reader].mockRejectedValue(
        new Error("PRIVATE_DATABASE_DIAGNOSTIC"),
      );
      await expect(f.authorize()).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_UNAVAILABLE",
        reason: "DEPENDENCY_UNAVAILABLE",
        message: "TICKETING_OPERATOR_UNAVAILABLE",
      });
    },
  );

  it.each([
    null,
    {},
    { ...authority, subject: "guest:holder-a" },
    { ...authority, subject: " operator-a " },
    { ...authority, scope: { kind: "business", businessIds: [] } },
    { ...authority, scope: { kind: "business", businessIds: ["business-a "] } },
    { ...authority, scope: { kind: "unknown" } },
  ])(
    "rejects invalid authority before reading any resource (%#)",
    async (invalid) => {
      const f = fixture();
      await expect(
        f.authorize(invalid as TicketingOperatorAuthority),
      ).rejects.toMatchObject({
        code: "TICKETING_OPERATOR_FORBIDDEN",
        reason: "AUTHORITY_INVALID",
      });
      expect(f.readers.binding).not.toHaveBeenCalled();
    },
  );

  it("requires capability even for platform and binds the expected operator subject", async () => {
    const f = fixture();
    await expect(
      f.authorize({ ...platform, capabilities: [] }),
    ).rejects.toMatchObject({ reason: "CAPABILITY_MISSING" });
    expect(f.readers.binding).not.toHaveBeenCalled();
    expect(() =>
      requireTicketingOperatorAuthority(authority, "another-operator"),
    ).toThrow("TICKETING_OPERATOR_FORBIDDEN");
    const verified = requireTicketingOperatorAuthority(
      authority,
      authority.subject,
    );
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.capabilities)).toBe(true);
    expect(Object.isFrozen(verified.scope)).toBe(true);
    if (verified.scope.kind === "business")
      expect(Object.isFrozen(verified.scope.businessIds)).toBe(true);
  });
});
