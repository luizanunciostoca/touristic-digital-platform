import assert from "node:assert/strict";
const { describe, it } =
  process.env.VITEST === "true"
    ? await import("vitest")
    : await import("node:test");
import { parsePublicDestinationTemplates } from "./destination-public-templates.mjs";
import {
  projectPublicDestination,
  resolvePublicDestination,
} from "./destination-public-projection.mjs";

const morro = Object.freeze({
  id: "morro-de-sao-paulo",
  name: "Morro de São Paulo",
  countryCode: "BR",
  timezone: "America/Bahia",
  currency: "BRL",
  center: { latitude: -13.3833, longitude: -38.9167 },
  radiusMeters: 15000,
  modules: { map: true, assistant: true },
});
const itacare = Object.freeze({
  id: "itacare",
  name: "Itacaré",
  countryCode: "BR",
  timezone: "America/Bahia",
  currency: "BRL",
  center: { latitude: -14.278, longitude: -39.0 },
  radiusMeters: 35000,
  modules: { map: true, assistant: true, payments: false },
});
const active = {
  id: "itacare",
  status: "active",
  branding: { name: "Itacaré Digital" },
  timezone: "America/Bahia",
  currency: "BRL",
  center: { lat: -14.278, lng: -39.0 },
  modules: ["map", "assistant"],
  featureFlags: { payments: false },
};

describe("trusted destination template + owner binding", () => {
  it("does not create Itacare from an absent env", () => {
    const templates = parsePublicDestinationTemplates("", morro);
    assert.deepEqual(Object.keys(templates), ["morro-de-sao-paulo"]);
  });
  it("preserves owner data and context for Itacare", () => {
    const templates = parsePublicDestinationTemplates(
      JSON.stringify({ itacare }),
      morro,
    );
    const projection = projectPublicDestination(active, templates.itacare);
    assert.equal(projection.id, "itacare");
    assert.equal(projection.name, "Itacaré Digital");
    assert.deepEqual(projection.center, {
      latitude: -14.278,
      longitude: -39.0,
    });
    assert.equal(projection.modules.payments, false);
  });
  it("refuses cross-destination and suspended data", () => {
    assert.equal(
      projectPublicDestination(
        { ...active, id: "morro-de-sao-paulo" },
        itacare,
      ),
      null,
    );
    assert.equal(
      projectPublicDestination({ ...active, status: "suspended" }, itacare),
      null,
    );
    assert.equal(
      projectPublicDestination(
        { ...active, center: { lat: 500, lng: 0 } },
        itacare,
      ),
      null,
    );
    assert.equal(
      projectPublicDestination(
        { ...active, center: { lat: 90, lng: 0 } },
        itacare,
      ),
      null,
    );
  });
  it("does not return Morro on Itacare owner outage", async () => {
    assert.equal(
      await resolvePublicDestination({ state: "unavailable" }, itacare, {
        requireOwner: true,
      }),
      null,
    );
    assert.equal(
      await resolvePublicDestination(
        {
          state: "configured",
          service: {
            read: async () => {
              throw new Error("db down");
            },
          },
        },
        itacare,
        { requireOwner: true },
      ),
      null,
    );
  });
  it("returns null when Itacare owner record is absent", async () => {
    assert.equal(
      await resolvePublicDestination(
        {
          state: "configured",
          service: { read: async () => ({ status: "not_found" }) },
        },
        itacare,
        { requireOwner: true },
      ),
      null,
    );
  });
  it("rejects unknown or malformed public templates", () => {
    for (const invalid of [
      { ...itacare, id: "other" },
      { ...itacare, radiusMeters: -1 },
      { ...itacare, radiusMeters: 100_001 },
      { ...itacare, center: { latitude: 90, longitude: 0 } },
      { ...itacare, center: { latitude: 999, longitude: 0 } },
      { ...itacare, timezone: "Never/Real" },
      { ...itacare, modules: { payments: "true" } },
    ]) {
      assert.throws(() =>
        parsePublicDestinationTemplates(
          JSON.stringify({ itacare: invalid }),
          morro,
        ),
      );
    }
  });
});

describe("only legacy Morro can use owner-unavailable fallback", () => {
  const unavailableOwners = {
    unavailable: { state: "unavailable" },
    missingService: { state: "configured" },
    absent: {
      state: "configured",
      service: { read: async () => ({ status: "not_found" }) },
    },
    suspended: {
      state: "configured",
      service: { read: async () => ({ ...active, status: "suspended" }) },
    },
    mismatch: {
      state: "configured",
      service: { read: async () => ({ ...active, id: "foreign" }) },
    },
    thrown: {
      state: "configured",
      service: {
        read: async () => {
          throw new Error("owner down");
        },
      },
    },
  };
  for (const [name, owner] of Object.entries(unavailableOwners)) {
    it(`fails closed for a new destination when owner is ${name} without a flag or with false`, async () => {
      assert.equal(await resolvePublicDestination(owner, itacare), null);
      assert.equal(
        await resolvePublicDestination(owner, itacare, { requireOwner: false }),
        null,
      );
      assert.equal(
        await resolvePublicDestination(owner, itacare, { requireOwner: true }),
        null,
      );
    });
  }
  it("accepts an active matching new owner without a flag or with false", async () => {
    const owner = {
      state: "configured",
      service: { read: async () => active },
    };
    assert.equal(
      (await resolvePublicDestination(owner, itacare)).id,
      "itacare",
    );
    assert.equal(
      (await resolvePublicDestination(owner, itacare, { requireOwner: false }))
        .id,
      "itacare",
    );
  });
  it("preserves the Morro fallback unless its owner is explicitly required", async () => {
    for (const owner of Object.values(unavailableOwners)) {
      assert.equal(await resolvePublicDestination(owner, morro), morro);
      assert.equal(
        await resolvePublicDestination(owner, morro, { requireOwner: false }),
        morro,
      );
      assert.equal(
        await resolvePublicDestination(owner, morro, { requireOwner: true }),
        null,
      );
    }
  });
});
