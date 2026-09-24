import { normalizeAuthSessionIdentity } from "@touristic/auth";
import { describe, expect, it, vi } from "vitest";

import {
  createPlacePublicationService,
  publicPlaceProjection,
  validatePlaceForPublication,
  type GovernedPlaceRecord,
  type GovernedPlaceRevisionData,
  type PlacePublicationAuditPort,
  type PlacePublicationCatalog,
  type PlacePublicationRepository,
} from "./place-publication-governance.js";

function identity(
  role:
    | "PLATFORM_OWNER"
    | "PLATFORM_ADMIN"
    | "BUSINESS_OWNER"
    | "BUSINESS_MANAGER"
    | "BUSINESS_VIEWER",
  businessIds: readonly string[] = role.startsWith("PLATFORM_")
    ? []
    : ["business-a"],
) {
  const value = normalizeAuthSessionIdentity({
    subject: role.toLowerCase(),
    email: `${role.toLowerCase()}@example.com`,
    role,
    businessIds,
    issuedAt: 1_700_000_000,
    expiresAt: 4_000_000_000,
    sessionId: `${role}-session`,
  });
  if (!value) throw new Error("TEST_IDENTITY_INVALID");
  return value;
}

function data(
  overrides: Partial<GovernedPlaceRevisionData> = {},
): GovernedPlaceRevisionData {
  return Object.freeze({
    placeId: "place-a",
    businessId: "business-a",
    destinationId: "morro-de-sao-paulo",
    name: "Toca",
    categoryId: "nightlife",
    description: "Experiência local",
    location: Object.freeze({ latitude: -13.377, longitude: -38.917 }),
    capabilities: Object.freeze({ enabled: Object.freeze(["photos"]) }),
    visibility: "public" as const,
    coverMediaId: "media-cover",
    mediaIds: Object.freeze(["media-cover"]),
    openingHoursPresent: true,
    contactPresent: true,
    ...overrides,
  });
}

function record(
  state: GovernedPlaceRecord["publicationState"] = "draft",
  revisionData = data(),
): GovernedPlaceRecord {
  return Object.freeze({
    placeId: "place-a",
    businessId: "business-a",
    destinationId: "morro-de-sao-paulo",
    publicationState: state,
    publishedRevision:
      state === "published"
        ? Object.freeze({
          id: "place-a:r1",
          revision: 1,
          expectedPreviousRevision: 0,
          data: revisionData,
          createdAt: "2026-09-24T20:00:00.000Z",
          createdBy: "platform_admin",
          })
        : null,
    editableRevision: Object.freeze({
      id: "place-a:r1",
      revision: 1,
      expectedPreviousRevision: 0,
      data: revisionData,
      createdAt: "2026-09-24T20:00:00.000Z",
      createdBy: "business_owner",
    }),
    updatedAt: "2026-09-24T20:00:00.000Z",
  });
}

