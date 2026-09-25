import {
  createCatalogService,
  evaluateOfferSellability,
} from "@touristic/business";

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function iso(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("CATALOG_INVALID_TIMESTAMP");
  return date.toISOString();
}

function mysqlDate(value) {
  return value == null ? null : new Date(value);
}

export async function applyCatalogSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_products (
      product_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      destination_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(24) NOT NULL,
      tags_json JSON NOT NULL,
      legacy_reference VARCHAR(200) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (product_id),
      CONSTRAINT fk_catalog_product_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_product_place
        FOREIGN KEY (place_id) REFERENCES business_places(place_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_catalog_product_place (business_id, place_id, status),
      KEY idx_catalog_product_destination (destination_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_offers (
      offer_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      destination_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      product_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      price_minor_units BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL,
      sales_starts_at DATETIME(3) NULL,
      sales_ends_at DATETIME(3) NULL,
      experience_starts_at DATETIME(3) NULL,
      experience_ends_at DATETIME(3) NULL,
      capacity INT UNSIGNED NULL,
      status VARCHAR(24) NOT NULL,
      legacy_label VARCHAR(200) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (offer_id),
      CONSTRAINT fk_catalog_offer_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_offer_place
        FOREIGN KEY (place_id) REFERENCES business_places(place_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_offer_product
        FOREIGN KEY (product_id) REFERENCES catalog_products(product_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_catalog_offer_place (business_id, place_id, status),
      KEY idx_catalog_offer_product (product_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_menus (
      menu_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      place_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      status VARCHAR(24) NOT NULL,
      fallback_media_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      fallback_document_url VARCHAR(1000) NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (menu_id),
      CONSTRAINT fk_catalog_menu_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_menu_place
        FOREIGN KEY (place_id) REFERENCES business_places(place_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_catalog_menu_place (business_id, place_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_menu_categories (
      category_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      menu_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      name VARCHAR(180) NOT NULL,
      sort_order INT UNSIGNED NOT NULL,
      PRIMARY KEY (category_id),
      CONSTRAINT fk_catalog_category_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_category_menu
        FOREIGN KEY (menu_id) REFERENCES catalog_menus(menu_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_catalog_category_menu (menu_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_menu_items (
      item_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      menu_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      category_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      name VARCHAR(180) NOT NULL,
      description TEXT NOT NULL,
      price_minor_units BIGINT UNSIGNED NOT NULL,
      currency CHAR(3) NOT NULL,
      media_id VARCHAR(160) COLLATE utf8mb4_bin NULL,
      available BOOLEAN NOT NULL,
      tags_json JSON NOT NULL,
      allergens_json JSON NOT NULL,
      sort_order INT UNSIGNED NOT NULL,
      PRIMARY KEY (item_id),
      CONSTRAINT fk_catalog_item_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_item_menu
        FOREIGN KEY (menu_id) REFERENCES catalog_menus(menu_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT fk_catalog_item_category
        FOREIGN KEY (category_id) REFERENCES catalog_menu_categories(category_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_catalog_item_category (category_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function productFromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: String(row.product_id),
    businessId: String(row.business_id),
    placeId: row.place_id == null ? null : String(row.place_id),
    destinationId:
      row.destination_id == null ? null : String(row.destination_id),
    name: String(row.name),
    description: String(row.description),
    status: String(row.status),
    tags: Object.freeze(parseJson(row.tags_json, [])),
    legacyReference:
      row.legacy_reference == null ? null : String(row.legacy_reference),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function offerFromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: String(row.offer_id),
    businessId: String(row.business_id),
    placeId: row.place_id == null ? null : String(row.place_id),
    destinationId:
      row.destination_id == null ? null : String(row.destination_id),
    productId: String(row.product_id),
    price: Object.freeze({
      minorUnits: Number(row.price_minor_units),
      currency: String(row.currency),
    }),
    salesStartsAt: iso(row.sales_starts_at),
    salesEndsAt: iso(row.sales_ends_at),
    experienceStartsAt: iso(row.experience_starts_at),
    experienceEndsAt: iso(row.experience_ends_at),
    capacity: row.capacity == null ? null : Number(row.capacity),
    status: String(row.status),
    legacyLabel: row.legacy_label == null ? null : String(row.legacy_label),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function menuFromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: String(row.menu_id),
    businessId: String(row.business_id),
    placeId: row.place_id == null ? null : String(row.place_id),
    name: String(row.name),
    description: String(row.description),
    status: String(row.status),
    fallbackMediaId:
      row.fallback_media_id == null ? null : String(row.fallback_media_id),
    fallbackDocumentUrl:
      row.fallback_document_url == null
        ? null
        : String(row.fallback_document_url),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

function categoryFromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: String(row.category_id),
    businessId: String(row.business_id),
    menuId: String(row.menu_id),
    name: String(row.name),
    sortOrder: Number(row.sort_order),
  });
}

function itemFromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: String(row.item_id),
    businessId: String(row.business_id),
    menuId: String(row.menu_id),
    categoryId: String(row.category_id),
    name: String(row.name),
    description: String(row.description),
    price: Object.freeze({
      minorUnits: Number(row.price_minor_units),
      currency: String(row.currency),
    }),
    mediaId: row.media_id == null ? null : String(row.media_id),
    available: Boolean(row.available),
    tags: Object.freeze(parseJson(row.tags_json, [])),
    allergens: Object.freeze(parseJson(row.allergens_json, [])),
    sortOrder: Number(row.sort_order),
  });
}

export function createMySqlCatalogRepository(pool) {
  async function one(sql, values, mapper) {
    const [rows] = await pool.execute(sql, values);
    return rows[0] ? mapper(rows[0]) : null;
  }

  return Object.freeze({
    getProduct(id) {
      return one(
        "SELECT * FROM catalog_products WHERE product_id = ? LIMIT 1",
        [String(id)],
        productFromRow,
      );
    },
    async saveProduct(product) {
      await pool.execute(
        `INSERT INTO catalog_products
          (product_id, business_id, place_id, destination_id, name, description,
           status, tags_json, legacy_reference, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           place_id = VALUES(place_id),
           destination_id = VALUES(destination_id),
           name = VALUES(name),
           description = VALUES(description),
           status = VALUES(status),
           tags_json = VALUES(tags_json),
           legacy_reference = VALUES(legacy_reference),
           updated_at = VALUES(updated_at)`,
        [
          String(product.id),
          String(product.businessId),
          product.placeId == null ? null : String(product.placeId),
          product.destinationId == null ? null : String(product.destinationId),
          product.name,
          product.description,
          product.status,
          JSON.stringify(product.tags),
          product.legacyReference,
          new Date(product.createdAt),
          new Date(product.updatedAt),
        ],
      );
      return this.getProduct(product.id);
    },
    getOffer(id) {
      return one(
        "SELECT * FROM catalog_offers WHERE offer_id = ? LIMIT 1",
        [String(id)],
        offerFromRow,
      );
    },
    async saveOffer(offer) {
      await pool.execute(
        `INSERT INTO catalog_offers
          (offer_id, business_id, place_id, destination_id, product_id,
           price_minor_units, currency, sales_starts_at, sales_ends_at,
           experience_starts_at, experience_ends_at, capacity, status,
           legacy_label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           place_id = VALUES(place_id),
           destination_id = VALUES(destination_id),
           product_id = VALUES(product_id),
           price_minor_units = VALUES(price_minor_units),
           currency = VALUES(currency),
           sales_starts_at = VALUES(sales_starts_at),
           sales_ends_at = VALUES(sales_ends_at),
           experience_starts_at = VALUES(experience_starts_at),
           experience_ends_at = VALUES(experience_ends_at),
           capacity = VALUES(capacity),
           status = VALUES(status),
           legacy_label = VALUES(legacy_label),
           updated_at = VALUES(updated_at)`,
        [
          String(offer.id),
          String(offer.businessId),
          offer.placeId == null ? null : String(offer.placeId),
          offer.destinationId == null ? null : String(offer.destinationId),
          String(offer.productId),
          offer.price.minorUnits,
          offer.price.currency,
          mysqlDate(offer.salesStartsAt),
          mysqlDate(offer.salesEndsAt),
          mysqlDate(offer.experienceStartsAt),
          mysqlDate(offer.experienceEndsAt),
          offer.capacity,
          offer.status,
          offer.legacyLabel,
          new Date(offer.createdAt),
          new Date(offer.updatedAt),
        ],
      );
      return this.getOffer(offer.id);
    },
    getMenu(id) {
      return one(
        "SELECT * FROM catalog_menus WHERE menu_id = ? LIMIT 1",
        [String(id)],
        menuFromRow,
      );
    },
    async saveMenu(menu) {
      await pool.execute(
        `INSERT INTO catalog_menus
          (menu_id, business_id, place_id, name, description, status,
           fallback_media_id, fallback_document_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           place_id = VALUES(place_id),
           name = VALUES(name),
           description = VALUES(description),
           status = VALUES(status),
           fallback_media_id = VALUES(fallback_media_id),
           fallback_document_url = VALUES(fallback_document_url),
           updated_at = VALUES(updated_at)`,
        [
          String(menu.id),
          String(menu.businessId),
          menu.placeId == null ? null : String(menu.placeId),
          menu.name,
          menu.description,
          menu.status,
          menu.fallbackMediaId,
          menu.fallbackDocumentUrl,
          new Date(menu.createdAt),
          new Date(menu.updatedAt),
        ],
      );
      return this.getMenu(menu.id);
    },
    getMenuCategory(id) {
      return one(
        "SELECT * FROM catalog_menu_categories WHERE category_id = ? LIMIT 1",
        [String(id)],
        categoryFromRow,
      );
    },
    async saveMenuCategory(category) {
      await pool.execute(
        `INSERT INTO catalog_menu_categories
          (category_id, business_id, menu_id, name, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           menu_id = VALUES(menu_id),
           name = VALUES(name),
           sort_order = VALUES(sort_order)`,
        [
          String(category.id),
          String(category.businessId),
          String(category.menuId),
          category.name,
          category.sortOrder,
        ],
      );
      return this.getMenuCategory(category.id);
    },
    getMenuItem(id) {
      return one(
        "SELECT * FROM catalog_menu_items WHERE item_id = ? LIMIT 1",
        [String(id)],
        itemFromRow,
      );
    },
    async saveMenuItem(item) {
      await pool.execute(
        `INSERT INTO catalog_menu_items
          (item_id, business_id, menu_id, category_id, name, description,
           price_minor_units, currency, media_id, available, tags_json,
           allergens_json, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           menu_id = VALUES(menu_id),
           category_id = VALUES(category_id),
           name = VALUES(name),
           description = VALUES(description),
           price_minor_units = VALUES(price_minor_units),
           currency = VALUES(currency),
           media_id = VALUES(media_id),
           available = VALUES(available),
           tags_json = VALUES(tags_json),
           allergens_json = VALUES(allergens_json),
           sort_order = VALUES(sort_order)`,
        [
          String(item.id),
          String(item.businessId),
          String(item.menuId),
          String(item.categoryId),
          item.name,
          item.description,
          item.price.minorUnits,
          item.price.currency,
          item.mediaId,
          item.available,
          JSON.stringify(item.tags),
          JSON.stringify(item.allergens),
          item.sortOrder,
        ],
      );
      return this.getMenuItem(item.id);
    },
  });
}

async function assertOwnedPlace(pool, businessId, placeId, destinationId = null) {
  if (placeId != null) {
    const [rows] = await pool.execute(
      `SELECT place_id, business_id, destination_id
         FROM business_places
        WHERE place_id = ? AND business_id = ?
        LIMIT 1`,
      [String(placeId), String(businessId)],
    );
    const row = rows[0];
    if (!row) throw new Error("CATALOG_PLACE_OWNER_MISMATCH");
    if (
      destinationId != null &&
      String(row.destination_id) !== String(destinationId)
    ) {
      throw new Error("CATALOG_PLACE_DESTINATION_MISMATCH");
    }
    return;
  }
  if (destinationId == null) return;
  const [destinationRows] = await pool.execute(
    `SELECT business_id
       FROM business_destinations
      WHERE business_id = ? AND destination_id = ?
      LIMIT 1`,
    [String(businessId), String(destinationId)],
  );
  if (!destinationRows[0]) {
    throw new Error("CATALOG_DESTINATION_OWNER_MISMATCH");
  }
}

export function createCatalogRuntime(pool) {
  const repository = createMySqlCatalogRepository(pool);
  const service = createCatalogService(repository);

  async function scoped(scope, input, operation) {
    await assertOwnedPlace(
      pool,
      input.businessId,
      input.placeId ?? null,
      input.destinationId ?? null,
    );
    return operation(scope, input);
  }

  async function listActionContext(place) {
    const [productRows] = await pool.execute(
      `SELECT * FROM catalog_products
        WHERE business_id = ? AND place_id = ? AND status = 'active'
        ORDER BY product_id ASC`,
      [String(place.businessId), String(place.id)],
    );
    const products = productRows.map(productFromRow);
    if (products.length === 0) {
      return Object.freeze({
        products: Object.freeze([]),
        offers: Object.freeze([]),
        menus: Object.freeze([]),
      });
    }
    const productIds = products.map(({ id }) => String(id));
    const placeholders = productIds.map(() => "?").join(", ");
    const [offerRows, menuRows] = await Promise.all([
      pool.execute(
        `SELECT * FROM catalog_offers
          WHERE business_id = ? AND place_id = ?
            AND product_id IN (${placeholders})
          ORDER BY offer_id ASC`,
        [String(place.businessId), String(place.id), ...productIds],
      ),
      pool.execute(
        `SELECT * FROM catalog_menus
          WHERE business_id = ? AND place_id = ? AND status = 'active'
          ORDER BY menu_id ASC`,
        [String(place.businessId), String(place.id)],
      ),
    ]);
    return Object.freeze({
      products: Object.freeze(products),
      offers: Object.freeze(offerRows[0].map(offerFromRow)),
      menus: Object.freeze(menuRows[0].map(menuFromRow)),
    });
  }

  async function getCounts(businessId, placeId = null) {
    const placeClause = placeId == null ? "" : " AND place_id = ?";
    const params = placeId == null ? [String(businessId)] : [String(businessId), String(placeId)];
    const [[productRows], [offerRows], [menuRows]] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS count FROM catalog_products
          WHERE business_id = ?${placeClause}`,
        params,
      ),
      pool.execute(
        `SELECT COUNT(*) AS count FROM catalog_offers
          WHERE business_id = ?${placeClause}`,
        params,
      ),
      pool.execute(
        `SELECT COUNT(*) AS count FROM catalog_menus
          WHERE business_id = ?${placeClause}`,
        params,
      ),
    ]);
    return Object.freeze({
      productCount: Number(productRows[0]?.count ?? 0),
      offerCount: Number(offerRows[0]?.count ?? 0),
      menuCount: Number(menuRows[0]?.count ?? 0),
    });
  }

  async function getPublicCommerce(place) {
    const context = await listActionContext(place);
    const now = new Date().toISOString();
    const productById = new Map(
      context.products.map((product) => [String(product.id), product]),
    );
    const offers = context.offers
      .filter((offer) => {
        const result = evaluateOfferSellability(offer, { now });
        return result.reason !== "EXPIRED" && result.reason !== "NOT_ACTIVE";
      })
      .map((offer) => {
        const product = productById.get(String(offer.productId));
        return Object.freeze({
          id: String(offer.id),
          productId: String(offer.productId),
          name: product?.name ?? "",
          description: product?.description ?? "",
          price: offer.price,
          salesEndsAt: offer.salesEndsAt,
        });
      });

    const menu = context.menus[0] ?? null;
    if (!menu) {
      return Object.freeze({
        offers: Object.freeze(offers),
        menu: null,
      });
    }

    const [categoryRows, itemRows] = await Promise.all([
      pool.execute(
        `SELECT * FROM catalog_menu_categories
          WHERE business_id = ? AND menu_id = ?
          ORDER BY sort_order ASC, category_id ASC`,
        [String(place.businessId), String(menu.id)],
      ),
      pool.execute(
        `SELECT * FROM catalog_menu_items
          WHERE business_id = ? AND menu_id = ?
          ORDER BY sort_order ASC, item_id ASC`,
        [String(place.businessId), String(menu.id)],
      ),
    ]);
    const items = itemRows[0].map(itemFromRow);
    const categories = categoryRows[0].map(categoryFromRow).map((category) =>
      Object.freeze({
        id: String(category.id),
        name: category.name,
        items: Object.freeze(
          items
            .filter(
              (item) =>
                String(item.categoryId) === String(category.id) &&
                item.available,
            )
            .map((item) =>
              Object.freeze({
                id: String(item.id),
                name: item.name,
                description: item.description,
                price: item.price,
                mediaId: item.mediaId,
                available: item.available,
                tags: item.tags,
                allergens: item.allergens,
              }),
            ),
        ),
      }),
    );

    return Object.freeze({
      offers: Object.freeze(offers),
      menu: Object.freeze({
        id: String(menu.id),
        name: menu.name,
        description: menu.description,
        fallbackMediaId: menu.fallbackMediaId,
        fallbackDocumentUrl: menu.fallbackDocumentUrl,
        categories: Object.freeze(categories),
      }),
    });
  }

  return Object.freeze({
    repository,
    service: Object.freeze({
      createProduct(scope, input) {
        return scoped(scope, input, service.createProduct);
      },
      updateProduct(scope, input) {
        return scoped(scope, input, service.updateProduct);
      },
      createOffer(scope, input) {
        return scoped(scope, input, service.createOffer);
      },
      updateOffer(scope, input) {
        return scoped(scope, input, service.updateOffer);
      },
      createMenu(scope, input) {
        return scoped(scope, input, service.createMenu);
      },
      saveMenuCategory(scope, input) {
        return service.saveMenuCategory(scope, input);
      },
      saveMenuItem(scope, input) {
        return service.saveMenuItem(scope, input);
      },
    }),
    listActionContext,
    getPublicCommerce,
    getCounts,
  });
}
