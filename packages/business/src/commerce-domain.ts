import type { DestinationId } from "@touristic/core";

import {
  asBusinessId,
  asOfferId,
  asPlaceId,
  asProductId,
  type BusinessId,
  type OfferId,
  type PlaceId,
  type ProductId,
} from "./place-domain.js";

type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type MenuId = Brand<string, "MenuId">;
export type MenuCategoryId = Brand<string, "MenuCategoryId">;
export type MenuItemId = Brand<string, "MenuItemId">;

export type ProductStatus = "draft" | "active" | "inactive" | "archived";
export type OfferStatus =
  | "draft"
  | "active"
  | "paused"
  | "sold_out"
  | "expired"
  | "archived";
export type MenuStatus = "draft" | "active" | "inactive" | "archived";

export interface Product {
  readonly id: ProductId;
  readonly businessId: BusinessId;
  readonly placeId: PlaceId | null;
  readonly destinationId: DestinationId | null;
  readonly name: string;
  readonly description: string;
  readonly status: ProductStatus;
  readonly tags: readonly string[];
  readonly legacyReference: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OfferPrice {
  /**
   * Display/catalog amount only. Financial remains the authority for transactional
   * price confirmation and the browser must not derive an authoritative amount.
   */
  readonly minorUnits: number;
  readonly currency: string;
}

export interface Offer {
  readonly id: OfferId;
  readonly businessId: BusinessId;
  readonly placeId: PlaceId | null;
  readonly destinationId: DestinationId | null;
  readonly productId: ProductId;
  readonly price: OfferPrice;
  readonly salesStartsAt: string | null;
  readonly salesEndsAt: string | null;
  readonly experienceStartsAt: string | null;
  readonly experienceEndsAt: string | null;
  readonly capacity: number | null;
  readonly status: OfferStatus;
  readonly legacyLabel: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Menu {
  readonly id: MenuId;
  readonly businessId: BusinessId;
  readonly placeId: PlaceId | null;
  readonly name: string;
  readonly description: string;
  readonly status: MenuStatus;
  readonly fallbackMediaId: string | null;
  readonly fallbackDocumentUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MenuCategory {
  readonly id: MenuCategoryId;
  readonly businessId: BusinessId;
  readonly menuId: MenuId;
  readonly name: string;
  readonly sortOrder: number;
}

export interface MenuItem {
  readonly id: MenuItemId;
  readonly businessId: BusinessId;
  readonly menuId: MenuId;
  readonly categoryId: MenuCategoryId;
  readonly name: string;
  readonly description: string;
  readonly price: OfferPrice;
  readonly mediaId: string | null;
  readonly available: boolean;
  readonly tags: readonly string[];
  readonly allergens: readonly string[];
  readonly sortOrder: number;
}

export interface CatalogScope {
  readonly businessId: BusinessId;
}

export interface CatalogRepository {
  getProduct(id: ProductId): Promise<Product | null>;
  saveProduct(product: Product): Promise<Product>;
  getOffer(id: OfferId): Promise<Offer | null>;
  saveOffer(offer: Offer): Promise<Offer>;
  getMenu(id: MenuId): Promise<Menu | null>;
  saveMenu(menu: Menu): Promise<Menu>;
  getMenuCategory(id: MenuCategoryId): Promise<MenuCategory | null>;
  saveMenuCategory(category: MenuCategory): Promise<MenuCategory>;
  getMenuItem(id: MenuItemId): Promise<MenuItem | null>;
  saveMenuItem(item: MenuItem): Promise<MenuItem>;
}

export interface CatalogService {
  createProduct(scope: CatalogScope, input: Product): Promise<Product>;
  updateProduct(scope: CatalogScope, input: Product): Promise<Product>;
  createOffer(scope: CatalogScope, input: Offer): Promise<Offer>;
  updateOffer(scope: CatalogScope, input: Offer): Promise<Offer>;
  createMenu(scope: CatalogScope, input: Menu): Promise<Menu>;
  saveMenuCategory(\n    scope: CatalogScope,\n    input: MenuCategory,\n  ): Promise<MenuCategory>;
  saveMenuItem(scope: CatalogScope, input: MenuItem): Promise<MenuItem>;
}

export interface OfferSellabilityContext {
  readonly now: string;
  /** Inventory/ticketing supplied fact; undefined means this layer must not infer stock. */
  readonly authoritativeAvailableQuantity?: number | null;
}

export interface OfferSellability {
  readonly sellable: boolean;
  readonly reason:
    | "AVAILABLE"
    | "NOT_ACTIVE"
    | "SALES_NOT_STARTED"
    | "EXPIRED"
    | "SOLD_OUT";
}

export interface LegacyCommerceCompatibility {
  readonly businessId: BusinessId;
  readonly productId: ProductId;
  readonly offerId: OfferId | null;
  readonly productReference: string | null;
  readonly offerLabel: string | null;
}

const ISO_CURRENCY = /^[A-Z]{3}$/u;

function token<T>(value: unknown, code: string): T {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!normalized) throw new Error(code);
  return normalized as T;
}

function safeText(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/gu, "").trim().slice(0, max);
}

function assertBusiness(scope: CatalogScope, businessId: BusinessId): void {
  if (scope.businessId !== businessId) {\n    throw new Error("CATALOG_CROSS_BUSINESS_DENIED");\n  }
}

function assertDate(value: string | null, field: string): void {
  if (value === null) return;
  if (!Number.isFinite(Date.parse(value))) {\n    throw new Error(`INVALID_${field.toUpperCase()}`);\n  }
}

function assertPrice(price: OfferPrice): void {
  if (!Number.isSafeInteger(price.minorUnits) || price.minorUnits < 0) {
    throw new Error("INVALID_PRICE_MINOR_UNITS");
  }
  if (!ISO_CURRENCY.test(price.currency)) throw new Error("INVALID_CURRENCY");
}

function assertSortOrder(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {\n    throw new Error("INVALID_SORT_ORDER");\n  }
}

export function asMenuId(value: unknown): MenuId {
  return token<MenuId>(value, "INVALID_MENU_ID");
}

export function asMenuCategoryId(value: unknown): MenuCategoryId {
  return token<MenuCategoryId>(value, "INVALID_MENU_CATEGORY_ID");
}

export function asMenuItemId(value: unknown): MenuItemId {
  return token<MenuItemId>(value, "INVALID_MENU_ITEM_ID");
}

export function validateProduct(product: Product): void {
  asProductId(product.id);
  asBusinessId(product.businessId);
  if (product.placeId !== null) asPlaceId(product.placeId);
  if (!safeText(product.name, 180)) throw new Error("INVALID_PRODUCT_NAME");
  if (!["draft", "active", "inactive", "archived"].includes(product.status)) {
    throw new Error("INVALID_PRODUCT_STATUS");
  }
}

export function validateOfferRelation(offer: Offer, product: Product): void {
  assertPrice(offer.price);
  assertDate(offer.salesStartsAt, "sales_starts_at");
  assertDate(offer.salesEndsAt, "sales_ends_at");
  assertDate(offer.experienceStartsAt, "experience_starts_at");
  assertDate(offer.experienceEndsAt, "experience_ends_at");
  if (offer.businessId !== product.businessId) {\n    throw new Error("OFFER_PRODUCT_BUSINESS_MISMATCH");\n  }
  if (offer.productId !== product.id) {\n    throw new Error("OFFER_PRODUCT_ID_MISMATCH");\n  }
  if (
    offer.placeId !== null &&
    product.placeId !== null &&
    offer.placeId !== product.placeId
  ) {
    throw new Error("OFFER_PRODUCT_PLACE_MISMATCH");
  }
  if (
    offer.destinationId !== null &&
    product.destinationId !== null &&
    offer.destinationId !== product.destinationId
  ) {
    throw new Error("OFFER_PRODUCT_DESTINATION_MISMATCH");
  }
  if (\n    offer.capacity !== null &&\n    (!Number.isSafeInteger(offer.capacity) || offer.capacity < 0)\n  ) {
    throw new Error("INVALID_OFFER_CAPACITY");
  }
}

export function validateMenuCategoryRelation(\n  category: MenuCategory,\n  menu: Menu,\n): void {
  if (category.businessId !== menu.businessId) {\n    throw new Error("MENU_CATEGORY_BUSINESS_MISMATCH");\n  }
  if (category.menuId !== menu.id) {\n    throw new Error("MENU_CATEGORY_MENU_MISMATCH");\n  }
  if (!safeText(category.name, 180)) {\n    throw new Error("INVALID_MENU_CATEGORY_NAME");\n  }
  assertSortOrder(category.sortOrder);
}

export function validateMenuItemRelation(
  item: MenuItem,
  menu: Menu,
  category: MenuCategory,
): void {
  assertPrice(item.price);
  assertSortOrder(item.sortOrder);
  if (\n    item.businessId !== menu.businessId ||\n    item.businessId !== category.businessId\n  ) {
    throw new Error("MENU_ITEM_BUSINESS_MISMATCH");
  }
  if (item.menuId !== menu.id || item.menuId !== category.menuId) {
    throw new Error("MENU_ITEM_MENU_MISMATCH");
  }
  if (item.categoryId !== category.id) {\n    throw new Error("MENU_ITEM_CATEGORY_MISMATCH");\n  }
  if (!safeText(item.name, 180)) {\n    throw new Error("INVALID_MENU_ITEM_NAME");\n  }
}

export function evaluateOfferSellability(
  offer: Offer,
  context: OfferSellabilityContext,
): OfferSellability {
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) throw new Error("INVALID_NOW");

