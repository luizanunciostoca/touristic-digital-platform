import assert from "node:assert/strict";
import test from "node:test";

import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

const databaseUrl = process.env.BUSINESS_DATABASE_URL || "";

const actor = Object.freeze({
  subject: "catalog-draft-admin",
  email: "catalog-draft-admin@example.test",
  role: "PLATFORM_OWNER",
  businessIds: Object.freeze([]),
  issuedAt: Math.floor(Date.now() / 1000) - 60,
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  sessionId: "catalog-draft-session",
});

function responseCapture() {
  return {
    statusCode: 0,
    body: "",
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), String(value));
    },
    end(value = "") {
      this.body = String(value);
    },
  };
}

test(
  "Control Center Catalog drafts persist but never leak into published Place projection",
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
      const suffix = Date.now().toString(36);
      const businessId = `business-admin-catalog-${suffix}`;
      const placeId = `place-admin-catalog-${suffix}`;

      await runtime.createDraft(actor, {
        businessId,
        placeId,
        destinationId: "morro-de-sao-paulo",
        categoryId: "restaurants",
        name: "Admin Catalog Draft Place",
        shortDescription: "Place publicado com catálogo ainda em draft",
        capabilities: ["directions", "products", "offers", "menu", "tickets"],
      });
      await runtime.updateLocation(actor, businessId, {
        latitude: -13.3776,
        longitude: -38.9142,
        address: "Morro de São Paulo",
        area: "Centro",
        source: "manual",
      });

      const product = await runtime.createCatalogDraft(
        actor,
        businessId,
        "product",
        {
          name: "Produto Draft",
          description: "Ainda não publicado",
          tags: "draft,catalog",
        },
      );
      const offer = await runtime.createCatalogDraft(
        actor,
        businessId,
        "offer",
        {
          productId: product.id,
          minorUnits: 12500,
          currency: "BRL",
          capacity: 20,
        },
      );
      const menu = await runtime.createCatalogDraft(actor, businessId, "menu", {
        name: "Menu Draft",
        description: "Ainda não publicado",
      });
      const category = await runtime.createCatalogDraft(
        actor,
        businessId,
        "menu-category",
        { menuId: menu.id, name: "Entradas", sortOrder: 0 },
      );
      const item = await runtime.createCatalogDraft(
        actor,
        businessId,
        "menu-item",
        {
          menuId: menu.id,
          categoryId: category.id,
          name: "Ceviche Draft",
          description: "Ainda não público",
          minorUnits: 4500,
          currency: "BRL",
          sortOrder: 0,
        },
      );

      assert.equal(product.status, "draft");
      assert.equal(offer.status, "draft");
      assert.equal(menu.status, "draft");
      assert.equal(item.available, false);

      const detail = await runtime.getCmsDetail(businessId);
      assert.equal(detail.catalog.productCount, 1);
      assert.equal(detail.catalog.offerCount, 1);
      assert.equal(detail.catalog.menuCount, 1);
      assert.equal(detail.catalog.products[0].id, product.id);
      assert.equal(detail.catalog.offers[0].id, offer.id);
      assert.equal(detail.catalog.menus[0].id, menu.id);
      assert.equal(detail.catalog.categories[0].id, category.id);
      assert.equal(detail.catalog.items[0].id, item.id);

      const review = await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        detail.publication.editableRevision,
      );
      await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        review.editableRevision.revision,
      );

      const response = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        response,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(response.statusCode, 200);
      const publicDetail = JSON.parse(response.body);
      assert.deepEqual(publicDetail.commerce.offers, []);
      assert.equal(publicDetail.commerce.menu, null);
      const publicActions = [
        publicDetail.actions.primaryAction,
        ...publicDetail.actions.secondaryActions,
      ].filter(Boolean);
      const ids = new Set(publicActions.map((action) => action.id));
      assert.equal(ids.has("products"), false);
      assert.equal(ids.has("offers"), false);
      assert.equal(ids.has("menu"), false);
      assert.equal(ids.has("tickets"), false);

      await runtime.updateCatalogDraft(
        actor,
        businessId,
        "product",
        product.id,
        { status: "active", name: "Produto Aprovado" },
      );
      await runtime.updateCatalogDraft(actor, businessId, "offer", offer.id, {
        status: "active",
        minorUnits: 13500,
      });
      await runtime.updateCatalogDraft(actor, businessId, "menu", menu.id, {
        status: "active",
        name: "Menu Aprovado",
      });
      await runtime.updateCatalogDraft(
        actor,
        businessId,
        "menu-item",
        item.id,
        { available: true, name: "Ceviche Aprovado" },
      );

      const stillPublished = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        stillPublished,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(stillPublished.statusCode, 200);
      const beforeRepublish = JSON.parse(stillPublished.body);
      assert.deepEqual(beforeRepublish.commerce.offers, []);
      assert.equal(beforeRepublish.commerce.menu, null);

      const edited = await runtime.getCmsDetail(businessId);
      assert.equal(edited.publication.state, "draft");
      assert.ok(
        edited.publication.editableRevision >
          edited.publication.publishedRevision,
      );

      const secondReview = await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        edited.publication.editableRevision,
      );
      await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        secondReview.editableRevision.revision,
      );

      const republished = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        republished,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(republished.statusCode, 200);
      const approved = JSON.parse(republished.body);
      assert.equal(approved.commerce.offers.length, 1);
      assert.equal(approved.commerce.offers[0].id, offer.id);
      assert.equal(approved.commerce.offers[0].name, "Produto Aprovado");
      assert.equal(approved.commerce.offers[0].price.minorUnits, 13500);
      assert.equal(approved.commerce.menu.id, menu.id);
      assert.equal(approved.commerce.menu.name, "Menu Aprovado");
      assert.equal(
        approved.commerce.menu.categories[0].items[0].name,
        "Ceviche Aprovado",
      );
    } finally {
      await runtime.stop();
    }
  },
);
