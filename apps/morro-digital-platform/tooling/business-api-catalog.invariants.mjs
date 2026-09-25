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

test("Business Catalog routes preserve the Auth tenant/mutation boundary", async () => {
  const authorizations = [];
  const catalogCalls = [];
  const authApi = {
    async authorizeBusinessRequest(_request, _response, businessId, options) {
      authorizations.push({ businessId, options });
      if (businessId === "denied-business") return null;
      return {
        session: { subject: "owner-a" },
        businessId,
      };
    },
  };
  const placePlatformRuntime = {
    async getBusinessCatalog(businessId) {
      catalogCalls.push({ kind: "read", businessId });
      return {
        products: [],
        offers: [],
        menus: [],
        categories: [],
        items: [],
      };
    },
    async createCatalogDraft(businessId, kind, input) {
      catalogCalls.push({ kind, businessId, input });
      return { id: "product-a", status: "draft" };
    },
  };
  const api = createBusinessApi({ authApi, placePlatformRuntime });

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
    kind: "read",
    businessId: "business-a",
  });

  const createResponse = responseCapture();
  await api.handle(
    request("POST", { name: "Sunset", description: "Draft canônico" }),
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
    kind: "product",
    businessId: "business-a",
    input: { name: "Sunset", description: "Draft canônico" },
  });

  const deniedResponse = responseCapture();
  await api.handle(
    request("POST", { name: "Denied" }),
    deniedResponse,
    "/api/business/denied-business/catalog/product",
  );
  assert.equal(catalogCalls.length, 2);
});
