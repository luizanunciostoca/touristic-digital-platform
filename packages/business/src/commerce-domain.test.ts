import type { DestinationId } from "@touristic/core";
import { describe, expect, it } from "vitest";

import {
  asBusinessId,
  asOfferId,
  asPlaceId,
  asProductId,
} from "./place-domain.js";
import {
  asMenuCategoryId,
  asMenuId,
  asMenuItemId,
  createCatalogService,
  evaluateOfferSellability,
  resolveLegacyCommerceReference,
  type CatalogRepository,
  type Menu,
  type MenuCategory,
  type MenuItem,
  type Offer,
  type Product,
} from "./commerce-domain.js";

const businessId = asBusinessId("business-toca");
const otherBusinessId = asBusinessId("business-other");
const placeId = asPlaceId("place-toca");
const destinationId = "morro-de-sao-paulo" as DestinationId;
const now = "2026-09-24T21:00:00.000Z";

function product(overrides: Partial<Product> = {}): Product {
  return Object.freeze({
    id: asProductId("product-sunset"),
    businessId,
    placeId,
    destinationId,
    name: "Sunset",
    description: "Experiência permanente",
    status: "active",
    tags: Object.freeze(["sunset"]),
    legacyReference: "nightlife:toca-do-morcego-sunset",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return Object.freeze({
    id: asOfferId("offer-sunset-2026"),
    businessId,
    placeId,
    destinationId,
    productId: asProductId("product-sunset"),
    price: Object.freeze({ minorUnits: 5000, currency: "BRL" }),
    salesStartsAt: "2026-09-01T00:00:00.000Z",
    salesEndsAt: "2026-10-01T00:00:00.000Z",
    experienceStartsAt: "2026-09-25T19:30:00.000Z",
    experienceEndsAt: null,
    capacity: 300,
    status: "active",
    legacyLabel: "Sunset Toca do Morcego",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function memoryRepository(): CatalogRepository {
  const products = new Map();
  const offers = new Map();
  const menus = new Map();
  const categories = new Map();
  const items = new Map();
  return {
    getProduct: async (id) => products.get(id) ?? null,
    saveProduct: async (value) => (products.set(value.id, value), value),
    getOffer: async (id) => offers.get(id) ?? null,
    saveOffer: async (value) => (offers.set(value.id, value), value),
    getMenu: async (id) => menus.get(id) ?? null,
    saveMenu: async (value) => (menus.set(value.id, value), value),
    getMenuCategory: async (id) => categories.get(id) ?? null,
    saveMenuCategory: async (value) => (categories.set(value.id, value), value),
    getMenuItem: async (id) => items.get(id) ?? null,
    saveMenuItem: async (value) => (items.set(value.id, value), value),
  };
}

describe("products", () => {
  it("creates and updates a canonical product", async () => {
    const service = createCatalogService(memoryRepository());
    const created = await service.createProduct({ businessId }, product());
    expect(created.id).toBe("product-sunset");

    const updated = await service.updateProduct(
      { businessId },
      product({\n        description: "Sunset atualizado",\n        updatedAt: "2026-09-24T22:00:00.000Z",\n      }),
    );
    expect(updated.description).toBe("Sunset atualizado");
  });

  it("denies cross-business product mutation", async () => {
    const service = createCatalogService(memoryRepository());
    await expect(
      service.createProduct({ businessId: otherBusinessId }, product()),
    ).rejects.toThrow("CATALOG_CROSS_BUSINESS_DENIED");
  });
});

describe("offers", () => {
  it(\n    "requires explicit product/business/place relation and never name matching",\n    async () => {
    const service = createCatalogService(memoryRepository());
    await service.createProduct({ businessId }, product());
    const saved = await service.createOffer({ businessId }, offer());
    expect(saved).toMatchObject({
      businessId: "business-toca",
      placeId: "place-toca",
      productId: "product-sunset",
    });
  });

  it("denies cross-business relations", async () => {
    const service = createCatalogService(memoryRepository());
    await service.createProduct({ businessId }, product());
    await expect(
      service.createOffer(
        { businessId: otherBusinessId },
        offer({ businessId: otherBusinessId }),
      ),
    ).rejects.toThrow("CATALOG_CROSS_BUSINESS_DENIED");
  });

  it("rejects invalid currency", async () => {
    const service = createCatalogService(memoryRepository());
    await service.createProduct({ businessId }, product());
    await expect(
      service.createOffer(
        { businessId },
        offer({\n          price: Object.freeze({ minorUnits: 5000, currency: "brl" }),\n        }),
      ),
    ).rejects.toThrow("INVALID_CURRENCY");
  });

  it(\n    "identifies expired and sold-out offers from explicit state/owner facts",\n    () => {
    expect(
      evaluateOfferSellability(
        offer({ salesEndsAt: "2026-09-20T00:00:00.000Z" }),
        { now },
      ),
    ).toEqual({ sellable: false, reason: "EXPIRED" });

    expect(
      evaluateOfferSellability(offer(), {
        now,
        authoritativeAvailableQuantity: 0,
      }),
    ).toEqual({ sellable: false, reason: "SOLD_OUT" });
  });

  it("keeps legacy references as compatibility only", () => {
    const resolved = resolveLegacyCommerceReference(
      [
        {
          businessId,
          productId: asProductId("product-sunset"),
          offerId: asOfferId("offer-sunset-2026"),
          productReference: "nightlife:toca-do-morcego-sunset",
          offerLabel: "Sunset Toca do Morcego",
        },
      ],
      { businessId, productReference: "nightlife:toca-do-morcego-sunset" },
    );
    expect(resolved?.productId).toBe("product-sunset");
    expect(
      resolveLegacyCommerceReference([], {
        businessId,
        offerLabel: "Sunset Toca do Morcego",
      }),
    ).toBeNull();
  });
});

describe("menus", () => {
  it(\n    "persists menu categories in explicit order and item availability",\n    async () => {
    const service = createCatalogService(memoryRepository());
    const menu: Menu = Object.freeze({
      id: asMenuId("menu-principal"),
      businessId,
      placeId,
      name: "Cardápio",
      description: "Cardápio principal",
      status: "active",
      fallbackMediaId: "media-menu-pdf",
      fallbackDocumentUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    await service.createMenu({ businessId }, menu);

    const category: MenuCategory = Object.freeze({
      id: asMenuCategoryId("category-pratos"),
      businessId,
      menuId: menu.id,
      name: "Pratos",
      sortOrder: 20,
    });
    await service.saveMenuCategory({ businessId }, category);

    const item: MenuItem = Object.freeze({
      id: asMenuItemId("item-salmao"),
      businessId,
      menuId: menu.id,
      categoryId: category.id,
      name: "Salmão Sunset",
      description: "Salmão grelhado",
      price: Object.freeze({ minorUnits: 8900, currency: "BRL" }),
      mediaId: null,
      available: false,
      tags: Object.freeze(["peixe"]),
      allergens: Object.freeze(["fish"]),
      sortOrder: 10,
    });
    const saved = await service.saveMenuItem({ businessId }, item);
    expect(saved.available).toBe(false);
    expect(category.sortOrder).toBe(20);
  });

  it("denies a menu item crossing businesses", async () => {
    const service = createCatalogService(memoryRepository());
    const menu: Menu = Object.freeze({
      id: asMenuId("menu-main"),
      businessId,
      placeId,
      name: "Menu",
      description: "",
      status: "active",
      fallbackMediaId: null,
      fallbackDocumentUrl: null,
      createdAt: now,
      updatedAt: now,
    });
    await service.createMenu({ businessId }, menu);
    const category: MenuCategory = Object.freeze({
      id: asMenuCategoryId("cat-main"),
      businessId,
      menuId: menu.id,
      name: "Main",
      sortOrder: 0,
    });
    await service.saveMenuCategory({ businessId }, category);

    const foreignItem: MenuItem = Object.freeze({
      id: asMenuItemId("item-foreign"),
      businessId: otherBusinessId,
      menuId: menu.id,
      categoryId: category.id,
      name: "Foreign",
      description: "",
      price: Object.freeze({ minorUnits: 100, currency: "BRL" }),
      mediaId: null,
      available: true,
      tags: Object.freeze([]),
      allergens: Object.freeze([]),
      sortOrder: 0,
    });
    await expect(
      service.saveMenuItem({ businessId: otherBusinessId }, foreignItem),
    ).rejects.toThrow("CATALOG_CROSS_BUSINESS_DENIED");
  });
});
