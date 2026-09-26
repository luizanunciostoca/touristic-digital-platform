import assert from "node:assert/strict";
import test from "node:test";

import { createTicketingApi } from "./ticketing-api.mjs";

function apiFor({ bindings, inventoryResponse }) {
  const calls = [];
  const businessInventory = {
    async listCatalogBindings(businessId, offerIds) {
      calls.push({ operation: "bindings", businessId, offerIds });
      return bindings;
    },
  };
  const publicTransport = {
    async handle(request) {
      calls.push({ operation: "inventory", request });
      return inventoryResponse;
    },
  };
  return {
    api: createTicketingApi({
      publicTransport,
      businessInventory,
      adminService: null,
    }),
    calls,
  };
}

test("Ticketing action facts join availability only through canonical Offer binding", async () => {
  const { api, calls } = apiFor({
    bindings: [
      {
        inventoryId: "mpi_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        businessId: "business-a",
        offerId: "offer-a",
      },
    ],
    inventoryResponse: {
      status: 200,
      headers: {},
      body: {
        data: [
          {
            id: "mpi_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            availableQuantity: 7,
          },
          {
            id: "mpi_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            availableQuantity: 99,
          },
        ],
      },
    },
  });

  const facts = await api.actionFactsForOffers({
    businessId: "business-a",
    offerIds: ["offer-a"],
  });

  assert.deepEqual(facts, [
    {
      offerId: "offer-a",
      availableQuantity: 7,
      providerAvailable: true,
    },
  ]);
  assert.deepEqual(calls[0], {
    operation: "bindings",
    businessId: "business-a",
    offerIds: ["offer-a"],
  });
  assert.equal(calls[1].request.pathname, "/api/ticketing/v1/inventory");
});

test("Ticketing action facts fail closed when a bound inventory is unavailable", async () => {
  const { api } = apiFor({
    bindings: [
      {
        inventoryId: "mpi_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        businessId: "business-a",
        offerId: "offer-a",
      },
    ],
    inventoryResponse: {
      status: 503,
      headers: {},
      body: { error: "TICKETING_UNAVAILABLE" },
    },
  });

  assert.deepEqual(
    await api.actionFactsForOffers({
      businessId: "business-a",
      offerIds: ["offer-a"],
    }),
    [
      {
        offerId: "offer-a",
        availableQuantity: null,
        providerAvailable: false,
      },
    ],
  );
});

test("Ticketing action facts never correlate unbound inventory by legacy reference", async () => {
  const { api, calls } = apiFor({
    bindings: [],
    inventoryResponse: {
      status: 200,
      headers: {},
      body: {
        data: [
          {
            id: "mpi_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            product: { reference: "legacy:offer-a" },
            availableQuantity: 10,
          },
        ],
      },
    },
  });

  assert.deepEqual(
    await api.actionFactsForOffers({
      businessId: "business-a",
      offerIds: ["offer-a"],
    }),
    [],
  );
  assert.equal(
    calls.filter(({ operation }) => operation === "inventory").length,
    0,
  );
});