function harness(initial = record()) {
  let current = initial;
  const audits: unknown[] = [];
  const get = vi.fn<PlacePublicationRepository["get"]>(
    async (placeId) => (placeId === current.placeId ? current : null),
  );
  const saveDraft = vi.fn<PlacePublicationRepository["saveDraft"]>(
    async (next, expectedRevision) => {
      if (current.editableRevision.revision !== expectedRevision) {
        throw new Error("PLACE_PUBLICATION_STALE_REVISION");
      }
      current = next;
      return current;
    },
  );
  const publishAtomically = vi.fn<
    PlacePublicationRepository["publishAtomically"]
  >(async ({ next, expectedRevision }) => {
    if (current.editableRevision.revision !== expectedRevision) {
      throw new Error("PLACE_PUBLICATION_STALE_REVISION");
    }
    current = next;
    return current;
  });
  const setState = vi.fn<PlacePublicationRepository["setState"]>(
    async (_placeId, state, expectedRevision) => {
      if (current.editableRevision.revision !== expectedRevision) {
        throw new Error("PLACE_PUBLICATION_STALE_REVISION");
      }
      current = Object.freeze({ ...current, publicationState: state });
      return current;
    },
  );
  const repository: PlacePublicationRepository = {
    get,
    saveDraft,
    publishAtomically,
    setState,
  };
  const catalog: PlacePublicationCatalog = {
    hasActiveCategory: vi.fn<PlacePublicationCatalog["hasActiveCategory"]>(
      async (categoryId) => categoryId === "nightlife",
    ),
    mediaBelongsToBusiness: vi.fn<
      PlacePublicationCatalog["mediaBelongsToBusiness"]
    >(
      async (businessId, mediaId) =>
        businessId === "business-a" && mediaId.startsWith("media-"),
    ),
    capabilityIsSupported: vi.fn<
      PlacePublicationCatalog["capabilityIsSupported"]
    >(
      async (categoryId, capability) =>
        categoryId === "nightlife" &&
        ["photos", "menu"].includes(capability),
    ),
  };
  const audit: PlacePublicationAuditPort = {
    record: vi.fn<PlacePublicationAuditPort["record"]>(async (event) => {
      audits.push(event);
    }),
  };
  return {
    repository,
    catalog,
    audit,
    audits,
    service: createPlacePublicationService(repository, catalog, audit),
    current: () => current,
  };
}

const context = (role: Parameters<typeof identity>[0]) => ({
  session: identity(role),
  correlationId: "corr-123",
  now: "2026-09-24T21:00:00.000Z",
});

describe("validatePlaceForPublication", () => {
  it("keeps recommendations non-blocking and required fields explicit", () => {
    const issues = validatePlaceForPublication(
      data({
        description: "",
        coverMediaId: null,
        openingHoursPresent: false,
        contactPresent: false,
      }),
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DESCRIPTION_REQUIRED",
          severity: "required",
        }),
        expect.objectContaining({
          code: "COVER_RECOMMENDED",
          severity: "recommended",
        }),
        expect.objectContaining({
          code: "HOURS_RECOMMENDED",
          severity: "recommended",
        }),
        expect.objectContaining({
          code: "CONTACT_RECOMMENDED",
          severity: "recommended",
        }),
      ]),
    );
  });

  it("rejects invalid or missing coordinates as a required publication issue", () => {
    expect(
      validatePlaceForPublication(
        data({
          location: { latitude: 91, longitude: -38 },
        }),
      ),
    ).toContainEqual({
      code: "VALID_COORDINATES_REQUIRED",
      field: "location",
      severity: "required",
    });
  });
});

