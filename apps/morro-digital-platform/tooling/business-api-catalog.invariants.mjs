import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createBusinessApi } from "./business-api.mjs";

function responseCapture() {
  const headers = new Map();
  return {
    statusCode: 0,
    body: "",
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

function request(method, body = null) {
  const source = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  const stream = Readable.from(source);
  stream.method = method;
  stream.headers = {};
  return stream;
}

test("Business Catalog routes preserve tenant and mutation authority", async () => {
  const authorizations = [];
  const catalogCalls = [];
  const authApi = {
    async authorizeBusinessRequest(_request, response, businessId, options) {
      authorizations.push({ businessId, options });
      if (businessId === "denied-business") {
        response.statusCode = 403;
        response.end(JSON.stringify({ error: "BUSINESS_ACCESS_DENIED" }));
        return null;
      }
      return {
        session: { subject: "owner-a" },
        businessId,
      };
    },
  };
  const runtime = {
    async getCatalogDraft(businessId) {
      catalogCalls.push({ operation: "read", businessId });
      return {
        products: [],
        offers: [],
        menus: [],
        categories: [],
        items: [],
      };
    },
    async createCatalogDraft(actor, businessId, kind, input) {
      catalogCalls.push({
        operation: "create",
        actor,
        businessId,
        kind,
        input,
      });
      return { id: "product-a", status: "draft" };
    },
    async updateCatalogDraft(actor, businessId, kind, id, input) {
      catalogCalls.push({
        operation: "update",
        actor,
        businessId,
        kind,
        id,
        input,
      });
      return { id, status: input.status ?? "draft" };
    },
  };
  const api = createBusinessApi({
    authApi,
    getPlacePlatformRuntime: () => runtime,
  });

  const readResponse = responseCapture();
  await api.handle(
    request("GET"),
    readResponse,
    "/api/business/business-a/catalog",
  );
  assert.equal(readResponse.statusCode, 200);
  assert.deepEqual(authorizations[0], {
    businessId: "business-a",
    options: {
      mutation: false,
      auditAction: "business.catalog.read",
    },
  });
  assert.deepEqual(catalogCalls[0], {
    operation: "read",
    businessId: "business-a",
  });

  const createResponse = responseCapture();
  await api.handle(
    request("POST", { name: "Sunset" }),
    createResponse,
    "/api/business/business-a/catalog/product",
  );
  assert.equal(createResponse.statusCode, 201);
  assert.deepEqual(authorizations[1], {
    businessId: "business-a",
    options: {
      mutation: true,
      auditAction: "business.catalog.write",
    },
  });
  assert.deepEqual(catalogCalls[1], {
    operation: "create",
    actor: { subject: "owner-a" },
    businessId: "business-a",
    kind: "product",
    input: { name: "Sunset" },
  });

  const updateResponse = responseCapture();
  await api.handle(
    request("PUT", { status: "active" }),
    updateResponse,
    "/api/business/business-a/catalog/product/product-a",
  );
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(catalogCalls[2], {
    operation: "update",
    actor: { subject: "owner-a" },
    businessId: "business-a",
    kind: "product",
    id: "product-a",
    input: { status: "active" },
  });

  const deniedResponse = responseCapture();
  await api.handle(
    request("POST", {
      name: "Denied",
      businessId: "business-a",
      placeId: "place-a",
      destinationId: "morro-de-sao-paulo",
    }),
    deniedResponse,
    "/api/business/denied-business/catalog/product",
  );
  assert.equal(deniedResponse.statusCode, 403);
  assert.equal(catalogCalls.length, 3);
  assert.equal(authorizations[3].businessId, "denied-business");
  assert.equal(authorizations[3].options.mutation, true);
});

test("Business Catalog fails closed when canonical Place runtime is unavailable", async () => {
  const authApi = {
    async authorizeBusinessRequest(_request, _response, businessId) {
      return { session: { subject: "owner-a" }, businessId };
    },
  };
  const api = createBusinessApi({
    authApi,
    getPlacePlatformRuntime: () => null,
  });
  const response = responseCapture();
  await api.handle(
    request("GET"),
    response,
    "/api/business/business-a/catalog",
  );
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: "PLACE_PLATFORM_UNAVAILABLE",
  });
});
