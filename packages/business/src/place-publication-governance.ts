import {
  authorizeCapability,
  canonicalAuthRole,
  type AuthSessionIdentity,
} from "@touristic/auth";

export const placePublicationStates = Object.freeze([
  "draft",
  "review",
  "published",
  "suspended",
  "archived",
] as const);

export type PlacePublicationState = (typeof placePublicationStates)[number];

export interface GovernedPlaceLocation {
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface GovernedPlaceCapabilities {
  readonly enabled: readonly string[];
}

export interface GovernedPlaceRevisionData {
  readonly placeId: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly name: string;
  readonly categoryId: string;
  readonly description: string;
  readonly location: GovernedPlaceLocation;
  readonly capabilities: GovernedPlaceCapabilities;
  readonly visibility: "public" | "unlisted" | "private";
  readonly coverMediaId?: string | null;
  readonly mediaIds?: readonly string[];
  readonly openingHoursPresent?: boolean;
  readonly contactPresent?: boolean;
  readonly menuPresent?: boolean;
}

export interface PlaceRevision {
  readonly id: string;
  readonly revision: number;
  readonly expectedPreviousRevision: number | null;
  readonly data: GovernedPlaceRevisionData;
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface GovernedPlaceRecord {
  readonly placeId: string;
  readonly businessId: string;
  readonly destinationId: string;
  readonly publicationState: PlacePublicationState;
  readonly publishedRevision: PlaceRevision | null;
  readonly editableRevision: PlaceRevision;
  readonly updatedAt: string;
}

export interface PlacePublicationCatalog {
  readonly hasActiveCategory: (categoryId: string) => Promise<boolean>;
  readonly mediaBelongsToBusiness: (
    businessId: string,
    mediaId: string,
  ) => Promise<boolean>;
  readonly capabilityIsSupported: (
    categoryId: string,
    capability: string,
  ) => Promise<boolean>;
}

export interface PlacePublicationRepository {
  readonly get: (placeId: string) => Promise<GovernedPlaceRecord | null>;
  readonly saveDraft: (
    record: GovernedPlaceRecord,
    expectedRevision: number,
  ) => Promise<GovernedPlaceRecord>;
  readonly publishAtomically: (input: {
    readonly placeId: string;
    readonly expectedRevision: number;
    readonly next: GovernedPlaceRecord;
    readonly publicProjection: GovernedPlaceRevisionData;
  }) => Promise<GovernedPlaceRecord>;
  readonly setState: (
    placeId: string,
    state: PlacePublicationState,
    expectedRevision: number,
  ) => Promise<GovernedPlaceRecord>;
}

export interface PlacePublicationAuditEvent {
  readonly actor: string;
  readonly role: string;
  readonly businessId: string;
  readonly placeId: string;
  readonly destinationId: string;
  readonly action:
    | "place.revision.save"
    | "place.review.request"
    | "place.publish"
    | "place.suspend"
    | "place.archive";
  readonly beforeRevision: number | null;
  readonly afterRevision: number | null;
  readonly timestamp: string;
  readonly correlationId: string;
  readonly result: "success" | "denied" | "conflict" | "invalid";
  readonly reason: string | null;
}

export interface PlacePublicationAuditPort {
  readonly record: (event: PlacePublicationAuditEvent) => Promise<void>;
}

export interface PlacePublicationContext {
  readonly session: AuthSessionIdentity | null;
  readonly correlationId: string;
  readonly now: string;
}

export interface PlacePublicationValidationIssue {
  readonly code: string;
  readonly field: string;
  readonly severity: "required" | "recommended";
}

export interface PlaceMutationPolicy {
  readonly field: string;
  readonly approval: "auto_publish_eligible" | "review_required";
  readonly reason: string;
}

export const placeMutationPolicies: readonly PlaceMutationPolicy[] = Object.freeze([
  Object.freeze({
    field: "description",
    approval: "auto_publish_eligible" as const,
    reason: "Presentation copy does not change canonical ownership or geography.",
  }),
  Object.freeze({
    field: "name",
    approval: "review_required" as const,
    reason: "Name affects public identity and discovery.",
  }),
  Object.freeze({
    field: "categoryId",
    approval: "review_required" as const,
    reason: "Category changes capabilities and public discovery semantics.",
  }),
  Object.freeze({
    field: "location",
    approval: "review_required" as const,
    reason: "Coordinates are security-sensitive public geography.",
  }),
  Object.freeze({
    field: "businessId",
    approval: "review_required" as const,
    reason: "Ownership is canonical authority and cannot be silently reassigned.",
  }),
  Object.freeze({
    field: "destinationId",
    approval: "review_required" as const,
    reason: "Destination scope is tenant/geographic authority.",
  }),
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validCoordinates(location: GovernedPlaceLocation): boolean {
  return (
    typeof location.latitude === "number" &&
    Number.isFinite(location.latitude) &&
    location.latitude >= -90 &&
    location.latitude <= 90 &&
    typeof location.longitude === "number" &&
    Number.isFinite(location.longitude) &&
    location.longitude >= -180 &&
    location.longitude <= 180
  );
}

export function validatePlaceForPublication(
  data: GovernedPlaceRevisionData,
): readonly PlacePublicationValidationIssue[] {
  const issues: PlacePublicationValidationIssue[] = [];
  if (!text(data.name)) issues.push({ code: "NAME_REQUIRED", field: "name", severity: "required" });
  if (!text(data.categoryId)) issues.push({ code: "CATEGORY_REQUIRED", field: "categoryId", severity: "required" });
  if (!text(data.destinationId)) issues.push({ code: "DESTINATION_REQUIRED", field: "destinationId", severity: "required" });
  if (!text(data.businessId)) issues.push({ code: "BUSINESS_REQUIRED", field: "businessId", severity: "required" });
  if (!text(data.description)) issues.push({ code: "DESCRIPTION_REQUIRED", field: "description", severity: "required" });
  if (!validCoordinates(data.location)) issues.push({ code: "VALID_COORDINATES_REQUIRED", field: "location", severity: "required" });

  if (!text(data.coverMediaId)) issues.push({ code: "COVER_RECOMMENDED", field: "coverMediaId", severity: "recommended" });
  if (!data.openingHoursPresent) issues.push({ code: "HOURS_RECOMMENDED", field: "openingHours", severity: "recommended" });
  if (!data.contactPresent) issues.push({ code: "CONTACT_RECOMMENDED", field: "contact", severity: "recommended" });
  if (data.capabilities.enabled.includes("menu") && !data.menuPresent) {
    issues.push({ code: "MENU_RECOMMENDED", field: "menu", severity: "recommended" });
  }
  return Object.freeze(issues);
}

function publicationError(code: string): Error {
  return new Error(`PLACE_PUBLICATION_${code}`);
}

function assertActiveSession(
  context: PlacePublicationContext,
  businessId: string,
  mutation = true,
): void {
  const decision = authorizeCapability(context.session, "business.update", {
    businessId,
    mutation,
  });
  if (!decision.allowed) throw publicationError(decision.reason.toUpperCase());
}

function assertPlatformPublisher(context: PlacePublicationContext): void {
  if (!context.session) throw publicationError("AUTHENTICATION_REQUIRED");
  const role = canonicalAuthRole(context.session.role);
  if (role !== "PLATFORM_OWNER" && role !== "PLATFORM_ADMIN") {
    throw publicationError("PUBLISH_ROLE_DENIED");
  }
}

function assertImmutableScope(
  record: GovernedPlaceRecord,
  data: GovernedPlaceRevisionData,
): void {
  if (data.placeId !== record.placeId) throw publicationError("PLACE_ID_MISMATCH");
  if (data.businessId !== record.businessId) throw publicationError("CROSS_BUSINESS_MUTATION");
  if (data.destinationId !== record.destinationId) throw publicationError("CROSS_DESTINATION_MUTATION");
}

async function validateExternalAuthorities(
  catalog: PlacePublicationCatalog,
  data: GovernedPlaceRevisionData,
): Promise<void> {
  if (!(await catalog.hasActiveCategory(data.categoryId))) {
    throw publicationError("CATEGORY_INVALID");
  }
  for (const mediaId of data.mediaIds ?? []) {
    if (!(await catalog.mediaBelongsToBusiness(data.businessId, mediaId))) {
      throw publicationError("UNAUTHORIZED_MEDIA");
    }
  }
  if (data.coverMediaId && !(await catalog.mediaBelongsToBusiness(data.businessId, data.coverMediaId))) {
    throw publicationError("UNAUTHORIZED_MEDIA");
  }
  for (const capability of data.capabilities.enabled) {
    if (!(await catalog.capabilityIsSupported(data.categoryId, capability))) {
      throw publicationError("CAPABILITY_INVALID");
    }
  }
}

async function audit(
  port: PlacePublicationAuditPort,
  context: PlacePublicationContext,
  record: GovernedPlaceRecord,
  action: PlacePublicationAuditEvent["action"],
  result: PlacePublicationAuditEvent["result"],
  reason: string | null,
  afterRevision: number | null,
): Promise<void> {
  await port.record(Object.freeze({
    actor: context.session?.subject ?? "anonymous",
    role: context.session ? canonicalAuthRole(context.session.role) : "ANONYMOUS",
    businessId: record.businessId,
    placeId: record.placeId,
    destinationId: record.destinationId,
    action,
    beforeRevision: record.editableRevision.revision,
    afterRevision,
    timestamp: context.now,
    correlationId: context.correlationId,
    result,
    reason,
  }));
}

export function publicPlaceProjection(
  record: GovernedPlaceRecord,
): GovernedPlaceRevisionData | null {
  if (
    record.publicationState === "suspended" ||
    record.publicationState === "archived"
  ) {
    return null;
  }
  return record.publishedRevision?.data ?? null;
}

export function createPlacePublicationService(
  repository: PlacePublicationRepository,
  catalog: PlacePublicationCatalog,
  auditPort: PlacePublicationAuditPort,
) {
  return Object.freeze({
    async saveRevision(
      context: PlacePublicationContext,
      placeId: string,
      data: GovernedPlaceRevisionData,
      expectedRevision: number,
    ): Promise<GovernedPlaceRecord> {
      const record = await repository.get(placeId);
      if (!record) throw publicationError("NOT_FOUND");
      try {
        assertActiveSession(context, record.businessId);
        assertImmutableScope(record, data);
        if (record.editableRevision.revision !== expectedRevision) {
          throw publicationError("STALE_REVISION");
        }
        const nextRevision: PlaceRevision = Object.freeze({
          id: `${record.placeId}:r${expectedRevision + 1}`,
          revision: expectedRevision + 1,
          expectedPreviousRevision: expectedRevision,
          data: Object.freeze(data),
          createdAt: context.now,
          createdBy: context.session?.subject ?? "unknown",
        });
        const next: GovernedPlaceRecord = Object.freeze({
          ...record,
          publicationState:
            record.publicationState === "archived" ? "archived" : "draft",
          editableRevision: nextRevision,
          updatedAt: context.now,
        });
        const saved = await repository.saveDraft(next, expectedRevision);
        await audit(auditPort, context, record, "place.revision.save", "success", null, saved.editableRevision.revision);
        return saved;
      } catch (error) {
        await audit(auditPort, context, record, "place.revision.save", error instanceof Error && error.message.includes("STALE_REVISION") ? "conflict" : "denied", error instanceof Error ? error.message : "UNKNOWN", null);
        throw error;
      }
    },

    async requestReview(
      context: PlacePublicationContext,
      placeId: string,
      expectedRevision: number,
    ): Promise<GovernedPlaceRecord> {
      const record = await repository.get(placeId);
      if (!record) throw publicationError("NOT_FOUND");
      try {
        assertActiveSession(context, record.businessId);
        if (record.editableRevision.revision !== expectedRevision) throw publicationError("STALE_REVISION");
        assertImmutableScope(record, record.editableRevision.data);
        const requiredIssues = validatePlaceForPublication(record.editableRevision.data).filter((issue) => issue.severity === "required");
        if (requiredIssues.length) throw publicationError("REQUIRED_FIELDS_INVALID");
        await validateExternalAuthorities(catalog, record.editableRevision.data);
        const next = await repository.setState(record.placeId, "review", expectedRevision);
        await audit(auditPort, context, record, "place.review.request", "success", null, expectedRevision);
        return next;
      } catch (error) {
        await audit(auditPort, context, record, "place.review.request", "invalid", error instanceof Error ? error.message : "UNKNOWN", null);
        throw error;
      }
    },

    async publish(
      context: PlacePublicationContext,
      placeId: string,
      expectedRevision: number,
    ): Promise<GovernedPlaceRecord> {
      const record = await repository.get(placeId);
      if (!record) throw publicationError("NOT_FOUND");
      try {
        assertActiveSession(context, record.businessId);
        assertPlatformPublisher(context);
        if (record.publicationState !== "review") throw publicationError("NOT_READY_FOR_PUBLICATION");
        if (record.editableRevision.revision !== expectedRevision) throw publicationError("STALE_REVISION");
        assertImmutableScope(record, record.editableRevision.data);
        const requiredIssues = validatePlaceForPublication(record.editableRevision.data).filter((issue) => issue.severity === "required");
        if (requiredIssues.length) throw publicationError("REQUIRED_FIELDS_INVALID");
        await validateExternalAuthorities(catalog, record.editableRevision.data);

        const next: GovernedPlaceRecord = Object.freeze({
          ...record,
          publicationState: "published" as const,
          publishedRevision: record.editableRevision,
          updatedAt: context.now,
        });
        const published = await repository.publishAtomically({
          placeId: record.placeId,
          expectedRevision,
          next,
          publicProjection: record.editableRevision.data,
        });
        await audit(auditPort, context, record, "place.publish", "success", null, expectedRevision);
        return published;
      } catch (error) {
        await audit(auditPort, context, record, "place.publish", error instanceof Error && error.message.includes("STALE_REVISION") ? "conflict" : "denied", error instanceof Error ? error.message : "UNKNOWN", null);
        throw error;
      }
    },

    async suspend(
      context: PlacePublicationContext,
      placeId: string,
      expectedRevision: number,
    ): Promise<GovernedPlaceRecord> {
      const record = await repository.get(placeId);
      if (!record) throw publicationError("NOT_FOUND");
      assertActiveSession(context, record.businessId);
      assertPlatformPublisher(context);
      if (record.editableRevision.revision !== expectedRevision) throw publicationError("STALE_REVISION");
      const next = await repository.setState(placeId, "suspended", expectedRevision);
      await audit(auditPort, context, record, "place.suspend", "success", null, expectedRevision);
      return next;
    },

    async archive(
      context: PlacePublicationContext,
      placeId: string,
      expectedRevision: number,
    ): Promise<GovernedPlaceRecord> {
      const record = await repository.get(placeId);
      if (!record) throw publicationError("NOT_FOUND");
      assertActiveSession(context, record.businessId);
      assertPlatformPublisher(context);
      if (record.editableRevision.revision !== expectedRevision) throw publicationError("STALE_REVISION");
      const next = await repository.setState(placeId, "archived", expectedRevision);
      await audit(auditPort, context, record, "place.archive", "success", null, expectedRevision);
      return next;
    },
  });
}
