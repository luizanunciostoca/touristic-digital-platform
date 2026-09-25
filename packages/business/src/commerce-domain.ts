import type { DestinationId } from "@touristic/core";

import {
  asBusinessId,
  asPlaceId,
  asProductId,
  type BusinessId,
  type OfferId,
  type PlaceId,
  type ProductId,
} from "./place-domain.js";

type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type MenuId = Brand<string, "MenuId">;
export type MenuCategoryId = Brand<string, "MenuCategoryId">;
export type MenuItemId = Brand<string, "MenuItemId">;

export type ProductStatus = "draft" | "active" | "inactive" | "archived";
export type OfferStatus =
  "draft" | "active" | "paused" | "sold_out" | "expired" | "archived";
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
  updateMenu(scope: CatalogScope, input: Menu): Promise<Menu>;
  saveMenuCategory(
    scope: CatalogScope,
    input: MenuCategory,
  ): Promise<MenuCategory>;
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
    "AVAILABLE" | "NOT_ACTIVE" | "SALES_NOT_STARTED" | "EXPIRED" | "SOLD_OUT";
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
  if (scope.businessId !== businessId) {
    throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
  }
}

function assertDate(value: string | null, field: string): void {
  if (value === null) return;
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
}

function assertPrice(price: OfferPrice): void {
  if (!Number.isSafeInteger(price.minorUnits) || price.minorUnits < 0) {
    throw new Error("INVALID_PRICE_MINOR_UNITS");
  }
  if (!ISO_CURRENCY.test(price.currency)) throw new Error("INVALID_CURRENCY");
}

function assertSortOrder(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("INVALID_SORT_ORDER");
  }
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
  if (offer.businessId !== product.businessId) {
    throw new Error("OFFER_PRODUCT_BUSINESS_MISMATCH");
  }
  if (offer.productId !== product.id) {
    throw new Error("OFFER_PRODUCT_ID_MISMATCH");
  }
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
  if (
    offer.capacity !== null &&
    (!Number.isSafeInteger(offer.capacity) || offer.capacity < 0)
  ) {
    throw new Error("INVALID_OFFER_CAPACITY");
  }
}

export function validateMenuCategoryRelation(
  category: MenuCategory,
  menu: Menu,
): void {
  if (category.businessId !== menu.businessId) {
    throw new Error("MENU_CATEGORY_BUSINESS_MISMATCH");
  }
  if (category.menuId !== menu.id) {
    throw new Error("MENU_CATEGORY_MENU_MISMATCH");
  }
  if (!safeText(category.name, 180)) {
    throw new Error("INVALID_MENU_CATEGORY_NAME");
  }
  assertSortOrder(category.sortOrder);
}

export function validateMenuItemRelation(
  item: MenuItem,
  menu: Menu,
  category: MenuCategory,
): void {
  assertPrice(item.price);
  assertSortOrder(item.sortOrder);
  if (
    item.businessId !== menu.businessId ||
    item.businessId !== category.businessId
  ) {
    throw new Error("MENU_ITEM_BUSINESS_MISMATCH");
  }
  if (item.menuId !== menu.id || item.menuId !== category.menuId) {
    throw new Error("MENU_ITEM_MENU_MISMATCH");
  }
  if (item.categoryId !== category.id) {
    throw new Error("MENU_ITEM_CATEGORY_MISMATCH");
  }
  if (!safeText(item.name, 180)) {
    throw new Error("INVALID_MENU_ITEM_NAME");
  }
}

export function evaluateOfferSellability(
  offer: Offer,
  context: OfferSellabilityContext,
): OfferSellability {
  const now = Date.parse(context.now);
  if (!Number.isFinite(now)) throw new Error("INVALID_NOW");

  if (offer.status === "sold_out") {
    return Object.freeze({ sellable: false, reason: "SOLD_OUT" as const });
  }
  if (
    offer.status === "expired" ||
    (offer.salesEndsAt && Date.parse(offer.salesEndsAt) < now)
  ) {
    return Object.freeze({ sellable: false, reason: "EXPIRED" as const });
  }
  if (offer.status !== "active") {
    return Object.freeze({ sellable: false, reason: "NOT_ACTIVE" as const });
  }
  if (offer.salesStartsAt && Date.parse(offer.salesStartsAt) > now) {
    return Object.freeze({
      sellable: false,
      reason: "SALES_NOT_STARTED" as const,
    });
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
          (offerLabel &&
            entry.offerLabel !== null &&
            entry.offerLabel === offerLabel)),
    ) ?? null
  );
}

export function createCatalogService(
  repository: CatalogRepository,
): CatalogService {
  return Object.freeze({
    async createProduct(scope: CatalogScope, input: Product): Promise<Product> {
      assertBusiness(scope, input.businessId);
      validateProduct(input);
      if (await repository.getProduct(input.id)) {
        throw new Error("PRODUCT_ALREADY_EXISTS");
      }
      return repository.saveProduct(Object.freeze({ ...input }));
    },

    async updateProduct(scope: CatalogScope, input: Product): Promise<Product> {
      assertBusiness(scope, input.businessId);
      validateProduct(input);
      const existing = await repository.getProduct(input.id);
      if (!existing) throw new Error("PRODUCT_NOT_FOUND");
      assertBusiness(scope, existing.businessId);
      if (existing.businessId !== input.businessId) {
        throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
      }
      return repository.saveProduct(Object.freeze({ ...input }));
    },

    async createOffer(scope: CatalogScope, input: Offer): Promise<Offer> {
      assertBusiness(scope, input.businessId);
      if (await repository.getOffer(input.id)) {
        throw new Error("OFFER_ALREADY_EXISTS");
      }
      const product = await repository.getProduct(input.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      assertBusiness(scope, product.businessId);
      validateOfferRelation(input, product);
      return repository.saveOffer(Object.freeze({ ...input }));
    },

    async updateOffer(scope: CatalogScope, input: Offer): Promise<Offer> {
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

    async createMenu(scope: CatalogScope, input: Menu): Promise<Menu> {
      assertBusiness(scope, input.businessId);
      if (await repository.getMenu(input.id)) {
        throw new Error("MENU_ALREADY_EXISTS");
      }
      if (!safeText(input.name, 180)) {
        throw new Error("INVALID_MENU_NAME");
      }
      if (input.placeId !== null) asPlaceId(input.placeId);
      return repository.saveMenu(Object.freeze({ ...input }));
    },

    async updateMenu(scope: CatalogScope, input: Menu): Promise<Menu> {
      assertBusiness(scope, input.businessId);
      const existing = await repository.getMenu(input.id);
      if (!existing) throw new Error("MENU_NOT_FOUND");
      assertBusiness(scope, existing.businessId);
      if (existing.businessId !== input.businessId) {
        throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
      }
      if (!safeText(input.name, 180)) {
        throw new Error("INVALID_MENU_NAME");
      }
      if (input.placeId !== null) asPlaceId(input.placeId);
      return repository.saveMenu(Object.freeze({ ...input }));
    },

    async saveMenuCategory(
      scope: CatalogScope,
      input: MenuCategory,
    ): Promise<MenuCategory> {
      assertBusiness(scope, input.businessId);
      const menu = await repository.getMenu(input.menuId);
      if (!menu) throw new Error("MENU_NOT_FOUND");
      assertBusiness(scope, menu.businessId);
      validateMenuCategoryRelation(input, menu);
      return repository.saveMenuCategory(Object.freeze({ ...input }));
    },

    async saveMenuItem(
      scope: CatalogScope,
      input: MenuItem,
    ): Promise<MenuItem> {
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
