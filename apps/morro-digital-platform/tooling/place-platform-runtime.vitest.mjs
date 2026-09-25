import { describe, expect, it, vi } from "vitest";

import { createPlacePlatformRuntime } from "./place-platform-runtime.mjs";

function fixture({ row = null, duplicate = false, publishedRow = null } = {}) {
  const executed = [];
  const transaction = { committed: false, rolledBack: false };
  const execute = vi.fn(async (sql, params = []) => {
    if (
      sql.includes("SELECT place_id, business_id, published_revision") &&
      sql.includes("publication_state = 'published'")
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
    query: vi.fn(async () => {}),
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
});
