import { randomUUID } from "node:crypto";
import {
  canonicalPlaceCategories,
  createPublicPlaceReadModel,
  handlePublicPlaceApiRequest,
  resolvePlacePresentationActions,
} from "@touristic/business";
import { createPlacePublicationService } from "@touristic/business/place-publication-governance";
import {
  applyCatalogSchema,
  createCatalogRuntime,
} from "./catalog-platform-runtime.mjs";
const PLACE_ID = /^[a-z0-9][a-z0-9_-]{0,159}$/u;
const DEFAULT_DESTINATION = "morro-de-sao-paulo";

function clean(value, max = 500) {
  return typeof value === "string"
    ? value.replace(/[<>]/gu, "").trim().slice(0, max)
    : "";
}

function slug(value) {
  return clean(value, 160)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new Error("PLACE_INVALID_TIMESTAMP");
  return date.toISOString();
}

function sendJson(response, status, body, headers = {}) {
  response.statusCode = status;
  for (const [key, value] of Object.entries(headers)) {
    response.setHeader(key, value);
  }
  if (status === 304) {
    response.end();
    return;
  }
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request, limit = 128 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("REQUEST_BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function placeFromRow(row, published = false) {
  const raw = parseJson(
    published ? row.published_place_json : row.editable_place_json,
    null,
  );
  if (!raw || typeof raw !== "object") return null;
  return Object.freeze(raw);
}

function revisionFromRow(row, published = false) {
  const revision = published ? row.published_revision : row.editable_revision;
  const id = published ? row.published_revision_id : row.editable_revision_id;
  const data = parseJson(
    published ? row.published_revision_json : row.editable_revision_json,
    null,
  );
  if (!revision || !id || !data) return null;
  return Object.freeze({
    id: String(id),
    revision: Number(revision),
    expectedPreviousRevision: Number(revision) > 1 ? Number(revision) - 1 : 0,
    data: Object.freeze(data),
    createdAt: iso(row.updated_at),
    createdBy: String(row.updated_by || "system"),
  });
}

function governedRecordFromRow(row) {
  const editableRevision = revisionFromRow(row, false);
  if (!editableRevision) throw new Error("PLACE_EDITABLE_REVISION_MISSING");
  return Object.freeze({
    placeId: String(row.place_id),
    businessId: String(row.business_id),
    destinationId: String(row.destination_id),
    publicationState: String(row.publication_state),
    publishedRevision: revisionFromRow(row, true),
    editableRevision,
    updatedAt: iso(row.updated_at),
  });
}

function publicRecordFromRow(row) {
  const place = placeFromRow(row, true);
  const revision = revisionFromRow(row, true);
  if (!place || !revision) return null;
  if (
    row.publication_state === "suspended" ||
    row.publication_state === "archived"
  ) {
    return null;
  }
  return Object.freeze({
    place,
    publishedRevisionId: revision.id,
    publishedRevision: revision.revision,
  });
}

function initialPlace(input, now) {
  const businessId = clean(input.businessId, 160) || slug(input.name);
  if (!PLACE_ID.test(businessId)) throw new Error("INVALID_BUSINESS_ID");
  const placeId = clean(input.placeId, 160) || `place-${businessId}`;
  if (!PLACE_ID.test(placeId)) throw new Error("INVALID_PLACE_ID");
  const destinationId = clean(input.destinationId, 160) || DEFAULT_DESTINATION;
  const categoryId = clean(input.categoryId, 160);
  if (!categoryId) throw new Error("INVALID_CATEGORY_ID");
  const name = clean(input.name, 160);
  if (!name) throw new Error("NAME_REQUIRED");

  const requestedCapabilities = Array.isArray(input.capabilities)
    ? [
        ...new Set(
          input.capabilities.map((value) => clean(value, 80)).filter(Boolean),
        ),
      ]
    : ["directions"];
  return Object.freeze({
    id: placeId,
    businessId,
    destinationId,
    name,
    slug: slug(name) || placeId,
    categoryId,
    subcategoryIds: Object.freeze([]),
    shortDescription: clean(input.shortDescription, 500),
    description: clean(input.description ?? input.shortDescription, 4000),
    location: Object.freeze({
      latitude: null,
      longitude: null,
      address: "",
      area: "",
      source: "manual",
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: null,
      verifiedBy: null,
    }),
    contact: Object.freeze({
      phone: null,
      whatsapp: null,
      email: null,
      website: null,
    }),
    openingHours: null,
    amenities: Object.freeze([]),
    tags: Object.freeze([]),
    capabilities: Object.freeze({
      enabled: Object.freeze(requestedCapabilities),
    }),
    visibility: "public",
    publicationState: "draft",
    createdAt: now,
    updatedAt: now,
  });
}

function governedDataFromPlace(place) {
  return Object.freeze({
    placeId: String(place.id),
    businessId: String(place.businessId),
    destinationId: String(place.destinationId),
    name: place.name,
    categoryId: String(place.categoryId),
    description: place.description || place.shortDescription,
    location: Object.freeze({
      latitude: place.location.latitude,
      longitude: place.location.longitude,
    }),
    capabilities: Object.freeze({
      enabled: Object.freeze([...place.capabilities.enabled]),
    }),
    visibility: place.visibility,
    openingHoursPresent: Boolean(place.openingHours),
    contactPresent: Boolean(
      place.contact.phone ||
      place.contact.whatsapp ||
      place.contact.email ||
      place.contact.website,
    ),
    menuPresent: false,
  });
}

function mergeProfile(place, input, now) {
  const nextName = clean(input.name, 160) || place.name;
  const tags =
    typeof input.tags === "string"
      ? input.tags
          .split(",")
          .map((value) => clean(value, 80))
          .filter(Boolean)
      : place.tags;
  const amenities =
    typeof input.amenities === "string"
      ? input.amenities
          .split(",")
          .map((value) => clean(value, 80))
          .filter(Boolean)
      : place.amenities;
  return Object.freeze({
    ...place,
    name: nextName,
    slug: slug(nextName) || place.slug,
    categoryId: clean(input.categoryId, 160) || place.categoryId,
    shortDescription:
      input.shortDescription === undefined
        ? place.shortDescription
        : clean(input.shortDescription, 500),
    description:
      input.description === undefined
        ? place.description
        : clean(input.description, 4000),
    tags: Object.freeze(tags),
    amenities: Object.freeze(amenities),
    updatedAt: now,
  });
}

function mergeLocation(place, input, actor, now) {
  if (
    input.latitude === null ||
    input.latitude === undefined ||
    input.latitude === "" ||
    input.longitude === null ||
    input.longitude === undefined ||
    input.longitude === ""
  ) {
    throw new Error("INVALID_PLACE_LOCATION");
  }
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("INVALID_PLACE_LOCATION");
  }
  return Object.freeze({
    ...place,
    location: Object.freeze({
      latitude,
      longitude,
      address: clean(input.address, 500),
      area: clean(input.area, 160),
      source: "manual",
      externalProvider: null,
      externalPlaceId: null,
      verifiedAt: now,
      verifiedBy: actor?.subject ?? "platform",
    }),
    updatedAt: now,
  });
}

