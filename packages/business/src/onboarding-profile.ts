import {
  normalizeBusinessProfile,
  type BusinessProfile,
  type BusinessPromotion,
} from "./index.js";
import type { BusinessOnboardingContext } from "./onboarding.js";

export interface BusinessTutorialProfileInput {
  readonly categoryLabel?: string;
  readonly cta?: string;
  readonly description?: string;
  readonly promotion?: BusinessPromotion | null;
  readonly profileId?: string;
}

function text(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/[<>]/gu, "").trim().slice(0, 240) || fallback;
}

function locationDetails(value: unknown): {
  readonly label: string;
  readonly isExample: boolean;
} {
  if (!value || typeof value !== "object") {
    return Object.freeze({ label: "Morro de São Paulo", isExample: false });
  }

  const location = value as Record<string, unknown>;
  const isExample = location.isExample === true || location.source === "device";
  const label = text(
    location.address,
    text(
      location.matchedName,
      text(location.name, isExample ? "Localização demonstrativa" : "Morro de São Paulo"),
    ),
  );
  return Object.freeze({ label, isExample });
}

export function buildBusinessTutorialProfile(
  context: BusinessOnboardingContext = {},
  input: BusinessTutorialProfileInput = {},
): BusinessProfile {
  const name = text(context.businessName, "Sua empresa");
  const location = locationDetails(context.businessLocation);
  const recommendationCandidate =
    context.tutorialBusinessCandidate &&
    typeof context.tutorialBusinessCandidate === "object"
      ? (context.tutorialBusinessCandidate as Record<string, unknown>)
      : null;
  const candidateId = text(recommendationCandidate?.id);
  const fallbackDescription = `${name} poderá apresentar seus diferenciais, produtos, serviços e informações úteis para o turista.`;

  return normalizeBusinessProfile({
    id: text(input.profileId, candidateId || `tutorial-profile-${name}`),
    name,
    categoryLabel: text(input.categoryLabel, "Negócio local"),
    specialty: text(context.specialty, "Experiência local"),
    description: text(input.description, fallbackDescription),
    cta: text(input.cta, "Ver empresa"),
    locationLabel: location.label,
    locationIsExample: location.isExample,
    promotion: input.promotion ?? null,
    tutorial: true,
    excludeFromBusinessMetrics: true,
  });
}