describe("place publication governance", () => {
  it("rejects cross-business mutation", async () => {
    const h = harness();
    await expect(
      h.service.saveRevision(
        context("BUSINESS_OWNER"),
        "place-a",
        data({ businessId: "business-b" }),
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_CROSS_BUSINESS_MUTATION");
  });

  it("rejects cross-destination mutation", async () => {
    const h = harness();
    await expect(
      h.service.saveRevision(
        context("BUSINESS_OWNER"),
        "place-a",
        data({ destinationId: "itacare" }),
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_CROSS_DESTINATION_MUTATION");
  });

  it("keeps viewers read-only", async () => {
    const h = harness();
    await expect(
      h.service.saveRevision(
        context("BUSINESS_VIEWER"),
        "place-a",
        data({ description: "Tentativa" }),
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_CAPABILITY_DENIED");
  });

  it("rejects stale revision instead of last-write-wins", async () => {
    const h = harness();
    await expect(
      h.service.saveRevision(
        context("BUSINESS_MANAGER"),
        "place-a",
        data({ description: "Stale" }),
        0,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_STALE_REVISION");
  });

  it("does not expose drafts publicly", () => {
    expect(publicPlaceProjection(record("draft"))).toBeNull();
    expect(publicPlaceProjection(record("review"))).toBeNull();
    expect(publicPlaceProjection(record("suspended"))).toBeNull();
    expect(publicPlaceProjection(record("archived"))).toBeNull();
    expect(publicPlaceProjection(record("published"))).not.toBeNull();
  });

  it("keeps the last published revision visible while a newer draft is edited", async () => {
    const h = harness(record("published"));
    const before = publicPlaceProjection(h.current());

    await h.service.saveRevision(
      context("BUSINESS_OWNER"),
      "place-a",
      data({ description: "Nova descrição ainda não publicada" }),
      1,
    );

    expect(h.current().publicationState).toBe("draft");
    expect(h.current().editableRevision.revision).toBe(2);
    expect(publicPlaceProjection(h.current())).toEqual(before);
    expect(publicPlaceProjection(h.current())?.description).toBe(
      "Experiência local",
    );
  });

  it("rejects invalid category, unsupported capability and unauthorized media", async () => {
    const invalidCategory = harness(
      record("draft", data({ categoryId: "unknown" })),
    );
    await expect(
      invalidCategory.service.requestReview(
        context("BUSINESS_OWNER"),
        "place-a",
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_CATEGORY_INVALID");

    const unsupported = harness(
      record(
        "draft",
        data({
          capabilities: { enabled: ["tickets"] },
        }),
      ),
    );
    await expect(
      unsupported.service.requestReview(
        context("BUSINESS_OWNER"),
        "place-a",
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_CAPABILITY_INVALID");

    const foreignMedia = harness(
      record(
        "draft",
        data({
          coverMediaId: "foreign",
          mediaIds: ["foreign"],
        }),
      ),
    );
    await expect(
      foreignMedia.service.requestReview(
        context("BUSINESS_OWNER"),
        "place-a",
        1,
      ),
    ).rejects.toThrow("PLACE_PUBLICATION_UNAUTHORIZED_MEDIA");
  });

  it("allows owner/manager to prepare but reserves publish for platform roles", async () => {
    const h = harness();
    await h.service.requestReview(context("BUSINESS_OWNER"), "place-a", 1);
    expect(h.current().publicationState).toBe("review");

    await expect(
      h.service.publish(context("BUSINESS_OWNER"), "place-a", 1),
    ).rejects.toThrow("PLACE_PUBLICATION_PUBLISH_ROLE_DENIED");

    await expect(
      h.service.publish(context("PLATFORM_ADMIN"), "place-a", 1),
    ).resolves.toMatchObject({ publicationState: "published" });
    expect(publicPlaceProjection(h.current())).toMatchObject({
      placeId: "place-a",
      businessId: "business-a",
    });
  });

  it("publishes the exact editable revision atomically", async () => {
    const h = harness(record("review"));
    await h.service.publish(context("PLATFORM_OWNER"), "place-a", 1);

    expect(h.repository.publishAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        placeId: "place-a",
        expectedRevision: 1,
        publicProjection: expect.objectContaining({ placeId: "place-a" }),
      }),
    );
    expect(h.current().publishedRevision?.revision).toBe(1);
  });

  it("removes suspended and archived records from the public projection", async () => {
    const suspended = harness(record("published"));
    await suspended.service.suspend(context("PLATFORM_ADMIN"), "place-a", 1);
    expect(publicPlaceProjection(suspended.current())).toBeNull();

    const archived = harness(record("published"));
    await archived.service.archive(context("PLATFORM_OWNER"), "place-a", 1);
    expect(publicPlaceProjection(archived.current())).toBeNull();
  });

  it("records auditable success with actor, scope and correlation id", async () => {
    const h = harness();
    await h.service.requestReview(context("BUSINESS_MANAGER"), "place-a", 1);

    expect(h.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "business_manager",
        role: "BUSINESS_MANAGER",
        businessId: "business-a",
        placeId: "place-a",
        destinationId: "morro-de-sao-paulo",
        action: "place.review.request",
        correlationId: "corr-123",
        result: "success",
      }),
    );
  });
});