async function applySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_entities (
      id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      legal_name VARCHAR(240) NOT NULL,
      display_name VARCHAR(240) NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_destinations (
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      destination_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (business_id, destination_id),
      CONSTRAINT fk_business_destinations_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_business_destination (destination_id, business_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_places (
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      business_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      destination_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      category_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      publication_state ENUM('draft','review','published','suspended','archived') NOT NULL,
      editable_revision INT UNSIGNED NOT NULL,
      editable_revision_id VARCHAR(220) COLLATE utf8mb4_bin NOT NULL,
      editable_place_json JSON NOT NULL,
      editable_revision_json JSON NOT NULL,
      published_revision INT UNSIGNED NULL,
      published_revision_id VARCHAR(220) COLLATE utf8mb4_bin NULL,
      published_place_json JSON NULL,
      published_revision_json JSON NULL,
      published_latitude DECIMAL(10,7) NULL,
      published_longitude DECIMAL(10,7) NULL,
      updated_by VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      updated_at DATETIME(3) NOT NULL,
      PRIMARY KEY (place_id),
      CONSTRAINT fk_business_places_business
        FOREIGN KEY (business_id) REFERENCES business_entities(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      KEY idx_place_business (business_id),
      KEY idx_place_public_map (
        publication_state,
        destination_id,
        category_id,
        published_latitude,
        published_longitude
      )
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_place_revision_history (
      place_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      revision INT UNSIGNED NOT NULL,
      revision_id VARCHAR(220) COLLATE utf8mb4_bin NOT NULL,
      revision_json JSON NOT NULL,
      actor_id VARCHAR(160) COLLATE utf8mb4_bin NOT NULL,
      created_at DATETIME(3) NOT NULL,
      PRIMARY KEY (place_id, revision),
      UNIQUE KEY uq_place_revision_id (revision_id),
      CONSTRAINT fk_place_revision_place
        FOREIGN KEY (place_id) REFERENCES business_places(place_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function createGovernanceRepository(pool) {
  async function getRow(placeId, connection = pool) {
    const [rows] = await connection.execute(
      `SELECT * FROM business_places WHERE place_id = ? LIMIT 1`,
      [placeId],
    );
    return rows[0] ?? null;
  }

  return Object.freeze({
    async get(placeId) {
      const row = await getRow(placeId);
      return row ? governedRecordFromRow(row) : null;
    },

    async saveDraft(record, expectedRevision) {
      const place = parseJson(record.editableRevision.data.__place, null);
      const effectivePlace =
        place ??
        Object.freeze({
          ...(await (async () => {
            const row = await getRow(record.placeId);
            return placeFromRow(row, false);
          })()),
          name: record.editableRevision.data.name,
          categoryId: record.editableRevision.data.categoryId,
          description: record.editableRevision.data.description,
          capabilities: record.editableRevision.data.capabilities,
          visibility: record.editableRevision.data.visibility,
          location: {
            ...(await (async () => {
              const row = await getRow(record.placeId);
              return placeFromRow(row, false)?.location ?? {};
            })()),
            ...record.editableRevision.data.location,
          },
          updatedAt: record.updatedAt,
        });

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
          `UPDATE business_places
            SET category_id = ?,
                publication_state = ?,
                editable_revision = ?,
                editable_revision_id = ?,
                editable_place_json = ?,
                editable_revision_json = ?,
                updated_by = ?,
                updated_at = ?
          WHERE place_id = ? AND editable_revision = ?`,
          [
            record.editableRevision.data.categoryId,
            record.publicationState,
            record.editableRevision.revision,
            record.editableRevision.id,
            JSON.stringify(effectivePlace),
            JSON.stringify(record.editableRevision.data),
            record.editableRevision.createdBy,
            new Date(record.updatedAt),
            record.placeId,
            expectedRevision,
          ],
        );
        if (result.affectedRows !== 1)
          throw new Error("PLACE_PUBLICATION_STALE_REVISION");
        await connection.execute(
          `INSERT INTO business_place_revision_history
          (place_id, revision, revision_id, revision_json, actor_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
          [
            record.placeId,
            record.editableRevision.revision,
            record.editableRevision.id,
            JSON.stringify(record.editableRevision.data),
            record.editableRevision.createdBy,
            new Date(record.editableRevision.createdAt),
          ],
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      const row = await getRow(record.placeId);
      return governedRecordFromRow(row);
    },

    async publishAtomically({ placeId, expectedRevision, next }) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const row = await getRow(placeId, connection);
        if (!row || Number(row.editable_revision) !== expectedRevision) {
          throw new Error("PLACE_PUBLICATION_STALE_REVISION");
        }
        const editablePlace = placeFromRow(row, false);
        if (!editablePlace) throw new Error("PLACE_EDITABLE_STATE_INVALID");
        const latitude = editablePlace.location?.latitude ?? null;
        const longitude = editablePlace.location?.longitude ?? null;
        const [result] = await connection.execute(
          `UPDATE business_places
              SET publication_state = 'published',
                  published_revision = editable_revision,
                  published_revision_id = editable_revision_id,
                  published_place_json = editable_place_json,
                  published_revision_json = editable_revision_json,
                  published_latitude = ?,
                  published_longitude = ?,
                  updated_by = ?,
                  updated_at = ?
            WHERE place_id = ? AND editable_revision = ?`,
          [
            latitude,
            longitude,
            next.editableRevision.createdBy,
            new Date(next.updatedAt),
            placeId,
            expectedRevision,
          ],
        );
        if (result.affectedRows !== 1) {
          throw new Error("PLACE_PUBLICATION_STALE_REVISION");
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      return governedRecordFromRow(await getRow(placeId));
    },

    async setState(placeId, state, expectedRevision) {
      const [result] = await pool.execute(
        `UPDATE business_places
            SET publication_state = ?, updated_at = CURRENT_TIMESTAMP(3)
          WHERE place_id = ? AND editable_revision = ?`,
        [state, placeId, expectedRevision],
      );
      if (result.affectedRows !== 1)
        throw new Error("PLACE_PUBLICATION_STALE_REVISION");
      return governedRecordFromRow(await getRow(placeId));
    },
  });
}

function createPublicRepository(pool) {
  return Object.freeze({
    async listPublished({ destinationId, bbox, category, limit, cursor }) {
      const params = [
        destinationId,
        bbox.south,
        bbox.north,
        bbox.west,
        bbox.east,
      ];
      const clauses = [
        "published_revision IS NOT NULL",
        "publication_state NOT IN ('suspended', 'archived')",
        "published_place_json IS NOT NULL",
        "destination_id = ?",
        "published_latitude BETWEEN ? AND ?",
        "published_longitude BETWEEN ? AND ?",
      ];
      if (category) {
        clauses.push("category_id = ?");
        params.push(category);
      }
      if (cursor) {
        clauses.push("place_id > ?");
        params.push(cursor);
      }
      const boundedLimit = Math.max(1, Math.min(1001, Number(limit) + 1));
      const [rows] = await pool.execute(
        `SELECT * FROM business_places
          WHERE ${clauses.join(" AND ")}
          ORDER BY place_id ASC
          LIMIT ${boundedLimit}`,
        params,
      );
      const sliced = rows.slice(0, limit);
      const items = sliced.map(publicRecordFromRow).filter(Boolean);
      return Object.freeze({
        items: Object.freeze(items),
        nextCursor:
          rows.length > limit ? String(sliced.at(-1)?.place_id ?? "") : null,
      });
    },

    async getPublished(placeId) {
      const [rows] = await pool.execute(
        `SELECT * FROM business_places
          WHERE place_id = ? AND published_revision IS NOT NULL
            AND publication_state NOT IN ('suspended', 'archived')
          LIMIT 1`,
        [String(placeId)],
      );
      return rows[0] ? publicRecordFromRow(rows[0]) : null;
    },
  });
}

function createMediaPort(mediaRepository) {
  if (!mediaRepository) {
    return Object.freeze({
      async getPublishedMedia() {
        return null;
      },
    });
  }
  return Object.freeze({
    async getPublishedMedia(place) {
      const links = await mediaRepository.listLinks(String(place.id));
      const entries = [];
      for (const link of links) {
        const asset = await mediaRepository.getAsset(link.mediaId);
        if (
          asset &&
          asset.businessId === String(place.businessId) &&
          asset.publicationState === "published"
        ) {
          entries.push({ link, asset });
        }
      }
      const image = ({ asset }) =>
        Object.freeze({
          mediaId: asset.id,
          provider: asset.provider,
          providerReference: asset.providerReference,
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          alt: asset.alt,
        });
      const cover = entries.find(({ link }) => link.role === "cover") ?? null;
      const logo = entries.find(({ link }) => link.role === "logo") ?? null;
      const gallery = entries
        .filter(({ link }) => link.role === "gallery" || link.role === "cover")
        .sort((a, b) => a.link.sortOrder - b.link.sortOrder)
        .map(image);
      return Object.freeze({
        placeId: String(place.id),
        coverImage: cover ? image(cover) : null,
        gallery: Object.freeze(gallery),
        logo: logo ? image(logo) : null,
      });
    },
  });
}

function createActionPort(catalogRuntime) {
  return Object.freeze({
    async resolvePublicActions({ place, businessId, media, commerce, locale }) {
      const catalogContext = catalogRuntime
        ? await catalogRuntime.listActionContext({
            id: place.id,
            businessId,
            destinationId: place.destinationId,
          })
        : { products: [], offers: [], menus: [] };
      const localeKey = ["pt", "en", "es", "he"].includes(
        String(locale).slice(0, 2),
      )
        ? String(locale).slice(0, 2)
        : "pt";
      const categoryKey = canonicalPlaceCategories.includes(place.categoryId)
        ? place.categoryId
        : "attractions";
      const resolved = resolvePlacePresentationActions({
        place: {
          id: place.id,
          businessId,
          destinationId: place.destinationId,
          categoryId: place.categoryId,
          capabilities: { enabled: place.capabilities },
          location: {
            latitude: place.location.latitude,
            longitude: place.location.longitude,
          },
          contact: place.contact,
          description: place.description,
        },
        category: {
          id: place.categoryId,
          key: categoryKey,
          active: true,
        },
        locale: localeKey,
        now: new Date().toISOString(),
        products: catalogContext.products,
        offers: catalogContext.offers,
        menus: catalogContext.menus,
        inventory: [],
        media: { galleryAvailable: Boolean(media?.gallery?.length) },
        providers: {},
      });
      return Object.freeze({
        placeId: resolved.placeId,
        businessId: String(resolved.businessId),
        destinationId: String(resolved.destinationId),
        primaryAction: resolved.primaryAction,
        secondaryActions: resolved.secondaryActions,
      });
    },
  });
}

function createCatalog(mediaRepository) {
  return Object.freeze({
    async hasActiveCategory(categoryId) {
      return canonicalPlaceCategories.includes(categoryId);
    },
    async mediaBelongsToBusiness(businessId, mediaId) {
      if (!mediaRepository) return false;
      const asset = await mediaRepository.getAsset(mediaId);
      return Boolean(asset && asset.businessId === businessId);
    },
    async capabilityIsSupported(_categoryId, capability) {
      return [
        "directions",
        "photos",
        "menu",
        "tableReservation",
        "tickets",
        "booking",
        "whatsapp",
        "call",
        "website",
        "products",
        "offers",
        "tourBooking",
        "transportBooking",
      ].includes(capability);
    },
  });
}

function createAuditPort(platformOperations) {
  return Object.freeze({
    async record(event) {
      platformOperations?.emit?.({
        kind: "audit",
        name: "place.publication",
        severity: event.result === "success" ? "info" : "warn",
        correlationId: event.correlationId,
        attributes: event,
      });
    },
  });
}

export function createPlacePlatformRuntime({
  authApi,
  getEnvironmentValue = (key) => process.env[key] ?? "",
  platformOperations,
  poolFactory = null,
} = {}) {
  let pool = null;
  let mediaPool = null;
  let mediaRepository = null;
  let governanceRepository = null;
  let publicationService = null;
  let catalogRuntime = null;
  let readModel = null;
  let ready = false;
  let reason = "PLACE_PLATFORM_NOT_STARTED";

  async function start() {
    const databaseUrl = String(
      getEnvironmentValue("BUSINESS_DATABASE_URL") || "",
    ).trim();
    if (!databaseUrl) {
      reason = "BUSINESS_DATABASE_URL_REQUIRED";
      return false;
    }
    try {
      let effectivePoolFactory = poolFactory;
      let MediaRepository = null;
      if (!effectivePoolFactory) {
        const contentServer = await import("@touristic/content-server");
        effectivePoolFactory = contentServer.createMySqlPool;
        MediaRepository = contentServer.MySqlPlaceMediaRepository;
      }

      pool = effectivePoolFactory(databaseUrl, {
        connectionLimit: Number(
          getEnvironmentValue("BUSINESS_DATABASE_POOL_SIZE") || 6,
        ),
        errorPrefix: "BUSINESS_DATABASE",
      });
      await applySchema(pool);
      await applyCatalogSchema(pool);
      governanceRepository = createGovernanceRepository(pool);
      catalogRuntime = createCatalogRuntime(pool);
      await catalogRuntime.backfillPublishedSnapshots();

      const contentUrl = String(
        getEnvironmentValue("CONTENT_DATABASE_URL") || "",
      ).trim();
      if (contentUrl) {
        if (!MediaRepository) {
          const contentServer = await import("@touristic/content-server");
          MediaRepository = contentServer.MySqlPlaceMediaRepository;
        }
        mediaPool = effectivePoolFactory(contentUrl, {
          connectionLimit: Number(
            getEnvironmentValue("CONTENT_DATABASE_POOL_SIZE") || 6,
          ),
          errorPrefix: "CONTENT_DATABASE",
        });
        mediaRepository = new MediaRepository(mediaPool);
      }

      publicationService = createPlacePublicationService(
        governanceRepository,
        createCatalog(mediaRepository),
        createAuditPort(platformOperations),
      );

      readModel = createPublicPlaceReadModel({
        repository: createPublicRepository(pool),
        media: createMediaPort(mediaRepository),
        commerce: Object.freeze({
          getPublicCommerce(place) {
            return catalogRuntime.getPublicCommerce(place);
          },
        }),
        actions: createActionPort(catalogRuntime),
      });
      ready = true;
      reason = "place-platform-ready";
      return true;
    } catch (error) {
      ready = false;
      reason = clean(
        error instanceof Error ? error.message : "PLACE_PLATFORM_START_FAILED",
        160,
      );
      return false;
    }
  }

  async function stop() {
    ready = false;
    await Promise.allSettled([
      pool?.end?.(),
      mediaPool && mediaPool !== pool ? mediaPool.end?.() : Promise.resolve(),
    ]);
  }

  function readinessCheck() {
    return {
      status: ready ? "pass" : "fail",
      critical: false,
      detail: reason,
    };
  }

  function assertReady() {
    if (!ready || !pool || !governanceRepository || !publicationService) {
      throw new Error("PLACE_PLATFORM_UNAVAILABLE");
    }
  }

  async function handlePublic(request, response, requestUrl) {
    if (!ready || !readModel) {
      sendJson(
        response,
        503,
        { error: "PLACE_PLATFORM_UNAVAILABLE" },
        { "Cache-Control": "no-store" },
      );
      return true;
    }
    const query = Object.fromEntries(requestUrl.searchParams.entries());
    const result = await handlePublicPlaceApiRequest(readModel, {
      method: request.method || "GET",
      pathname: requestUrl.pathname,
      query,
      headers: {
        "if-none-match": request.headers?.["if-none-match"],
      },
      locale: requestUrl.searchParams.get("locale") || "pt-BR",
    });
    if (!result) return false;
    sendJson(response, result.status, result.body, result.headers);
    return true;
  }

  async function listCms(requestUrl) {
    assertReady();
    const query = clean(
      requestUrl.searchParams.get("query"),
      160,
    ).toLowerCase();
    const destinationId = clean(
      requestUrl.searchParams.get("destinationId"),
      160,
    );
    const categoryId = clean(requestUrl.searchParams.get("categoryId"), 160);
    const publicationState = clean(
      requestUrl.searchParams.get("publicationState"),
      40,
    );
    const locationStatus = clean(
      requestUrl.searchParams.get("locationStatus"),
      20,
    );
    if (locationStatus && !["confirmed", "missing"].includes(locationStatus)) {
      throw new Error("INVALID_LOCATION_STATUS");
    }
    const clauses = ["1=1"];
    const params = [];
    if (destinationId) {
      clauses.push("p.destination_id = ?");
      params.push(destinationId);
    }
    if (categoryId) {
      clauses.push("p.category_id = ?");
      params.push(categoryId);
    }
    if (publicationState) {
      clauses.push("p.publication_state = ?");
      params.push(publicationState === "ready" ? "review" : publicationState);
    }
    if (locationStatus === "confirmed") {
      clauses.push(
        "JSON_EXTRACT(p.editable_place_json, '$.location.latitude') IS NOT NULL",
      );
    } else if (locationStatus === "missing") {
      clauses.push(
        "JSON_EXTRACT(p.editable_place_json, '$.location.latitude') IS NULL",
      );
    }
    if (query) {
      clauses.push(
        "(LOWER(JSON_UNQUOTE(JSON_EXTRACT(p.editable_place_json, '$.name'))) LIKE ? OR LOWER(b.id) LIKE ? OR LOWER(p.place_id) LIKE ?)",
      );
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }
    const [rows] = await pool.execute(
      `SELECT b.id AS business_id,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.editable_place_json, '$.name')), b.display_name) AS display_name,
              p.destination_id, p.place_id, p.category_id,
              p.publication_state, p.editable_place_json
         FROM business_entities b
         LEFT JOIN business_places p ON p.business_id = b.id
        WHERE ${clauses.join(" AND ")}
        ORDER BY b.display_name ASC, p.place_id ASC
        LIMIT 250`,
      params,
    );
    const businesses = rows.map((row) => ({
      businessId: row.business_id,
      name: row.display_name,
      destinationId: row.destination_id,
      categoryId: row.category_id,
      publicationState: row.publication_state ?? "draft",
      placeId: row.place_id,
      locationStatus:
        placeFromRow(row, false)?.location?.latitude != null
          ? "confirmed"
          : "missing",
      productCount: 0,
      offerCount: 0,
    }));
    return Object.freeze({
      businesses: Object.freeze(businesses),
      destinations: Object.freeze([
        ...new Map(
          rows.map((row) => [
            row.destination_id,
            { id: row.destination_id, name: row.destination_id },
          ]),
        ).values(),
      ]),
      categories: Object.freeze(
        canonicalPlaceCategories.map((id) => ({ id, key: id, name: id })),
      ),
      filters: Object.freeze({
        query,
        destinationId,
        categoryId,
        publicationState,
        locationStatus,
      }),
    });
  }

  async function catalogPlaceForBusiness(businessId) {
    assertReady();
    const [rows] = await pool.execute(
      `SELECT * FROM business_places
        WHERE business_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
      [businessId],
    );
    const row = rows[0];
    if (!row) throw new Error("PLACE_NOT_FOUND");
    return placeFromRow(row, false);
  }

  function draftTags(value) {
    const source = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];
    return Object.freeze(
      [
        ...new Set(
          source.map((entry) => clean(String(entry), 80)).filter(Boolean),
        ),
      ].slice(0, 20),
    );
  }

  function assertCatalogScopeFields(place, input) {
    if (
      input?.businessId != null &&
      String(input.businessId) !== String(place.businessId)
    ) {
      throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
    }
    if (
      input?.placeId != null &&
      String(input.placeId) !== String(place.id)
    ) {
      throw new Error("CATALOG_PLACE_OWNER_MISMATCH");
    }
    if (
      input?.destinationId != null &&
      String(input.destinationId) !== String(place.destinationId)
    ) {
      throw new Error("CATALOG_PLACE_DESTINATION_MISMATCH");
    }
  }

  async function advanceCatalogRevision(actor, businessId) {
    const [rows] = await pool.execute(
      `SELECT * FROM business_places
        WHERE business_id = ?
        ORDER BY created_at ASC
        LIMIT 1`,
      [String(businessId)],
    );
    const row = rows[0];
    if (!row) throw new Error("PLACE_NOT_FOUND");
    const current = governedRecordFromRow(row);
    return publicationService.saveRevision(
      {
        session: actor,
        correlationId: "control-center-catalog",
        now: new Date().toISOString(),
      },
      current.placeId,
      current.editableRevision.data,
      current.editableRevision.revision,
    );
  }

  async function createCatalogDraft(actor, businessId, kind, input) {
    const place = await catalogPlaceForBusiness(businessId);
    assertCatalogScopeFields(place, input);
    const now = new Date().toISOString();
    const scope = { businessId: String(place.businessId) };
    let result;
    if (kind === "product") {
      result = await catalogRuntime.service.createProduct(scope, {
        id: `product-${randomUUID()}`,
        businessId: String(place.businessId),
        placeId: String(place.id),
        destinationId: String(place.destinationId),
        name: clean(input.name, 180),
        description: clean(input.description, 2000),
        status: "draft",
        tags: draftTags(input.tags),
        legacyReference: null,
        createdAt: now,
        updatedAt: now,
      });
    } else if (kind === "offer") {
      result = await catalogRuntime.service.createOffer(scope, {
        id: `offer-${randomUUID()}`,
        businessId: String(place.businessId),
        placeId: String(place.id),
        destinationId: String(place.destinationId),
        productId: clean(input.productId, 160),
        price: {
          minorUnits: Number(input.minorUnits),
          currency: clean(input.currency || "BRL", 3).toUpperCase(),
        },
        salesStartsAt: input.salesStartsAt ? String(input.salesStartsAt) : null,
        salesEndsAt: input.salesEndsAt ? String(input.salesEndsAt) : null,
        experienceStartsAt: input.experienceStartsAt
          ? String(input.experienceStartsAt)
          : null,
        experienceEndsAt: input.experienceEndsAt
          ? String(input.experienceEndsAt)
          : null,
        capacity:
          input.capacity === "" || input.capacity == null
            ? null
            : Number(input.capacity),
        status: "draft",
        legacyLabel: null,
        createdAt: now,
        updatedAt: now,
      });
    } else if (kind === "menu") {
      result = await catalogRuntime.service.createMenu(scope, {
        id: `menu-${randomUUID()}`,
        businessId: String(place.businessId),
        placeId: String(place.id),
        name: clean(input.name, 180),
        description: clean(input.description, 2000),
        status: "draft",
        fallbackMediaId: input.fallbackMediaId
          ? clean(input.fallbackMediaId, 160)
          : null,
        fallbackDocumentUrl: input.fallbackDocumentUrl
          ? clean(input.fallbackDocumentUrl, 1000)
          : null,
        createdAt: now,
        updatedAt: now,
      });
    } else if (kind === "menu-category") {
      result = await catalogRuntime.service.saveMenuCategory(scope, {
        id: `menu-category-${randomUUID()}`,
        businessId: String(place.businessId),
        menuId: clean(input.menuId, 160),
        name: clean(input.name, 180),
        sortOrder: Number(input.sortOrder ?? 0),
      });
    } else if (kind === "menu-item") {
      result = await catalogRuntime.service.saveMenuItem(scope, {
        id: `menu-item-${randomUUID()}`,
        businessId: String(place.businessId),
        menuId: clean(input.menuId, 160),
        categoryId: clean(input.categoryId, 160),
        name: clean(input.name, 180),
        description: clean(input.description, 2000),
        price: {
          minorUnits: Number(input.minorUnits),
          currency: clean(input.currency || "BRL", 3).toUpperCase(),
        },
        mediaId: input.mediaId ? clean(input.mediaId, 160) : null,
        available: false,
        tags: draftTags(input.tags),
        allergens: draftTags(input.allergens),
        sortOrder: Number(input.sortOrder ?? 0),
      });
    } else {
      throw new Error("CATALOG_DRAFT_KIND_INVALID");
    }
    const record = await advanceCatalogRevision(actor, businessId);
    return Object.freeze({
      ...result,
      editableRevision: record.editableRevision.revision,
      publicationState: record.publicationState,
    });
  }

  async function updateCatalogEntry(actor, businessId, kind, id, input) {
    const place = await catalogPlaceForBusiness(businessId);
    assertCatalogScopeFields(place, input);
    const scope = { businessId: String(place.businessId) };
    const entryId = clean(id, 160);
    if (!entryId) throw new Error("CATALOG_ID_REQUIRED");
    let result;
    if (kind === "product") {
      const existing = await catalogRuntime.repository.getProduct(entryId);
      if (!existing) throw new Error("PRODUCT_NOT_FOUND");
      if (
        String(existing.businessId) !== String(place.businessId) ||
        String(existing.placeId) !== String(place.id)
      ) {
        throw new Error("CATALOG_PLACE_OWNER_MISMATCH");
      }
      result = await catalogRuntime.service.updateProduct(scope, {
        ...existing,
        name: input.name === undefined ? existing.name : clean(input.name, 180),
        description:
          input.description === undefined
            ? existing.description
            : clean(input.description, 2000),
        status:
          input.status === undefined ? existing.status : clean(input.status, 24),
        tags: input.tags === undefined ? existing.tags : draftTags(input.tags),
        updatedAt: new Date().toISOString(),
      });
    } else if (kind === "offer") {
      const existing = await catalogRuntime.repository.getOffer(entryId);
      if (!existing) throw new Error("OFFER_NOT_FOUND");
      if (
        String(existing.businessId) !== String(place.businessId) ||
        String(existing.placeId) !== String(place.id)
      ) {
        throw new Error("CATALOG_PLACE_OWNER_MISMATCH");
      }
      result = await catalogRuntime.service.updateOffer(scope, {
        ...existing,
        productId:
          input.productId === undefined
            ? existing.productId
            : clean(input.productId, 160),
        price: {
          minorUnits:
            input.minorUnits === undefined
              ? existing.price.minorUnits
              : Number(input.minorUnits),
          currency:
            input.currency === undefined
              ? existing.price.currency
              : clean(input.currency, 3).toUpperCase(),
        },
        salesStartsAt:
          input.salesStartsAt === undefined
            ? existing.salesStartsAt
            : input.salesStartsAt
              ? String(input.salesStartsAt)
              : null,
        salesEndsAt:
          input.salesEndsAt === undefined
            ? existing.salesEndsAt
            : input.salesEndsAt
              ? String(input.salesEndsAt)
              : null,
        experienceStartsAt:
          input.experienceStartsAt === undefined
            ? existing.experienceStartsAt
            : input.experienceStartsAt
              ? String(input.experienceStartsAt)
              : null,
        experienceEndsAt:
          input.experienceEndsAt === undefined
            ? existing.experienceEndsAt
            : input.experienceEndsAt
              ? String(input.experienceEndsAt)
              : null,
        capacity:
          input.capacity === undefined
            ? existing.capacity
            : input.capacity === "" || input.capacity == null
              ? null
              : Number(input.capacity),
        status:
          input.status === undefined ? existing.status : clean(input.status, 24),
        updatedAt: new Date().toISOString(),
      });
    } else if (kind === "menu") {
      const existing = await catalogRuntime.repository.getMenu(entryId);
      if (!existing) throw new Error("MENU_NOT_FOUND");
      if (
        String(existing.businessId) !== String(place.businessId) ||
        String(existing.placeId) !== String(place.id)
      ) {
        throw new Error("CATALOG_PLACE_OWNER_MISMATCH");
      }
      result = await catalogRuntime.service.updateMenu(scope, {
        ...existing,
        name: input.name === undefined ? existing.name : clean(input.name, 180),
        description:
          input.description === undefined
            ? existing.description
            : clean(input.description, 2000),
        status:
          input.status === undefined ? existing.status : clean(input.status, 24),
        fallbackMediaId:
          input.fallbackMediaId === undefined
            ? existing.fallbackMediaId
            : input.fallbackMediaId
              ? clean(input.fallbackMediaId, 160)
              : null,
        fallbackDocumentUrl:
          input.fallbackDocumentUrl === undefined
            ? existing.fallbackDocumentUrl
            : input.fallbackDocumentUrl
              ? clean(input.fallbackDocumentUrl, 1000)
              : null,
        updatedAt: new Date().toISOString(),
      });
    } else if (kind === "menu-category") {
      const existing = await catalogRuntime.repository.getMenuCategory(entryId);
      if (!existing) throw new Error("MENU_CATEGORY_NOT_FOUND");
      if (String(existing.businessId) !== String(place.businessId)) {
        throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
      }
      result = await catalogRuntime.service.saveMenuCategory(scope, {
        ...existing,
        name: input.name === undefined ? existing.name : clean(input.name, 180),
        sortOrder:
          input.sortOrder === undefined
            ? existing.sortOrder
            : Number(input.sortOrder),
      });
    } else if (kind === "menu-item") {
      const existing = await catalogRuntime.repository.getMenuItem(entryId);
      if (!existing) throw new Error("MENU_ITEM_NOT_FOUND");
      if (String(existing.businessId) !== String(place.businessId)) {
        throw new Error("CATALOG_CROSS_BUSINESS_DENIED");
      }
      result = await catalogRuntime.service.saveMenuItem(scope, {
        ...existing,
        categoryId:
          input.categoryId === undefined
            ? existing.categoryId
            : clean(input.categoryId, 160),
        name: input.name === undefined ? existing.name : clean(input.name, 180),
        description:
          input.description === undefined
            ? existing.description
            : clean(input.description, 2000),
        price: {
          minorUnits:
            input.minorUnits === undefined
              ? existing.price.minorUnits
              : Number(input.minorUnits),
          currency:
            input.currency === undefined
              ? existing.price.currency
              : clean(input.currency, 3).toUpperCase(),
        },
        mediaId:
          input.mediaId === undefined
            ? existing.mediaId
            : input.mediaId
              ? clean(input.mediaId, 160)
              : null,
        available:
          input.available === undefined
            ? existing.available
            : input.available === true || input.available === "true",
        tags: input.tags === undefined ? existing.tags : draftTags(input.tags),
        allergens:
          input.allergens === undefined
            ? existing.allergens
            : draftTags(input.allergens),
        sortOrder:
          input.sortOrder === undefined
            ? existing.sortOrder
            : Number(input.sortOrder),
      });
    } else {
      throw new Error("CATALOG_DRAFT_KIND_INVALID");
    }
    const record = await advanceCatalogRevision(actor, businessId);
    return Object.freeze({
      ...result,
      editableRevision: record.editableRevision.revision,
      publicationState: record.publicationState,
    });
  }

  async function getCmsDetail(businessId) {
    assertReady();
    const [rows] = await pool.execute(
      `SELECT b.id AS business_id, b.display_name,
              p.*
         FROM business_entities b
         LEFT JOIN business_places p ON p.business_id = b.id
        WHERE b.id = ?
        ORDER BY p.created_at ASC
        LIMIT 1`,
      [businessId],
    );
    const row = rows[0];
    if (!row) return null;
    const place = row.place_id ? placeFromRow(row, false) : null;
    const governed = row.place_id ? governedRecordFromRow(row) : null;
    let media = { count: 0, assets: [] };
    if (place && mediaRepository) {
      const links = await mediaRepository.listLinks(String(place.id));
      media = {
        count: links.length,
        assets: await Promise.all(
          links.map(async (link) => {
            const asset = await mediaRepository.getAsset(link.mediaId);
            if (asset && asset.businessId !== place.businessId) {
              throw new Error("MEDIA_ACCESS_BUSINESS_DENIED");
            }
            return { ...link, asset };
          }),
        ),
      };
    }
    const [history] = place
      ? await pool.execute(
          `SELECT revision, actor_id, created_at
             FROM business_place_revision_history
            WHERE place_id = ? ORDER BY revision DESC LIMIT 30`,
          [place.id],
        )
      : [[]];
    const projectedActions = place
      ? await createActionPort(catalogRuntime).resolvePublicActions({
          place: { ...place, capabilities: place.capabilities.enabled },
          businessId: String(place.businessId),
          media: {
            gallery: media.assets.filter(
              (entry) =>
                ["cover", "gallery"].includes(entry.role) &&
                entry.asset?.publicationState === "published",
            ),
          },
          commerce: null,
          locale: "pt-BR",
        })
      : null;
    const users = (await authApi?.listAdminUsers?.()) ?? [];
    const team = users
      .filter((user) => user.businessIds?.includes(businessId))
      .map((user) => ({ id: user.id, email: user.email, role: user.role }));
    const catalog = place
      ? {
          ...(await catalogRuntime.getCounts(
            String(place.businessId),
            String(place.id),
          )),
          ...(await catalogRuntime.getAdminCatalog(
            String(place.businessId),
            String(place.id),
          )),
        }
      : {
          productCount: 0,
          offerCount: 0,
          menuCount: 0,
          products: [],
          offers: [],
          menus: [],
          categories: [],
          items: [],
        };
    return Object.freeze({
      businessId: row.business_id,
      name: row.display_name,
      destinationId: row.destination_id,
      categoryId: row.category_id,
      placeId: row.place_id ?? null,
      place: place ? { placeId: place.id } : null,
      profile: place
        ? {
            name: place.name,
            categoryId: place.categoryId,
            shortDescription: place.shortDescription,
            description: place.description,
            tags: place.tags,
            amenities: place.amenities,
          }
        : {},
      location: place
        ? {
            status: place.location.latitude == null ? "missing" : "confirmed",
            address: place.location.address,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
            source: place.location.source,
          }
        : { status: "missing" },
      media,
      catalog,
      actions: {
        automatic: [],
        available: [
          ...(projectedActions?.primaryAction
            ? [projectedActions.primaryAction]
            : []),
          ...(projectedActions?.secondaryActions ?? []),
        ],
        incompatible: [],
      },
      publication: governed
        ? {
            state: governed.publicationState,
            publishedRevision: governed.publishedRevision?.revision ?? null,
            editableRevision: governed.editableRevision.revision,
          }
        : { state: "draft", publishedRevision: null, editableRevision: null },
      publicationState: governed?.publicationState ?? "draft",
      team,
      audit: history.map((entry) => ({
        action: "place.revision.saved",
        result: `revision ${entry.revision} · ${entry.actor_id}`,
        timestamp: iso(entry.created_at),
      })),
      preview: place
        ? {
            locale: "pt-BR",
            name: place.name,
            description: place.shortDescription,
            categoryId: place.categoryId,
            location: place.location,
            actions: projectedActions,
            media,
            source: "editable-revision",
          }
        : null,
    });
  }

  async function createDraft(actor, input) {
    assertReady();
    const now = new Date().toISOString();
    const place = initialPlace(input, now);
    const data = Object.freeze({
      ...governedDataFromPlace(place),
      __place: place,
    });
    const revisionId = `${place.id}:r1`;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `INSERT INTO business_entities
          (id, legal_name, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [
          place.businessId,
          place.name,
          place.name,
          new Date(now),
          new Date(now),
        ],
      );
      await connection.execute(
        `INSERT IGNORE INTO business_destinations
          (business_id, destination_id, created_at)
         VALUES (?, ?, ?)`,
        [place.businessId, place.destinationId, new Date(now)],
      );
      await connection.execute(
        `INSERT INTO business_places
          (place_id, business_id, destination_id, category_id, publication_state,
           editable_revision, editable_revision_id, editable_place_json,
           editable_revision_json, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?, ?)`,
        [
          place.id,
          place.businessId,
          place.destinationId,
          place.categoryId,
          revisionId,
          JSON.stringify(place),
          JSON.stringify(data),
          actor?.subject ?? "platform",
          new Date(now),
          new Date(now),
        ],
      );
      await connection.execute(
        `INSERT INTO business_place_revision_history
          (place_id, revision, revision_id, revision_json, actor_id, created_at)
         VALUES (?, 1, ?, ?, ?, ?)`,
        [
          place.id,
          revisionId,
          JSON.stringify(data),
          actor?.subject ?? "platform",
          new Date(now),
        ],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return { businessId: String(place.businessId), placeId: String(place.id) };
  }

  async function updateProfile(actor, businessId, input) {
    assertReady();
    const [rows] = await pool.execute(
      `SELECT * FROM business_places WHERE business_id = ? ORDER BY created_at ASC LIMIT 1`,
      [businessId],
    );
    const row = rows[0];
    if (!row) throw new Error("PLACE_NOT_FOUND");
    const place = placeFromRow(row, false);
    const nextPlace = mergeProfile(place, input, new Date().toISOString());
    const current = governedRecordFromRow(row);
    const data = Object.freeze({
      ...governedDataFromPlace(nextPlace),
      __place: nextPlace,
    });
    return publicationService.saveRevision(
      {
        session: actor,
        correlationId: "control-center",
        now: nextPlace.updatedAt,
      },
      current.placeId,
      data,
      current.editableRevision.revision,
    );
  }

  async function updateLocation(actor, businessId, input) {
    assertReady();
    const [rows] = await pool.execute(
      `SELECT * FROM business_places WHERE business_id = ? ORDER BY created_at ASC LIMIT 1`,
      [businessId],
    );
    const row = rows[0];
    if (!row) throw new Error("PLACE_NOT_FOUND");
    const current = governedRecordFromRow(row);
    const nextPlace = mergeLocation(
      placeFromRow(row, false),
      input,
      actor,
      new Date().toISOString(),
    );
    const data = Object.freeze({
      ...governedDataFromPlace(nextPlace),
      __place: nextPlace,
    });
    return publicationService.saveRevision(
      {
        session: actor,
        correlationId: "control-center",
        now: nextPlace.updatedAt,
      },
      current.placeId,
      data,
      current.editableRevision.revision,
    );
  }

  async function transitionPublication(
    actor,
    businessId,
    action,
    expectedRevision,
  ) {
    assertReady();
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error("INVALID_EXPECTED_REVISION");
    }
    const [rows] = await pool.execute(
      `SELECT * FROM business_places WHERE business_id = ? ORDER BY created_at ASC LIMIT 1`,
      [businessId],
    );
    const row = rows[0];
    if (!row) throw new Error("PLACE_NOT_FOUND");
    const record = governedRecordFromRow(row);
    if (record.editableRevision.revision !== expectedRevision) {
      throw new Error("PLACE_PUBLICATION_STALE_REVISION");
    }
    const context = {
      session: actor,
      correlationId: "control-center",
      now: new Date().toISOString(),
    };
    if (action === "review") {
      return publicationService.requestReview(
        context,
        record.placeId,
        expectedRevision,
      );
    }
    if (action === "publish") {
      await catalogRuntime.capturePublicationSnapshot({
        businessId: String(row.business_id),
        placeId: String(record.placeId),
        placeRevision: expectedRevision,
      });
      return publicationService.publish(
        context,
        record.placeId,
        expectedRevision,
      );
    }
    throw new Error("INVALID_PUBLICATION_ACTION");
  }

  return Object.freeze({
    start,
    stop,
    readinessCheck,
    handlePublic,
    listCms,
    getCmsDetail,
    createDraft,
    updateProfile,
    updateLocation,
    createCatalogDraft,
    updateCatalogEntry,
    transitionPublication,
  });
}
