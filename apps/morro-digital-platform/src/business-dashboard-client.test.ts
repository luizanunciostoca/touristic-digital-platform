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

  it("does not trust an out-of-scope requested business id for non-admin sessions", async () => {
    const fixture = authFixture(session(), [profileResponse()]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const result = await client.bootstrap("outra-empresa");

    expect(result.businessId).toBe("toca-do-morcego");
  });

  it("lets admin sessions select an explicit normalized business id", async () => {
    const fixture = authFixture(session("admin", []), [profileResponse()]);
    const client = createBusinessDashboardClient(fixture.authClient);

    const result = await client.bootstrap(" Toca do Morcego ");

    expect(result.businessId).toBe("toca-do-morcego");
  });

  it("saves profile mutations only through the Auth secureFetch port", async () => {
    const fixture = authFixture(session(), [profileResponse("Toca Atualizada")]);
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

  it("fails closed when no authenticated Business scope can be selected", async () => {
    const fixture = authFixture(session("owner", []), []);
    const client = createBusinessDashboardClient(fixture.authClient);

    await expect(client.bootstrap()).rejects.toThrow("BUSINESS_SCOPE_REQUIRED");
    expect(fixture.secureFetch).not.toHaveBeenCalled();
  });
});
