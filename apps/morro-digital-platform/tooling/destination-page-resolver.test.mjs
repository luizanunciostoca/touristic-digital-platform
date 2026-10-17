import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePublicDestinationHosts } from "./destination-request-resolver.mjs";
import { resolvePublicDestinationPage } from "./destination-page-resolver.mjs";

const config = parsePublicDestinationHosts(
  JSON.stringify({
    "mixed.example.test": ["morro-de-sao-paulo", "itacare"],
    "itacare.example.test": ["itacare"],
    "morro.example.test": ["morro-de-sao-paulo"],
  }),
);

function resolve(host, pathname, allowedHosts = config) {
  return resolvePublicDestinationPage({ host, pathname, allowedHosts });
}

describe("public HTML destination scope", () => {
  it("preserves the Morro V1 shell on its canonical host", () => {
    assert.deepEqual(resolve("morro.example.test", "/"), {
      status: 200,
      destinationId: "morro-de-sao-paulo",
      pageKind: "legacy-morro",
    });
  });
  it("routes the Itacare hostname to a different, governed public shell", () => {
    assert.deepEqual(resolve("itacare.example.test", "/"), {
      status: 200,
      destinationId: "itacare",
      pageKind: "governed-destination",
    });
  });
  it("permits explicit Itacare slug only on its allowlisted host", () => {
    assert.deepEqual(resolve("mixed.example.test", "/d/itacare/"), {
      status: 200,
      destinationId: "itacare",
      pageKind: "governed-destination",
    });
    assert.equal(resolve("morro.example.test", "/d/itacare/").status, 404);
  });
  it("rejects untrusted hosts and malformed slug paths", () => {
    assert.equal(resolve("unknown.test", "/").status, 404);
    assert.equal(resolve("mixed.example.test", "/d/../itacare").status, 404);
    assert.equal(resolve("mixed.example.test", "/d/ITACARE/").status, 404);
    assert.equal(
      resolve("mixed.example.test", "/d/itacare/checkout").status,
      404,
    );
  });
  it("keeps old Morro homepage only when host mapping is intentionally absent", () => {
    assert.equal(resolve("localhost", "/", {}).pageKind, "legacy-morro");
    assert.equal(resolve("localhost", "/d/itacare/", {}).status, 404);
  });
  it("does not allow the legacy Morro page to appear on the Itacare hostname", () => {
    assert.notEqual(
      resolve("itacare.example.test", "/").pageKind,
      "legacy-morro",
    );
  });
});
