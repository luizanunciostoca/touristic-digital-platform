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

      const product = await runtime.createCatalogDraft(actor, businessId, "product", {
        name: "Produto Draft",
        description: "Ainda não publicado",
        tags: "draft,catalog",
      });
      const offer = await runtime.createCatalogDraft(actor, businessId, "offer", {
        productId: product.id,
        minorUnits: 12500,
        currency: "BRL",
        capacity: 20,
      });
      const menu = await runtime.createCatalogDraft(actor, businessId, "menu", {
        name: "Menu Draft",
        description: "Ainda não publicado",
      });
      const category = await runtime.createCatalogDraft(actor, businessId,
        "menu-category",
        { menuId: menu.id, name: "Entradas", sortOrder: 0 },
      );
      const item = await runtime.createCatalogDraft(actor, businessId, "menu-item", {
        menuId: menu.id,
        categoryId: category.id,
        name: "Ceviche Draft",
        description: "Ainda não público",
        minorUnits: 4500,
        currency: "BRL",
        sortOrder: 0,
      });

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

      await runtime.updateCatalogEntry(
        actor,
        businessId,
        "product",
        product.id,
        { status: "active" },
      );
      await runtime.updateCatalogEntry(
        actor,
        businessId,
        "offer",
        offer.id,
        { status: "active" },
      );
      await runtime.updateCatalogEntry(
        actor,
        businessId,
        "menu",
        menu.id,
        { status: "active" },
      );
      await runtime.updateCatalogEntry(
        actor,
        businessId,
        "menu-item",
        item.id,
        { available: true },
      );

      const activationDetail = await runtime.getCmsDetail(businessId);
      assert.equal(activationDetail.publication.state, "draft");
      assert.ok(
        activationDetail.publication.editableRevision >
          activationDetail.publication.publishedRevision,
      );
      const activationReview = await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        activationDetail.publication.editableRevision,
      );
      await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        activationReview.editableRevision.revision,
      );

      const activeResponse = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        activeResponse,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(activeResponse.statusCode, 200);
      const activePublic = JSON.parse(activeResponse.body);
      assert.equal(activePublic.commerce.offers[0].id, offer.id);
      assert.equal(activePublic.commerce.menu.id, menu.id);
      assert.equal(
        activePublic.commerce.menu.categories[0].items[0].id,
        item.id,
      );

      await runtime.updateCatalogEntry(
        actor,
        businessId,
        "product",
        product.id,
        { name: "Produto Editado sem Publicar" },
      );
      const working = await runtime.getCmsDetail(businessId);
      assert.equal(
        working.catalog.products.find((entry) => entry.id === product.id).name,
        "Produto Editado sem Publicar",
      );
      assert.equal(working.publication.state, "draft");

      const isolatedResponse = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        isolatedResponse,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(isolatedResponse.statusCode, 200);
      assert.equal(
        JSON.parse(isolatedResponse.body).commerce.offers[0].name,
        "Produto Draft",
        "working Catalog update must not leak before Place publication",
      );

      const republishReview = await runtime.transitionPublication(
        actor,
        businessId,
        "review",
        working.publication.editableRevision,
      );
      await runtime.transitionPublication(
        actor,
        businessId,
        "publish",
        republishReview.editableRevision.revision,
      );
      const republishedResponse = responseCapture();
      await runtime.handlePublic(
        { method: "GET", headers: {} },
        republishedResponse,
        new URL(
          `http://localhost/api/places/v1/${encodeURIComponent(placeId)}?locale=pt-BR`,
        ),
      );
      assert.equal(republishedResponse.statusCode, 200);
      assert.equal(
        JSON.parse(republishedResponse.body).commerce.offers[0].name,
        "Produto Editado sem Publicar",
      );
    } finally {
      await runtime.stop();
    }
  },
);
