import type { AssistantLocale } from "@touristic/assistant";
import type {
  PublicPlaceAction,
  PublicPlaceDetail,
  PublicPlaceMediaImage,
} from "@touristic/business";

import type {
  PlaceBottomSheetAction,
  PlaceBottomSheetPresentation,
  PlaceBottomSheetPrimaryAction,
} from "./place-bottom-sheet.js";

function publicImageSource(image: PublicPlaceMediaImage | null | undefined): string | null {
  const reference = image?.providerReference?.trim();
  if (!reference) return null;
  if (/^https:\/\//u.test(reference) || reference.startsWith("/")) return reference;
  return null;
}

function toSecondaryAction(action: PublicPlaceAction): PlaceBottomSheetAction {
  return Object.freeze({
    actionId: action.id,
    label: action.label,
    value: action.value,
    action: "command",
    disabled: action.disabled,
  });
}

function toPrimaryAction(
  action: PublicPlaceAction | null,
): PlaceBottomSheetPrimaryAction | null {
  if (!action) return null;
  return Object.freeze({
    actionId: action.id,
    label: action.label,
    value: action.value,
    disabled: action.disabled,
  });
}

export function toCanonicalPlaceBottomSheetPresentation(
  detail: PublicPlaceDetail,
  locale: AssistantLocale,
): PlaceBottomSheetPresentation {
  const canonicalImage =
    detail.media?.coverImage ?? detail.media?.gallery[0] ?? null;
  const src = publicImageSource(canonicalImage);

  return Object.freeze({
    location: Object.freeze({
      name: detail.profile.name,
      category: String(detail.profile.categoryId),
      area: detail.profile.location.area || detail.profile.location.address,
      tags: Object.freeze([...detail.profile.tags]),
    }),
    categoryLabel: String(detail.profile.categoryId),
    locale,
    actions: Object.freeze(
      detail.actions.secondaryActions.map(toSecondaryAction),
    ),
    primaryAction: toPrimaryAction(detail.actions.primaryAction),
    ...(src
      ? {
          heroImage: Object.freeze({
            src,
            alt: canonicalImage?.alt || detail.profile.name,
          }),
        }
      : {}),
    description:
      detail.profile.description || detail.profile.shortDescription || undefined,
    status:
      Object.values(detail.partial).some((state) => state === "unavailable")
        ? "error"
        : "ready",
  });
}
