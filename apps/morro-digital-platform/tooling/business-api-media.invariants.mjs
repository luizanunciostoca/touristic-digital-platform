import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createBusinessApi } from "./business-api.mjs";

function responseCapture() {
  return {
    statusCode: 0,
    body: "",
    setHeader() {},
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

function fixture(role = "owner") {
  const authorizations = [];
  const calls = [];
  const authApi = {
    async authorizeBusinessRequest(_request, _response, businessId, options) {
      authorizations.push({ businessId, options });
      return {
        session: { subject: `${role}-a`, role, businessIds: [businessId] },
        businessId,
      };
    },
  };
  const runtime = {
    async getMediaDraft(businessId) {
      calls.push({ operation: "read", businessId });
      return { count: 0, storageAvailable: true, assets: [] };
    },
    async uploadMediaDraft(actor, businessId, input) {
      calls.push({ operation: "upload", actor, businessId, input });
      return { mediaId: "media-1" };
    },
    async updateMediaDraft(actor, businessId, mediaId, input) {
      calls.push({ operation: "update", actor, businessId, mediaId, input });
      return { mediaId };
    },
    async reorderMediaDraft(actor, businessId, orderedMediaIds) {
      calls.push({ operation: "reorder", actor, businessId, orderedMediaIds });
      return orderedMediaIds;
    },
    async deleteMediaDraft(actor, businessId, mediaId) {
      calls.push({ operation: "delete", actor, businessId, mediaId });
    },
  };
  return {
    api: createBusinessApi({
      authApi,
      getPlacePlatformRuntime: () => runtime,
    }),
    calls,
    authorizations,
  };
}

test("Morro Pro Media preserves tenant scope and content capabilities", async () => {
  const owner = fixture("owner");

  const read = responseCapture();
  await owner.api.handle(
    request("GET"),
    read,
    "/api/business/business-a/media",
  );
  assert.equal(read.statusCode, 200);
  assert.deepEqual(owner.authorizations[0], {
    businessId: "business-a",
    options: { mutation: false, auditAction: "business.media.read" },
  });
  assert.deepEqual(owner.calls[0], { operation: "read", businessId: "business-a" });

  const upload = responseCapture();
  await owner.api.handle(
    request("POST", {
      fileName: "cover.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      alt: "Capa",
      role: "cover",
      published: true,
      dataBase64: "AA==",
    }),
    upload,
    "/api/business/business-a/media",
  );
  assert.equal(upload.statusCode, 201);
  assert.equal(owner.authorizations[1].options.mutation, true);
  assert.equal(owner.calls[1].operation, "upload");
  assert.equal(owner.calls[1].businessId, "business-a");

  const manager = fixture("manager");
  const managerRead = responseCapture();
  await manager.api.handle(
    request("GET"),
    managerRead,
    "/api/business/business-a/media",
  );
  assert.equal(managerRead.statusCode, 200);
  assert.equal(manager.calls.length, 1);

  const managerWrite = responseCapture();
  await manager.api.handle(
    request("PUT", { role: "gallery" }),
    managerWrite,
    "/api/business/business-a/media/media-1",
  );
  assert.equal(managerWrite.statusCode, 403);
  assert.deepEqual(JSON.parse(managerWrite.body), {
    error: "CAPABILITY_DENIED",
    capability: "content.manage",
  });
  assert.equal(manager.calls.length, 1);
});

test("Morro Pro Media fails closed without canonical Place runtime", async () => {
  const authApi = {
    async authorizeBusinessRequest(_request, _response, businessId) {
      return {
        session: { subject: "owner-a", role: "owner", businessIds: [businessId] },
        businessId,
      };
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
    "/api/business/business-a/media",
  );
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: "PLACE_PLATFORM_UNAVAILABLE",
  });
});
