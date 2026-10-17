import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicDestinationApiHostGate } from "./destination-api-host-gate.mjs";
const hosts = {
  "itacare.example.test": ["itacare"],
  "staging.example.test": ["morro-de-sao-paulo", "itacare"],
};
const guard = (host, pathname, destinationId, allowedHosts = hosts) =>
  publicDestinationApiHostGate({
    host,
    pathname,
    query: new URLSearchParams(destinationId ? { destinationId } : {}),
    allowedHosts,
  });
describe("destination-only API host gate", () => {
  it("allows Itacare map read only with matching destinationId", () => {
    assert.equal(
      guard("itacare.example.test", "/api/places/v1/map", "itacare"),
      null,
    );
    assert.equal(
      guard("itacare.example.test", "/api/places/v1/map", "morro-de-sao-paulo")
        .status,
      404,
    );
    assert.equal(
      guard("itacare.example.test", "/api/places/v1/map", "").status,
      404,
    );
  });
  it("denies Morro-only APIs on dedicated Itacare host", () => {
    for (const path of [
      "/api/weather",
      "/api/assistant",
      "/api/payments/v1/create",
    ]) {
      assert.equal(guard("itacare.example.test", path).status, 404);
    }
  });
  it("blocks Morro media and all direct HTML documents on dedicated hosts", () => {
    for (const path of [
      "/media/morro-photo.jpg",
      "/media%2Fmorro-photo.jpg",
      "/index.html",
      "/apps/control-center/public/index.html",
      "/apps/admin-crm/public/index.html",
      "/proposals/view/aaaaaaaaaaaaaaaa",
      "/contracts/view/aaaaaaaaaaaaaaaa",
      "/apps/morro-digital-platform/public/index%2Ehtml",
    ]) {
      assert.equal(
        guard("itacare.example.test", path).status,
        404,
        "DEDICATED_HOST_STATIC_LEAK:" + path,
      );
    }
    assert.equal(guard("staging.example.test", "/index.html"), null);
    assert.equal(guard("staging.example.test", "/media/morro-photo.jpg"), null);
    assert.equal(
      guard(
        "itacare.example.test",
        "/apps/morro-digital-platform/public/destination.css",
      ),
      null,
    );
    assert.equal(guard("foreign.example.test", "/index.html").status, 404);
  });
  it("preserves legacy Morro APIs on shared and unconfigured hosts", () => {
    assert.equal(guard("staging.example.test", "/api/weather"), null);
    assert.equal(guard("localhost", "/api/weather", "", {}), null);
  });
  it("rejects unknown hosts and out-of-scope map reads", () => {
    assert.equal(guard("foreign.example.test", "/api/weather").status, 404);
    assert.equal(
      guard("staging.example.test", "/api/places/v1/map", "other").status,
      404,
    );
  });
});
