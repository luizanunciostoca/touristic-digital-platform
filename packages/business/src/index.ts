import {
  authorizeBusinessAccess,
  type AuthSessionIdentity,
} from "@touristic/auth";

export interface BusinessPromotion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly validUntil: string;
}

export interface BusinessProfile {
  readonly id: string;
  readonly name: string;
  readonly categoryLabel: string;
  readonly specialty: string;
  readonly description: string;
  readonly cta: string;
  readonly locationLabel: string;
  readonly locationIsExample: boolean;
  readonly promotion: BusinessPromotion | null;
  readonly tutorial: boolean;
  readonly excludeFromBusinessMetrics: boolean;
}

export interface BusinessProfileRepository {
  readonly getProfile: (businessId: string) => Promise<BusinessProfile | null>;
  readonly saveProfile: (
    businessId: string,
    profile: BusinessProfile,
  ) => Promise<BusinessProfile>;
}

export interface BusinessProfileService {
  readonly getProfile: (businessId: unknown) => Promise<BusinessProfile | null>;
  readonly saveProfile: (
    businessId: unknown,
    profile: unknown,
  ) => Promise<BusinessProfile>;
}

export interface AuthorizedBusinessProfileService {
  readonly getProfile: (
    session: AuthSessionIdentity | null,
    businessId: unknown,
  ) => Promise<BusinessProfile | null>;
  readonly saveProfile: (
    session: AuthSessionIdentity | null,
    businessId: unknown,
    profile: unknown,
  ) => Promise<BusinessProfile>;
}

function safeText(value: unknown, fallback = ""): string {
  let source = fallback;
  if (typeof value === "string") source = value || fallback;
  else if (typeof value === "number" && Number.isFinite(value))
    source = String(value);
  else if (typeof value === "boolean") source = value ? "true" : "false";
  return source.replace(/[<>]/gu, "").slice(0, 240);
}

export function normalizeBusinessId(value: unknown): string {
  return safeText(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function normalizeBusinessProfile(
  profile: unknown,
  fallbackId = "business-local",
): BusinessProfile {
  const record =
    profile && typeof profile === "object"
      ? (profile as Record<string, unknown>)
      : {};
  const rawPromotion =
    record.promotion && typeof record.promotion === "object"
      ? (record.promotion as Record<string, unknown>)
      : null;

  const promotion = rawPromotion
    ? Object.freeze<BusinessPromotion>({
        id: safeText(rawPromotion.id),
        title: safeText(rawPromotion.title),
        description: safeText(rawPromotion.description),
        cta: safeText(rawPromotion.cta, "Ver oferta"),
        validUntil: safeText(rawPromotion.validUntil),
      })
    : null;

  return Object.freeze<BusinessProfile>({
    id: safeText(record.id, fallbackId),
    name: safeText(record.name, "Negócio local"),
    categoryLabel: safeText(record.categoryLabel, "Negócio local"),
    specialty: safeText(record.specialty, "Experiência local"),
    description: safeText(
      record.description,
      "Um perfil completo poderá apresentar diferenciais, produtos, serviços e informações úteis para o turista.",
    ),
    cta: safeText(record.cta, "Ver empresa"),
    locationLabel: safeText(record.locationLabel, "Morro de São Paulo"),
    locationIsExample: Boolean(record.locationIsExample),
    promotion,
    tutorial: Boolean(record.tutorial),
    excludeFromBusinessMetrics: Boolean(record.excludeFromBusinessMetrics),
  });
}

export function createBusinessProfileService(
  repository: BusinessProfileRepository,
): BusinessProfileService {
  return Object.freeze({
    async getProfile(
      businessIdInput: unknown,
    ): Promise<BusinessProfile | null> {
      const businessId = normalizeBusinessId(businessIdInput);
      if (!businessId) return null;
      const profile = await repository.getProfile(businessId);
      return profile ? normalizeBusinessProfile(profile, businessId) : null;
    },

    async saveProfile(
      businessIdInput: unknown,
      profileInput: unknown,
    ): Promise<BusinessProfile> {
      const businessId = normalizeBusinessId(businessIdInput);
      if (!businessId) throw new Error("INVALID_BUSINESS_ID");
      const profile = normalizeBusinessProfile(profileInput, businessId);
      return repository.saveProfile(businessId, profile);
    },
  });
}

function requireAuthorizedBusinessId(
  session: AuthSessionIdentity | null,
  businessIdInput: unknown,
  mutation: boolean,
): string {
  const businessId = normalizeBusinessId(businessIdInput);
  const decision = authorizeBusinessAccess(session, businessId, { mutation });
  if (!decision.allowed || !decision.businessId) {
    throw new Error(`BUSINESS_AUTH_${decision.reason.toUpperCase()}`);
  }
  return decision.businessId;
}

export function createAuthorizedBusinessProfileService(
  repository: BusinessProfileRepository,
): AuthorizedBusinessProfileService {
  const profiles = createBusinessProfileService(repository);

  return Object.freeze({
    async getProfile(
      session: AuthSessionIdentity | null,
      businessIdInput: unknown,
    ): Promise<BusinessProfile | null> {
      const businessId = requireAuthorizedBusinessId(
        session,
        businessIdInput,
        false,
      );
      return profiles.getProfile(businessId);
    },

    async saveProfile(
      session: AuthSessionIdentity | null,
      businessIdInput: unknown,
      profileInput: unknown,
    ): Promise<BusinessProfile> {
      const businessId = requireAuthorizedBusinessId(
        session,
        businessIdInput,
        true,
      );
      return profiles.saveProfile(businessId, profileInput);
    },
  });
}
