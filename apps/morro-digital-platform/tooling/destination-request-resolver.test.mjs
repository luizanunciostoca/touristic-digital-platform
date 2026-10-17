import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizePublicDestinationHost,
  parsePublicDestinationHosts,
  resolvePublicDestinationRequest,
} from "./destination-request-resolver.mjs";

const MORRO = "morro-de-sao-paulo";
const ITACARE = "itacare";
const allowedHosts = parsePublicDestinationHosts(
  JSON.stringify({
    "staging.example.test": [MORRO, ITACARE],
    "itacare.example.test": [ITACARE],
    "morro.example.test": [MORRO],
    localhost: [MORRO, ITACARE],
  }),
);

function resolve(host, pathname, config = allowedHosts) {
  return resolvePublicDestinationRequest({
    host,
    pathname,
    allowedHosts: config,
  });
}

describe("destination public context resolution", () => {
  it("preserves Morro at a configured default root endpoint", () => {
    assert.deepEqual(
      resolve("staging.example.test:10000", "/api/runtime/destination"),
      {
        status: 200,
        destinationId: MORRO,
        legacyMorroFallbackAllowed: true,
      },
    );
  });
  it("uses Itacare only when explicitly permitted by host and route", () => {
    assert.deepEqual(
      resolve("staging.example.test", "/d/itacare/api/runtime/destination"),
      {
        status: 200,
        destinationId: ITACARE,
        legacyMorroFallbackAllowed: false,
      },
    );
  });
  it("uses an Itacare-only host without a browser-authored destination identity", () => {
    assert.deepEqual(
      resolve("itacare.example.test", "/api/runtime/destination"),
      {
        status: 200,
        destinationId: ITACARE,
        legacyMorroFallbackAllowed: false,
      },
    );
  });
  it("rejects Morro on a hostname restricted to Itacare", () => {
    assert.equal(
      resolve(
        "itacare.example.test",
        "/d/morro-de-sao-paulo/api/runtime/destination",
      ).status,
      404,
    );
  });
  it("rejects Itacare from Morro-only hostname", () => {
    assert.equal(
      resolve("morro.example.test", "/d/itacare/api/runtime/destination")
        .status,
      404,
    );
  });
  it("rejects unconfigured hosts when operating in allowlist mode", () => {
    assert.equal(
      resolve("unexpected.example.test", "/api/runtime/destination").status,
      404,
    );
  });
  it("never treats forwarded headers or query strings as destination authorization", () => {
    assert.equal(
      resolve(
        "staging.example.test",
        "/api/runtime/destination?destination=itacare",
      ).status,
      404,
    );
    assert.equal(
      resolve("evil.example.test", "/d/itacare/api/runtime/destination").status,
      404,
    );
  });
  it("preserves the legacy Morro root only without a configured host map", () => {
    assert.equal(
      resolve("localhost", "/api/runtime/destination", {}).destinationId,
      MORRO,
    );
    assert.equal(
      resolve("localhost", "/d/itacare/api/runtime/destination", {}).status,
      404,
    );
  });
  it("rejects unknown routes and mixed-case / invalid slugs", () => {
    assert.equal(
      resolve("localhost", "/d/Itacare/api/runtime/destination").status,
      404,
    );
    assert.equal(
      resolve("localhost", "/d/../../../etc/passwd/api/runtime/destination")
        .status,
      404,
    );
    assert.equal(
      resolve("localhost", "/d/itacare/api/runtime/destination/other").status,
      404,
    );
    assert.equal(resolve("localhost", "/d/itacare/elsewhere").status, 404);
  });
  it("normalizes valid host port safely", () => {
    assert.equal(
      normalizePublicDestinationHost("LOCALHOST:10000"),
      "localhost",
    );
    assert.equal(
      normalizePublicDestinationHost("itacare.example.test"),
      "itacare.example.test",
    );
    assert.equal(
      normalizePublicDestinationHost("evil.example.test@itacare.example.test"),
      null,
    );
    assert.equal(
      normalizePublicDestinationHost("itacare.example.test/path"),
      null,
    );
    assert.equal(normalizePublicDestinationHost(""), null);
    assert.equal(normalizePublicDestinationHost(null), null);
  });
  it("rejects unsafe host rules at configuration read time", () => {
    for (const raw of [
      "{bad",
      "[]",
      "{}",
      JSON.stringify({ "evil/path": [ITACARE] }),
      JSON.stringify({ "example.test": ["ITACARE"] }),
      JSON.stringify({ "example.test": [ITACARE, ITACARE] }),
      JSON.stringify({ "example.test": [] }),
      JSON.stringify({ "EXAMPLE.test": [ITACARE] }),
    ]) {
      assert.throws(() => parsePublicDestinationHosts(raw));
    }
  });
  it("accepts an IPv4 development host with a port", () => {
    const config = parsePublicDestinationHosts(
      '{"127.0.0.1":["morro-de-sao-paulo","itacare"]}',
    );
    assert.equal(
      resolve("127.0.0.1:4173", "/d/itacare/api/runtime/destination", config)
        .destinationId,
      ITACARE,
    );
  });
});
