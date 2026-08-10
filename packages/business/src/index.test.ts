import { normalizeAuthSessionIdentity } from "@touristic/auth";
import { describe, expect, it, vi } from "vitest";

import {
  createAuthorizedBusinessProfileService,
  createBusinessProfileService,
  normalizeBusinessId,
  normalizeBusinessProfile,
  type BusinessProfile,
  type BusinessProfileRepository,
} from "./index.js";

function session(
  role: "owner" | "manager" | "viewer" | "admin",
  businessIds: readonly string[] = ["toca"],
) {
  const value = normalizeAuthSessionIdentity({
    subject: `${role}-user`,
    email: `${role}@example.com`,
    role,
    businessIds,
    issuedAt: 1_700_000_000,
    expiresAt: 4_000_000_000,
    sessionId: `${role}-session`,
  });
  if (!value) throw new Error("TEST_SESSION_INVALID");
  return value;
}

describe("normalizeBusinessId", () => {
  it("normalizes a tenant key without trusting display text", () => {
    expect(normalizeBusinessId("  Toca do Morcego / Morro  ")).toBe(
      "toca-do-morcego-morro",
    );
    expect(normalizeBusinessId("<> ")).toBe("");
  });
});

describe("normalizeBusinessProfile", () => {
  it("preserves the V1 profile defaults and strips angle-bracket markup", () => {
    const profile = normalizeBusinessProfile({
      id: "toca",
      name: "<b>Toca</b>",
      promotion: { title: "<script>Oferta</script>" },
    });

    expect(profile).toMatchObject({
      id: "toca",
      name: "bToca/b",
      categoryLabel: "Negócio local",
      specialty: "Experiência local",
      cta: "Ver empresa",
      locationLabel: "Morro de São Paulo",
      tutorial: false,
      excludeFromBusinessMetrics: false,
    });
    expect(profile.promotion).toMatchObject({
      title: "scriptOferta/script",
      cta: "Ver oferta",
    });
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.promotion)).toBe(true);
  });

  it("does not stringify untrusted objects into profile text", () => {
    const profile = normalizeBusinessProfile({
      name: { injected: true },
    });
    expect(profile.name).toBe("Negócio local");
  });
});

describe("createBusinessProfileService", () => {
  it("scopes repository reads and writes to a normalized business ID", async () => {
    const getProfile = vi.fn<BusinessProfileRepository["getProfile"]>(
      async () => normalizeBusinessProfile({ id: "toca", name: "Toca" }),
    );
    const saveProfile = vi.fn<BusinessProfileRepository["saveProfile"]>(
      async (_businessId: string, profile: BusinessProfile) => profile,
    );
    const repository: BusinessProfileRepository = { getProfile, saveProfile };
    const service = createBusinessProfileService(repository);

    await expect(service.getProfile(" TOCA ")).resolves.toMatchObject({
      name: "Toca",
    });
    await expect(
      service.saveProfile(" TOCA ", { name: "Toca atualizada" }),
    ).resolves.toMatchObject({ name: "Toca atualizada", id: "toca" });

    expect(getProfile).toHaveBeenCalledWith("toca");
    expect(saveProfile).toHaveBeenCalledWith(
      "toca",
      expect.objectContaining({ id: "toca", name: "Toca atualizada" }),
    );
  });

  it("fails closed when a write has no valid tenant ID", async () => {
    const repository: BusinessProfileRepository = {
      getProfile: vi.fn<BusinessProfileRepository["getProfile"]>(
        async () => null,
      ),
      saveProfile: vi.fn<BusinessProfileRepository["saveProfile"]>(
        async (_businessId: string, profile: BusinessProfile) => profile,
      ),
    };
    const service = createBusinessProfileService(repository);

    await expect(service.saveProfile("<> ", {})).rejects.toThrow(
      "INVALID_BUSINESS_ID",
    );
  });
});

describe("createAuthorizedBusinessProfileService", () => {
  function repository(): BusinessProfileRepository {
    return {
      getProfile: vi.fn<BusinessProfileRepository["getProfile"]>(async (id) =>
        normalizeBusinessProfile({ id, name: "Toca" }, id),
      ),
      saveProfile: vi.fn<BusinessProfileRepository["saveProfile"]>(
        async (_businessId, profile) => profile,
      ),
    };
  }

  it("allows an authenticated scoped owner to read and mutate its tenant", async () => {
    const store = repository();
    const service = createAuthorizedBusinessProfileService(store);
    const owner = session("owner", ["toca"]);

    await expect(service.getProfile(owner, " TOCA ")).resolves.toMatchObject({
      id: "toca",
    });
    await expect(
      service.saveProfile(owner, "toca", { name: "Toca atualizada" }),
    ).resolves.toMatchObject({ id: "toca", name: "Toca atualizada" });
  });

  it("rejects missing sessions and cross-tenant access", async () => {
    const service = createAuthorizedBusinessProfileService(repository());

    await expect(service.getProfile(null, "toca")).rejects.toThrow(
      "BUSINESS_AUTH_AUTHENTICATION_REQUIRED",
    );
    await expect(
      service.getProfile(session("manager", ["empresa-a"]), "empresa-b"),
    ).rejects.toThrow("BUSINESS_AUTH_BUSINESS_ACCESS_DENIED");
  });

  it("keeps viewer access read-only", async () => {
    const service = createAuthorizedBusinessProfileService(repository());
    const viewer = session("viewer", ["toca"]);

    await expect(service.getProfile(viewer, "toca")).resolves.toMatchObject({
      id: "toca",
    });
    await expect(
      service.saveProfile(viewer, "toca", { name: "Bloqueado" }),
    ).rejects.toThrow("BUSINESS_AUTH_READ_ONLY_ROLE");
  });

  it("preserves admin tenant bypass through the Auth policy", async () => {
    const service = createAuthorizedBusinessProfileService(repository());
    const admin = session("admin", []);

    await expect(
      service.saveProfile(admin, "qualquer-negocio", { name: "Admin" }),
    ).resolves.toMatchObject({ id: "qualquer-negocio", name: "Admin" });
  });
});
