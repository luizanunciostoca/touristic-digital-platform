// Dedicated Node/MySQL E2E proof; intentionally outside Vitest test discovery.
import assert from "node:assert/strict";
import test from "node:test";
import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

const databaseUrl = process.env.BUSINESS_DATABASE_URL || "";

const actor = Object.freeze({
  subject: "platform-owner-test",
  email: "platform-owner@example.test",
  role: "PLATFORM_OWNER",
  businessIds: Object.freeze([]),
  issuedAt: Math.floor(Date.now() / 1000) - 60,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  sessionId: "place-runtime-integration-session",
});

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
    header(name) {
      return headers.get(String(name).toLowerCase());
    },
  };
}

test(
  "persists draft, publishes an exact revision and serves the public Place API",
  { skip: !databaseUrl },
  async () => {
    const runtime = createPlacePlatformRuntime({
      getEnvironmentValue(key) {
        if (key === "BUSINESS_DATABASE_URL") return databaseUrl;
        if (key === "CONTENT_DATABASE_URL") return "";
        return "";
      },
      platformOperations: { emit() {} },
    });

    assert.equal(await runtime.start(), true);
    try {
      const unique = `runtime-${Date.now()}`;
      const businessId = `business-${unique}`;
      const created = await runtime.createDraft(actor, {
        businessId,
        placeId: `place-${unique}`,
        destinationId: "morro-de-sao-paulo",
        categoryId: "nightlife",
        name: "Runtime Integration Place",
        shortDescription: "Descrição inicial integrada",
      });
      assert.equal(created.businessId, businessId);

      await runtime.updateProfile(actor, businessId, {
        name: "Runtime Integration Place",
        categoryId: "nightlife",
        shortDescription: "Descrição curta publicada",
        description:
          "Descrição pública persistida pelo runtime canônico Business/Place.",
        tags: "nightlife, integration",
        amenities: "wifi",
      });

      const locationRevision = await runtime.updateLocation(actor, businessId, {
        latitude: -13.3776,
        longitude: -38.9142,
        address: "Morro de São Paulo",
        area: "Centro",
        source: "manual",
      });

      const reviewed = await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        locationRevision.editableRevision.revision,
      );
      const published = await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        reviewed.editableRevision.revision,
      );
      assert.equal(published.publicationState, "published");
      assert.ok(published.publishedRevision);
      assert.equal(
        published.publishedRevision.revision,
        published.editableRevision.revision,
      );

      const mapResponse = responseCapture();
      const mapUrl = new URL(
        "http://127.0.0.1/api/places/v1/map?destinationId=morro-de-sao-paulo&bbox=-39,-14,-38,-13&zoom=14",
      );
      const mapHandled = await runtime.handlePublic(
        { method: "GET", headers: {} },
        mapResponse,
        mapUrl,
      );
      assert.equal(mapHandled, true);
      assert.equal(mapResponse.statusCode, 200);
      const mapBody = JSON.parse(mapResponse.body);
      assert.ok(
        mapBody.items.some((item) => item.id === created.placeId),
        "published Place must be present in canonical public map projection",
      );
      assert.match(mapResponse.header("etag"), /^W\/"places-map-/u);

      const detailResponse = responseCapture();
      const detailHandled = await runtime.handlePublic(
        { method: "GET", headers: {} },
        detailResponse,
        new URL(
          `http://127.0.0.1/api/places/v1/${encodeURIComponent(created.placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(detailHandled, true);
      assert.equal(detailResponse.statusCode, 200);
      const detail = JSON.parse(detailResponse.body);
      assert.equal(detail.profile.id, created.placeId);
      assert.equal(Object.hasOwn(detail.profile, "businessId"), false);
      assert.equal(detail.actions.businessId, businessId);
      assert.equal(detail.profile.location.latitude, -13.3776);
      assert.equal(detail.profile.description.includes("persistida"), true);
      assert.equal(
        detail.revision.number,
        published.publishedRevision.revision,
      );
    } finally {
      await runtime.stop();
    }
  },
);

test("fails closed when Business persistence is not configured", async () => {
  const runtime = createPlacePlatformRuntime({
    getEnvironmentValue() {
      return "";
    },
    platformOperations: { emit() {} },
  });
  assert.equal(await runtime.start(), false);
  assert.deepEqual(runtime.readinessCheck(), {
    status: "fail",
    critical: false,
    detail: "BUSINESS_DATABASE_URL_REQUIRED",
  });
  await runtime.stop();
});
