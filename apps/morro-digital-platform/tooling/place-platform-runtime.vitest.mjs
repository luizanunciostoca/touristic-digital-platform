import { describe, expect, it, vi } from "vitest";

import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

function fixture({
  row = null,
  duplicate = false,
  publishedRow = null,
  publishedRows = [],
} = {}) {
  const executed = [];
  const transaction = { committed: false, rolledBack: false };
  const execute = vi.fn(async (sql, params = []) => {
    if (
      sql.includes("SELECT place_id, business_id, published_revision") &&
      sql.includes("publication_state NOT IN ('suspended', 'archived')")
    ) {
      return [[]];
    }
    executed.push({ sql, params });
    if (sql.includes("INSERT INTO business_entities") && duplicate) {
      throw new Error("ER_DUP_ENTRY");
    }
    if (sql.includes("FROM business_places WHERE business_id")) {
      return [row ? [row] : []];
    }
    if (
      sql.includes("WHERE destination_id = ?") &&
      sql.includes("published_revision IS NOT NULL") &&
      sql.includes("LIMIT 500")
    ) {
      return [publishedRows];
    }
    if (
      sql.includes("SELECT * FROM business_places WHERE place_id = ? LIMIT 1")
    ) {
      return [row ? [row] : []];
    }
    if (
      sql.includes(
        "SET publication_state = ?, updated_at = CURRENT_TIMESTAMP(3)",
      ) &&
      row
    ) {
      row.publication_state = params[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("WHERE place_id = ? AND published_revision IS NOT NULL")) {
      return [publishedRow ? [publishedRow] : []];
    }
    if (sql.includes("FROM business_entities b")) return [[]];
    if (sql.includes("FROM business_place_revision_history")) return [[]];
    return [{ affectedRows: 1 }];
  });
  const connection = {
    execute,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {
      transaction.committed = true;
    }),
    rollback: vi.fn(async () => {
      transaction.rolledBack = true;
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (sql) => {
      if (
        String(sql).includes("information_schema.COLUMNS") &&
        String(sql).includes("profile_json")
      ) {
        return [[{ column_name: "profile_json" }]];
      }
      return [{ affectedRows: 1 }];
    }),
    execute,
    getConnection: vi.fn(async () => connection),
    end: vi.fn(async () => {}),
  };
  const runtime = createPlacePlatformRuntime({
    poolFactory: () => pool,
    getEnvironmentValue: (key) =>
      key === "BUSINESS_DATABASE_URL" ? "mysql://fixture" : "",
  });
  return { runtime, executed, transaction, connection };
}

const actor = { subject: "platform-admin", role: "PLATFORM_ADMIN" };
const draft = {
  businessId: "business-a",
  name: "Empresa A",
  categoryId: "attractions",
  destinationId: "morro-de-sao-paulo",
};

describe("Business CMS persisted runtime invariants", () => {
  it("rejects a duplicate Business atomically without renaming the existing owner", async () => {
    const { runtime, executed, transaction, connection } = fixture({
      duplicate: true,
    });
    expect(await runtime.start()).toBe(true);
    await expect(runtime.createDraft(actor, draft)).rejects.toThrow(
      "ER_DUP_ENTRY",
    );
    expect(transaction.rolledBack).toBe(true);
    expect(transaction.committed).toBe(false);
    expect(connection.release).toHaveBeenCalledOnce();
    expect(executed[0].sql).not.toContain("ON DUPLICATE KEY UPDATE");
    expect(executed).toHaveLength(1);
    await runtime.stop();
  });

  it("rejects an empty location instead of silently turning it into 0,0", async () => {
    const place = {
      id: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      categoryId: "attractions",
      name: "Empresa A",
      location: { latitude: null, longitude: null },
      capabilities: { enabled: ["directions"] },
    };
    const row = {
      place_id: place.id,
      business_id: place.businessId,
      destination_id: place.destinationId,
      publication_state: "draft",
      editable_place_json: JSON.stringify(place),
      editable_revision: 1,
      editable_revision_id: `${place.id}:r1`,
      editable_revision_json: JSON.stringify({
        placeId: place.id,
        businessId: place.businessId,
        destinationId: place.destinationId,
      }),
      updated_at: new Date(),
      updated_by: "platform-admin",
    };
    const { runtime, executed } = fixture({ row });
    expect(await runtime.start()).toBe(true);
    await expect(
      runtime.updateLocation(actor, "business-a", {
        latitude: "",
        longitude: "",
      }),
    ).rejects.toThrow("INVALID_PLACE_LOCATION");
    expect(executed).toHaveLength(1);
    await runtime.stop();
  });

  it("refuses to publish a revision newer than the one the operator reviewed", async () => {
    const row = {
      place_id: "place-business-a",
      business_id: "business-a",
      destination_id: "morro-de-sao-paulo",
      publication_state: "review",
      editable_revision: 3,
      editable_revision_id: "place-business-a:r3",
      editable_revision_json: JSON.stringify({
        placeId: "place-business-a",
        businessId: "business-a",
        destinationId: "morro-de-sao-paulo",
      }),
      updated_at: new Date(),
      updated_by: "platform-admin",
    };
    const { runtime, executed } = fixture({ row });
    expect(await runtime.start()).toBe(true);
    await expect(
      runtime.transitionPublication(actor, "business-a", "publish", 2),
    ).rejects.toThrow("PLACE_PUBLICATION_STALE_REVISION");
    expect(executed).toHaveLength(1);
    await runtime.stop();
  });

  it("suspends an exact published revision through the persisted runtime", async () => {
    const place = {
      id: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      categoryId: "attractions",
      name: "Empresa A",
      description: "Publicado",
      location: { latitude: -13.38, longitude: -38.91 },
      capabilities: { enabled: ["directions"] },
      visibility: "public",
    };
    const row = {
      place_id: place.id,
      business_id: place.businessId,
      destination_id: place.destinationId,
      publication_state: "published",
      editable_place_json: JSON.stringify(place),
      editable_revision: 2,
      editable_revision_id: `${place.id}:r2`,
      editable_revision_json: JSON.stringify({
        placeId: place.id,
        businessId: place.businessId,
        destinationId: place.destinationId,
        name: place.name,
        categoryId: place.categoryId,
        description: place.description,
        location: place.location,
        capabilities: place.capabilities,
        visibility: place.visibility,
      }),
      published_place_json: JSON.stringify(place),
      published_revision: 2,
      published_revision_id: `${place.id}:r2`,
      published_revision_json: JSON.stringify({
        placeId: place.id,
        businessId: place.businessId,
        destinationId: place.destinationId,
      }),
      updated_at: new Date(),
      updated_by: "platform-admin",
    };
    const { runtime, executed } = fixture({ row });
    expect(await runtime.start()).toBe(true);
    const now = Math.floor(Date.now() / 1000);
    const activeActor = {
      subject: "platform-admin",
      email: "platform-admin@example.invalid",
      role: "PLATFORM_ADMIN",
      businessIds: [],
      issuedAt: now - 60,
      expiresAt: now + 3600,
      sessionId: "place-suspend-test",
    };

    await expect(
      runtime.transitionPublication(activeActor, "business-a", "suspend", 2),
    ).resolves.toMatchObject({
      publicationState: "suspended",
      publishedRevision: { revision: 2 },
    });

    expect(
      executed.some(
        ({ sql, params }) =>
          sql.includes(
            "SET publication_state = ?, updated_at = CURRENT_TIMESTAMP(3)",
          ) &&
          params[0] === "suspended" &&
          params[1] === "place-business-a" &&
          params[2] === 2,
      ),
    ).toBe(true);
    await runtime.stop();
  });

  it("restricts location filters to meaningful states using canonical Place data", async () => {
    const { runtime, executed } = fixture();
    expect(await runtime.start()).toBe(true);
    const url = new URL(
      "http://localhost/api/admin/v1/businesses/cms?locationStatus=confirmed",
    );
    const result = await runtime.listCms(url);
    expect(result.filters.locationStatus).toBe("confirmed");
    expect(executed[0].sql).toContain("JSON_EXTRACT(p.editable_place_json");
    await expect(
      runtime.listCms(
        new URL(
          "http://localhost/api/admin/v1/businesses/cms?locationStatus=bogus",
        ),
      ),
    ).rejects.toThrow("INVALID_LOCATION_STATUS");
    expect(executed).toHaveLength(1);
    await runtime.stop();
  });

  it("serves the approved Place revision while a newer edit remains draft", async () => {
    const published = {
      id: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      name: "Nome aprovado",
      slug: "nome-aprovado",
      categoryId: "attractions",
      subcategoryIds: [],
      shortDescription: "Publicado",
      description: "Descrição pública",
      location: {
        latitude: -13.38,
        longitude: -38.91,
        address: "Morro de São Paulo",
        area: "Centro",
      },
      contact: {},
      openingHours: null,
      amenities: [],
      tags: [],
      capabilities: { enabled: ["directions"] },
      visibility: "public",
    };
    const publishedRow = {
      place_id: published.id,
      publication_state: "draft",
      published_revision: 2,
      published_revision_id: `${published.id}:r2`,
      published_place_json: JSON.stringify(published),
      published_revision_json: JSON.stringify({ name: published.name }),
      editable_place_json: JSON.stringify({ ...published, name: "Novo draft" }),
      updated_at: new Date(),
      updated_by: "platform-admin",
    };
    const { runtime, executed } = fixture({ publishedRow });
    expect(await runtime.start()).toBe(true);
    const response = {
      statusCode: 0,
      setHeader() {},
      end(body) {
        this.body = body;
      },
    };
    const url = new URL(`http://localhost/api/places/v1/${published.id}`);
    expect(
      await runtime.handlePublic({ method: "GET", headers: {} }, response, url),
    ).toBe(true);
    expect(response.statusCode).toBe(200);
    const detail = JSON.parse(response.body);
    expect(detail.profile.name).toBe("Nome aprovado");
    expect(detail.revision.number).toBe(2);
    expect(response.body).not.toContain("Novo draft");
    expect(executed[0].sql).toContain("published_revision IS NOT NULL");
    expect(executed[0].sql).toContain("publication_state NOT IN");
    await runtime.stop();
  });

  it("exposes only the current business editable Place plus published destination peers for discovery", async () => {
    const own = {
      id: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      name: "Empresa A",
      categoryId: "attractions",
      location: {
        latitude: -13.38,
        longitude: -38.91,
        address: "Centro",
        area: "Centro",
        source: "manual",
      },
      capabilities: { enabled: ["directions"] },
      visibility: "public",
    };
    const other = {
      ...own,
      id: "place-business-b",
      businessId: "business-b",
      name: "Empresa B",
    };
    const row = {
      place_id: own.id,
      business_id: own.businessId,
      destination_id: own.destinationId,
      publication_state: "draft",
      editable_place_json: JSON.stringify(own),
      editable_revision: 2,
      editable_revision_id: own.id + ":r2",
      editable_revision_json: JSON.stringify({ placeId: own.id }),
      updated_at: new Date(),
      updated_by: "owner-a",
      created_at: new Date(),
    };
    const publishedRows = [
      {
        ...row,
        place_id: own.id,
        published_revision: 1,
        published_revision_id: own.id + ":r1",
        published_place_json: JSON.stringify(own),
        published_revision_json: JSON.stringify({ placeId: own.id }),
      },
      {
        ...row,
        place_id: other.id,
        business_id: other.businessId,
        published_revision: 1,
        published_revision_id: other.id + ":r1",
        published_place_json: JSON.stringify(other),
        published_revision_json: JSON.stringify({ placeId: other.id }),
      },
    ];
    const { runtime } = fixture({ row, publishedRows });
    expect(await runtime.start()).toBe(true);

    const places = await runtime.listLocationDiscoveryPlaces(
      "business-a",
      "morro-de-sao-paulo",
    );

    expect(places.map((entry) => entry.id)).toEqual([
      "place-business-a",
      "place-business-b",
    ]);
    await expect(
      runtime.listLocationDiscoveryPlaces("business-a", "itacare"),
    ).rejects.toThrow("CROSS_DESTINATION_LOCATION_READ");
    await runtime.stop();
  });

  it("persists confirmed provider metadata in the editable Place revision", async () => {
    const place = {
      id: "place-business-a",
      businessId: "business-a",
      destinationId: "morro-de-sao-paulo",
      categoryId: "attractions",
      name: "Empresa A",
      location: {
        latitude: -13.38,
        longitude: -38.91,
        address: "Centro",
        area: "Centro",
        source: "manual",
        externalProvider: null,
        externalPlaceId: null,
      },
      capabilities: { enabled: ["directions"] },
      contact: {
        phone: null,
        whatsapp: null,
        email: null,
        website: null,
      },
      openingHours: null,
      visibility: "public",
    };
    const row = {
      place_id: place.id,
      business_id: place.businessId,
      destination_id: place.destinationId,
      publication_state: "draft",
      editable_place_json: JSON.stringify(place),
      editable_revision: 1,
      editable_revision_id: place.id + ":r1",
      editable_revision_json: JSON.stringify({
        placeId: place.id,
        businessId: place.businessId,
        destinationId: place.destinationId,
      }),
      updated_at: new Date(),
      updated_by: "owner-a",
      created_at: new Date(),
    };
    const { runtime, executed } = fixture({ row });
    expect(await runtime.start()).toBe(true);

    const now = Math.floor(Date.now() / 1000);
    await runtime.updateLocation(
      {
        subject: "owner-a",
        email: "owner-a@example.invalid",
        role: "BUSINESS_OWNER",
        businessIds: ["business-a"],
        issuedAt: now - 60,
        expiresAt: now + 3600,
        sessionId: "location-provider-metadata-test",
      },
      "business-a",
      {
        latitude: -13.3766,
        longitude: -38.9172,
        address: "Morro de São Paulo",
        area: "Centro",
        source: "mapbox",
        externalProvider: "mapbox",
        externalPlaceId: "mbx.toca",
      },
    );

    const revisionWrite = executed.find(({ sql }) =>
      sql.includes("editable_place_json = ?"),
    );
    expect(revisionWrite).toBeTruthy();
    const editablePlace = JSON.parse(revisionWrite.params[4]);
    expect(editablePlace.location).toMatchObject({
      source: "mapbox",
      externalProvider: "mapbox",
      externalPlaceId: "mbx.toca",
    });
    await runtime.stop();
  });
});
