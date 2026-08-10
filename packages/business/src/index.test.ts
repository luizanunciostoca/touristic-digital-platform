import { describe, expect, it, vi } from "vitest";

import {
  createBusinessProfileService,
  normalizeBusinessId,
  normalizeBusinessProfile,
  type BusinessProfile,
  type BusinessProfileRepository,
} from "./index.js";

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
    const getProfile = vi.fn<BusinessProfileRepository["getProfile"]>(async () =>
      normalizeBusinessProfile({ id: "toca", name: "Toca" }),
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
      getProfile: vi.fn<BusinessProfileRepository["getProfile"]>(async () => null),
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
