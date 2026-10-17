import assert from "node:assert/strict";
const { describe, it } =
  process.env.VITEST === "true"
    ? await import("vitest")
    : await import("node:test");
import {
  publicDestinationApiHostGate,
  resolveTrustedPlaceDestinationScope,
} from "./destination-api-host-gate.mjs";
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

for (const destinations of [
  ["itacare", "other"],
  ["itacare", "morro-de-sao-paulo"],
  ["other", "itacare"],
]) {
  it(`restricts unscoped routes when the default destination is ${destinations.join(",")}`, () => {
    const configured = { "shared-new.example.test": destinations };
    for (const pathname of [
      "/api/weather",
      "/api/assistant",
      "/api/payments/v1/create",
      "/api/places/v1/place-1",
      "/media/morro-photo.jpg",
      "/media%2Fmorro-photo.jpg",
      "/index.html",
      "/apps/admin-crm/public/index.html",
      "/proposals/view/aaaaaaaaaaaaaaaa",
      "/contracts/view/aaaaaaaaaaaaaaaa",
    ]) {
      assert.equal(
        guard("shared-new.example.test", pathname, "", configured).status,
        404,
        pathname,
      );
    }
    for (const destination of destinations) {
      assert.equal(
        guard(
          "shared-new.example.test",
          "/api/places/v1/map",
          destination,
          configured,
        ),
        null,
      );
    }
    assert.equal(
      guard(
        "shared-new.example.test",
        "/api/runtime/destination",
        "",
        configured,
      ),
      null,
    );
  });
}

describe("trusted server Place context", () => {
  it("derives only admitted host/prefix scopes and keeps legacy omission distinct", () => {
    assert.deepEqual(
      resolveTrustedPlaceDestinationScope({
        host: "localhost",
        pathname: "/api/places/v1/place-1",
        allowedHosts: {},
      }),
      { status: 200, pathname: "/api/places/v1/place-1" },
    );
    for (const [host, pathname] of [
      ["foreign.test", "/api/places/v1/place-1"],
      ["itacare.example.test", "/d/morro-de-sao-paulo/api/places/v1/place-1"],
      ["itacare.example.test", "/d/../api/places/v1/place-1"],
    ]) {
      assert.equal(
        resolveTrustedPlaceDestinationScope({
          host,
          pathname,
          allowedHosts: hosts,
        }).status,
        404,
      );
    }
    const context = resolveTrustedPlaceDestinationScope({
      host: "staging.example.test",
      pathname: "/d/itacare/api/places/v1/place-1",
      allowedHosts: hosts,
    });
    assert.deepEqual(context.scope, { destinationId: "itacare" });
    assert.equal(
      publicDestinationApiHostGate({
        host: "staging.example.test",
        pathname: context.pathname,
        allowedHosts: hosts,
        trustedDestinationScope: context.scope,
      }),
      null,
    );
  });
  it("keeps dedicated detail closed unless a valid server scope is supplied", () => {
    for (const scope of [undefined, null, {}, { destinationId: "foreign" }])
      assert.equal(
        publicDestinationApiHostGate({
          host: "itacare.example.test",
          pathname: "/api/places/v1/place-1",
          allowedHosts: hosts,
          trustedDestinationScope: scope,
        }).status,
        404,
      );
    const scoped = {
      host: "itacare.example.test",
      pathname: "/api/places/v1/place-1",
      allowedHosts: hosts,
      trustedDestinationScope: { destinationId: "itacare" },
    };
    assert.equal(publicDestinationApiHostGate(scoped), null);
    for (const pathname of [
      "/media/image.jpg",
      "/api/crm/leads",
      "/private.html",
      "/contracts/view/a",
    ])
      assert.equal(
        publicDestinationApiHostGate({ ...scoped, pathname }).status,
        404,
      );
  });
});
