// Dedicated Catalog/MySQL E2E proof; intentionally outside Vitest discovery.
import assert from "node:assert/strict";
import test from "node:test";

import { createMySqlPool } from "@touristic/content-server";

import {
  applyCatalogSchema,
  createCatalogRuntime,
} from "./catalog-platform-runtime.mjs";
import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

const databaseUrl = process.env.BUSINESS_DATABASE_URL || "";

const actor = Object.freeze({
  subject: "catalog-runtime-test",
  email: "catalog-runtime@example.test",
  role: "PLATFORM_OWNER",
  businessIds: Object.freeze([]),
  issuedAt: Math.floor(Date.now() / 1000) - 60,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  sessionId: "catalog-runtime-session",
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
  "persists canonical catalog and projects commerce/actions through public Place detail",
  { skip: !databaseUrl },
  async () => {
    const placeRuntime = createPlacePlatformRuntime({
      getEnvironmentValue(key) {
        if (key === "BUSINESS_DATABASE_URL") return databaseUrl;
        if (key === "CONTENT_DATABASE_URL") return "";
        return "";
      },
      platformOperations: { emit() {} },
      actionFactsProvider: {
        async actionFactsForOffers({ offerIds }) {
          return offerIds.map((offerId) => ({
            offerId,
            availableQuantity: 10,
            providerAvailable: true,
          }));
        },
      },
    });
    assert.equal(await placeRuntime.start(), true);

    const pool = createMySqlPool(databaseUrl, {
      connectionLimit: 2,
      errorPrefix: "CATALOG_TEST_DATABASE",
    });

    try {
      await applyCatalogSchema(pool);
      const catalog = createCatalogRuntime(pool);
      const suffix = Date.now().toString(36);
      const businessId = `business-catalog-${suffix}`;
      const placeId = `place-catalog-${suffix}`;
      const productId = `product-catalog-${suffix}`;
      const offerId = `offer-catalog-${suffix}`;
      const menuId = `menu-catalog-${suffix}`;
      const categoryId = `menu-category-${suffix}`;
      const itemId = `menu-item-${suffix}`;
      const now = new Date().toISOString();

      await placeRuntime.createDraft(actor, {
        businessId,
        placeId,
        destinationId: "morro-de-sao-paulo",
        categoryId: "nightlife",
        name: "Catalog Integration Place",
        shortDescription: "Place com catálogo canônico persistido",
        capabilities: ["directions", "products", "offers", "menu", "tickets"],
      });
      const locationRevision = await placeRuntime.updateLocation(
        actor,
        businessId,
        {
          latitude: -13.3776,
          longitude: -38.9142,
          address: "Morro de São Paulo",
          area: "Centro",
          source: "manual",
        },
      );

      const scope = { businessId };
      await catalog.service.createProduct(scope, {
        id: productId,
        businessId,
        placeId,
        destinationId: "morro-de-sao-paulo",
        name: "Experiência Sunset",
        description: "Produto canônico do Place",
        status: "active",
        tags: Object.freeze(["sunset"]),
        legacyReference: null,
        createdAt: now,
        updatedAt: now,
      });
      await catalog.service.createOffer(scope, {
        id: offerId,
        businessId,
        placeId,
        destinationId: "morro-de-sao-paulo",
        productId,
        price: Object.freeze({ minorUnits: 15_000, currency: "BRL" }),
        salesStartsAt: null,
        salesEndsAt: null,
        experienceStartsAt: null,
        experienceEndsAt: null,
        capacity: null,
        status: "active",
        legacyLabel: null,
        createdAt: now,
        updatedAt: now,
      });
      await catalog.service.createMenu(scope, {
        id: menuId,
        businessId,
        placeId,
        name: "Menu Principal",
        description: "Menu canônico",
        status: "active",
        fallbackMediaId: null,
        fallbackDocumentUrl: null,
        createdAt: now,
        updatedAt: now,
      });
      await catalog.service.saveMenuCategory(scope, {
        id: categoryId,
        businessId,
        menuId,
        name: "Entradas",
        sortOrder: 0,
      });
      await catalog.service.saveMenuItem(scope, {
        id: itemId,
        businessId,
        menuId,
        categoryId,
        name: "Ceviche",
        description: "Ceviche tropical",
        price: Object.freeze({ minorUnits: 4_500, currency: "BRL" }),
        mediaId: null,
        available: true,
        tags: Object.freeze(["fresh"]),
        allergens: Object.freeze([]),
        sortOrder: 0,
      });

      const review = await placeRuntime.transitionPublication(
        actor,
        businessId,
        "review",
        locationRevision.editableRevision.revision,
      );
      await placeRuntime.transitionPublication(
        actor,
        businessId,
        "publish",
        review.editableRevision.revision,
      );

      const response = responseCapture();
      const handled = await placeRuntime.handlePublic(
        { method: "GET", headers: {} },
        response,
        new URL(
          `http://127.0.0.1/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(handled, true);
      assert.equal(response.statusCode, 200);

      const detail = JSON.parse(response.body);
      assert.equal(detail.commerce.offers.length, 1);
      assert.equal(detail.commerce.offers[0].id, offerId);
      assert.equal(detail.commerce.offers[0].productId, productId);
      assert.equal(detail.commerce.menu.id, menuId);
      assert.equal(detail.commerce.menu.categories[0].items[0].id, itemId);

      const actions = [
        detail.actions.primaryAction,
        ...detail.actions.secondaryActions,
      ].filter(Boolean);
      const actionIds = new Set(actions.map((action) => action.id));
      assert.equal(actionIds.has("offers"), true);
      assert.equal(actionIds.has("menu"), true);
      assert.equal(actionIds.has("tickets"), true);

      const counts = await catalog.getCounts(businessId, placeId);
      assert.deepEqual(counts, {
        productCount: 1,
        offerCount: 1,
        menuCount: 1,
      });

      await assert.rejects(
        catalog.service.createProduct(
          { businessId },
          {
            id: `wrong-destination-${suffix}`,
            businessId,
            placeId: null,
            destinationId: "other-destination",
            name: "Wrong Destination Product",
            description: "Must not bind outside the Business destination scope",
            status: "active",
            tags: Object.freeze([]),
            legacyReference: null,
            createdAt: now,
            updatedAt: now,
          },
        ),
        /CATALOG_DESTINATION_OWNER_MISMATCH/u,
      );

      await assert.rejects(
        catalog.service.createProduct(
          { businessId: `foreign-${suffix}` },
          {
            id: `foreign-product-${suffix}`,
            businessId: `foreign-${suffix}`,
            placeId,
            destinationId: "morro-de-sao-paulo",
            name: "Foreign Product",
            description: "Must not attach to another Business Place",
            status: "active",
            tags: Object.freeze([]),
            legacyReference: null,
            createdAt: now,
            updatedAt: now,
          },
        ),
        /CATALOG_PLACE_OWNER_MISMATCH/u,
      );
    } finally {
      await pool.end();
      await placeRuntime.stop();
    }
  },
);
