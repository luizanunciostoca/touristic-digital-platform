import { describe, expect, it, vi } from "vitest";

import type {
  DashboardAuthClient,
  DashboardSessionResponse,
} from "@touristic/auth-browser";

import { createBusinessDashboardClient } from "./business-dashboard-client.js";

function session(
  role: DashboardSessionResponse["user"]["role"] = "owner",
  businessIds: readonly string[] = ["toca-do-morcego"],
): DashboardSessionResponse {
  return {
    authenticated: true,
    csrfToken: "csrf-1",
    user: {
      id: "user-1",
      email: "owner@example.com",
      role,
      businessIds,
    },
  };
}

function authFixture(
  sessionValue: DashboardSessionResponse | null,
  responses: Response[],
) {
  const secureFetch = vi.fn<DashboardAuthClient["secureFetch"]>();
  for (const response of responses) secureFetch.mockResolvedValueOnce(response);
  const authClient: DashboardAuthClient = {
    login: vi.fn().mockRejectedValue(new Error("NOT_USED_IN_DASHBOARD_CLIENT")),
    getSession: vi.fn().mockResolvedValue(sessionValue),
    secureFetch,
    logout: vi.fn().mockResolvedValue(true),
  };
  return { authClient, secureFetch };
}

function profileResponse(name = "Toca do Morcego") {
  return new Response(
    JSON.stringify({
      profile: {
        id: "toca-do-morcego",
        name,
        categoryLabel: "Experiência",
        specialty: "Sunset",
        description: "Experiência local",
        cta: "Ver empresa",
        locationLabel: "Morro de São Paulo",
        locationIsExample: false,
        promotion: null,
        tutorial: false,
        excludeFromBusinessMetrics: false,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("M51 Business dashboard browser client", () => {
  it("bootstraps the first authenticated Business scope and loads its profile", async () => {
    const fixture = authFixture(session(), [profileResponse()]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const result = await client.bootstrap();

    expect(result.businessId).toBe("toca-do-morcego");
    expect(result.profile?.name).toBe("Toca do Morcego");
    expect(fixture.secureFetch).toHaveBeenCalledWith(
      "/api/business/toca-do-morcego/profile",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("fails closed for an explicitly requested business outside the session scope", async () => {
    const fixture = authFixture(session(), []);
    const client = createBusinessDashboardClient(fixture.authClient);

    await expect(client.bootstrap("outra-empresa")).rejects.toThrow(
      "BUSINESS_ACCESS_DENIED",
    );
    expect(fixture.secureFetch).not.toHaveBeenCalled();
  });

  it("does not let a platform role bypass explicit Morro Pro businessIds", async () => {
    const fixture = authFixture(session("admin", []), []);
    const client = createBusinessDashboardClient(fixture.authClient);

    await expect(client.bootstrap("toca-do-morcego")).rejects.toThrow(
      "MORRO_PRO_ROLE_DENIED",
    );
    expect(fixture.secureFetch).not.toHaveBeenCalled();
  });

  it("saves profile mutations only through the Auth secureFetch port", async () => {
    const fixture = authFixture(session(), [
      profileResponse("Toca Atualizada"),
    ]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const result = await client.saveProfile("toca-do-morcego", {
      name: "Toca Atualizada",
    });

    expect(result.name).toBe("Toca Atualizada");
    expect(fixture.secureFetch).toHaveBeenCalledWith(
      "/api/business/toca-do-morcego/profile",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Toca Atualizada" }),
      }),
    );
  });

  it("reads and mutates canonical Media through the Business tenant namespace", async () => {
    const fixture = authFixture(session(), [
      new Response(
        JSON.stringify({
          count: 1,
          storageAvailable: true,
          assets: [
            { mediaId: "media-1", role: "cover", asset: { id: "media-1" } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
      new Response(JSON.stringify({ data: { mediaId: "media-2" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify({ data: { mediaId: "media-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify({ data: { deleted: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const media = await client.loadMedia("toca-do-morcego");
    await client.uploadMedia("toca-do-morcego", {
      fileName: "cover.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      alt: "Capa",
      role: "cover",
      published: true,
      dataBase64: "AA==",
    });
    await client.updateMedia("toca-do-morcego", "media-1", { role: "gallery" });
    await client.reorderMedia("toca-do-morcego", ["media-1"]);
    await client.deleteMedia("toca-do-morcego", "media-1");

    expect(media.count).toBe(1);
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      1,
      "/api/business/toca-do-morcego/media",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      2,
      "/api/business/toca-do-morcego/media",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      3,
      "/api/business/toca-do-morcego/media/media-1",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      4,
      "/api/business/toca-do-morcego/media/order",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      5,
      "/api/business/toca-do-morcego/media/media-1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("reads the canonical Catalog through the Business tenant namespace", async () => {
    const fixture = authFixture(session(), [
      new Response(
        JSON.stringify({
          products: [{ id: "product-1", name: "Sunset" }],
          offers: [],
          menus: [],
          categories: [],
          items: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    ]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const catalog = await client.loadCatalog("toca-do-morcego");

    expect(catalog.products[0]?.id).toBe("product-1");
    expect(fixture.secureFetch).toHaveBeenCalledWith(
      "/api/business/toca-do-morcego/catalog",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("creates and updates canonical Catalog entries without productReference identity", async () => {
    const fixture = authFixture(session(), [
      new Response(JSON.stringify({ data: { id: "product-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
      new Response(JSON.stringify({ data: { id: "product-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    const client = createBusinessDashboardClient(fixture.authClient);

    await client.createCatalogEntry("toca-do-morcego", "product", {
      name: "Sunset",
      status: "draft",
    });
    await client.updateCatalogEntry("toca-do-morcego", "product", "product-1", {
      status: "active",
    });

    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      1,
      "/api/business/toca-do-morcego/catalog/product",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Sunset", status: "draft" }),
      }),
    );
    expect(fixture.secureFetch).toHaveBeenNthCalledWith(
      2,
      "/api/business/toca-do-morcego/catalog/product/product-1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ status: "active" }),
      }),
    );
    expect(
      fixture.secureFetch.mock.calls.some(([, init]) =>
        typeof init?.body === "string"
          ? init.body.includes("productReference")
          : false,
      ),
    ).toBe(false);
  });

  it("fails closed when no authenticated Business scope can be selected", async () => {
    const fixture = authFixture(session("owner", []), []);
    const client = createBusinessDashboardClient(fixture.authClient);

    await expect(client.bootstrap()).rejects.toThrow("BUSINESS_SCOPE_REQUIRED");
    expect(fixture.secureFetch).not.toHaveBeenCalled();
  });
});