  if (offer.status === "sold_out") {\n    return Object.freeze({ sellable: false, reason: "SOLD_OUT" as const });\n  }
  if (\n    offer.status === "expired" ||\n    (offer.salesEndsAt && Date.parse(offer.salesEndsAt) < now)\n  ) {
    return Object.freeze({ sellable: false, reason: "EXPIRED" as const });
  }
  if (offer.status !== "active") {
    return Object.freeze({ sellable: false, reason: "NOT_ACTIVE" as const });
  }
  if (offer.salesStartsAt && Date.parse(offer.salesStartsAt) > now) {
    return Object.freeze({\n      sellable: false,\n      reason: "SALES_NOT_STARTED" as const,\n    });
  }
  if (context.authoritativeAvailableQuantity === 0) {
    return Object.freeze({ sellable: false, reason: "SOLD_OUT" as const });
  }
  return Object.freeze({ sellable: true, reason: "AVAILABLE" as const });
}

/**
 * Compatibility resolver for legacy data only. It never searches by Place name,
 * slug, alias, product display name or offer label. A canonical compatibility
 * record must already identify the Product/Offer owner explicitly.
 */
export function resolveLegacyCommerceReference(
  compatibility: readonly LegacyCommerceCompatibility[],
  input: {
    readonly businessId: unknown;
    readonly productReference?: unknown;
    readonly offerLabel?: unknown;
  },
): LegacyCommerceCompatibility | null {
  const businessId = asBusinessId(input.businessId);
  const productReference = safeText(input.productReference, 160);
  const offerLabel = safeText(input.offerLabel, 180);

  return (
    compatibility.find(
      (entry) =>
        entry.businessId === businessId &&
        ((productReference &&
          entry.productReference !== null &&
          entry.productReference === productReference) ||
          (offerLabel &&\n            entry.offerLabel !== null &&\n            entry.offerLabel === offerLabel)),
    ) ?? null
  );
}

export function createCatalogService(\n  repository: CatalogRepository,\n): CatalogService {
  return Object.freeze({
    async createProduct(\n      scope: CatalogScope,\n      input: Product,\n    ): Promise<Product> {
      assertBusiness(scope, input.businessId);
      validateProduct(input);
      if (await repository.getProduct(input.id)) {\n        throw new Error("PRODUCT_ALREADY_EXISTS");\n      }
      return repository.saveProduct(Object.freeze({ ...input }));
    },

    async updateProduct(\n      scope: CatalogScope,\n      input: Product,\n    ): Promise<Product> {
      assertBusiness(scope, input.businessId);
      validateProduct(input);
      const existing = await repository.getProduct(input.id);
      if (!existing) throw new Error("PRODUCT_NOT_FOUND");
      assertBusiness(scope, existing.businessId);
      if (existing.businessId !== input.businessId) {\n        throw new Error("CATALOG_CROSS_BUSINESS_DENIED");\n      }
      return repository.saveProduct(Object.freeze({ ...input }));
    },

    async createOffer(\n      scope: CatalogScope,\n      input: Offer,\n    ): Promise<Offer> {
      assertBusiness(scope, input.businessId);
      if (await repository.getOffer(input.id)) {\n        throw new Error("OFFER_ALREADY_EXISTS");\n      }
      const product = await repository.getProduct(input.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      assertBusiness(scope, product.businessId);
      validateOfferRelation(input, product);
      return repository.saveOffer(Object.freeze({ ...input }));
    },

    async updateOffer(\n      scope: CatalogScope,\n      input: Offer,\n    ): Promise<Offer> {
      assertBusiness(scope, input.businessId);
      const existing = await repository.getOffer(input.id);
      if (!existing) throw new Error("OFFER_NOT_FOUND");
      assertBusiness(scope, existing.businessId);
      const product = await repository.getProduct(input.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      assertBusiness(scope, product.businessId);
      validateOfferRelation(input, product);
      return repository.saveOffer(Object.freeze({ ...input }));
    },

    async createMenu(\n      scope: CatalogScope,\n      input: Menu,\n    ): Promise<Menu> {
      assertBusiness(scope, input.businessId);
      if (await repository.getMenu(input.id)) {\n        throw new Error("MENU_ALREADY_EXISTS");\n      }
      if (!safeText(input.name, 180)) {\n        throw new Error("INVALID_MENU_NAME");\n      }
      if (input.placeId !== null) asPlaceId(input.placeId);
      return repository.saveMenu(Object.freeze({ ...input }));
    },

    async saveMenuCategory(\n      scope: CatalogScope,\n      input: MenuCategory,\n    ): Promise<MenuCategory> {
      assertBusiness(scope, input.businessId);
      const menu = await repository.getMenu(input.menuId);
      if (!menu) throw new Error("MENU_NOT_FOUND");
      assertBusiness(scope, menu.businessId);
      validateMenuCategoryRelation(input, menu);
      return repository.saveMenuCategory(Object.freeze({ ...input }));
    },

    async saveMenuItem(\n      scope: CatalogScope,\n      input: MenuItem,\n    ): Promise<MenuItem> {
      assertBusiness(scope, input.businessId);
      const menu = await repository.getMenu(input.menuId);
      if (!menu) throw new Error("MENU_NOT_FOUND");
      const category = await repository.getMenuCategory(input.categoryId);
      if (!category) throw new Error("MENU_CATEGORY_NOT_FOUND");
      assertBusiness(scope, menu.businessId);
      assertBusiness(scope, category.businessId);
      validateMenuItemRelation(input, menu, category);
      return repository.saveMenuItem(Object.freeze({ ...input }));
    },
  });
}
