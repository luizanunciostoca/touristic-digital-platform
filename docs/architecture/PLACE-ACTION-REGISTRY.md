# Place Action Registry — Wave E

## Authority

The canonical public Place CTA authority is:

`@touristic/business/place-action-registry`

The resolver is server/projection-safe and produces `PlacePresentationActions`. Public
frontends must render this projection instead of rebuilding commercial rules from the
category.

The deprecated browser-local
`apps/morro-digital-platform/src/map/place-commerce-capability.ts` adapter has
been removed. Public map/detail callers consume canonical projected actions.

## Resolution formula

Actions are derived from the intersection of:

- canonical category;
- explicit `Place.capabilities.enabled`;
- required Place data;
- explicit Product/Offer/Menu relations by `placeId`;
- inventory/provider facts;
- current state;
- locale.

Category alone never creates a commercial CTA.

## Exact contract

```ts
export interface PlaceActionDefinition {
  readonly id: PlaceActionType;
  readonly categoryApplicability: readonly CanonicalPlaceCategory[] | "all";
  readonly requiredCapabilities: readonly PlaceCapability[];
  readonly priority: number;
  readonly presentation: "primary" | "secondary";
}

export interface PlacePresentationActions {
  readonly placeId: PlaceId;
  readonly businessId: BusinessId;
  readonly destinationId: DestinationId;
  readonly primaryAction: PlacePresentationAction | null;
  readonly secondaryActions: readonly PlacePresentationAction[];
}
```

Primary commercial actions currently justified by real domains:

- nightlife + `tickets` + canonical active Offer + usable inventory => tickets;
- hotel + `booking` + provider available => booking;
- tour + `tourBooking` + provider available => tour booking;
- transport + `transportBooking` + provider available => transport booking.

Secondary actions require their corresponding data:

- directions => valid coordinates;
- photos => canonical media projection says gallery available;
- menu => active canonical Menu linked by `placeId`;
- table reservation => capability + available provider;
- WhatsApp/call/website => populated contact field;
- products/offers => canonical records linked by `placeId`;
- info => non-empty canonical description.

Save/share are platform actions and therefore do not depend on a Business capability.

## Commerce and inventory

Products and Offers are filtered by explicit `businessId + placeId`. Name, slug, alias,
display label and product reference are not used by the canonical resolver.

Offer sellability delegates to Wave D `evaluateOfferSellability`. Inventory is an
external fact. If the inventory provider explicitly reports itself unavailable, purchase
fails closed and no purchase action is emitted.

Sold-out and upcoming ticket actions may remain visible but are disabled and carry
`availability: "sold_out" | "upcoming"`.

## Media

Wave E does not depend on Wave C implementation details. It accepts a projection fact:

```ts
{
  galleryAvailable: boolean;
}
```

Wave G should derive this from canonical PlaceMedia. Legacy photo-by-name fallback must
not turn `galleryAvailable` true in the canonical projection.

## Handoff — Chat 7 / public projection

Chat 7 should:

1. load canonical Place + active Category;
2. load canonical Product/Offer/Menu records for that exact `placeId`;
3. load inventory/provider availability facts;
4. load canonical media projection;
5. call `resolvePlacePresentationActions(context)`;
6. include the returned `PlacePresentationActions` verbatim in the public Place projection.

Chat 7 must not reproduce category-to-action rules.

## Handoff — Chat 8 / map presentation

Chat 8 should:

1. consume `PlacePresentationActions` from the public projection;
2. render `primaryAction` and `secondaryActions` in their supplied deterministic order;
3. use `disabled` and `availability` as presentation state only;
4. dispatch the supplied `value`;
5. avoid deriving actions from category, name, alias, slug, label or local inventory guesses.

The browser must not restore a local CTA inference fallback when the canonical
projection is absent. Missing canonical commercial authority fails closed.

## Test matrix

Wave E covers:

- category × capability;
- active offer;
- sold out;
- upcoming;
- menu absent;
- gallery absent;
- invalid coordinates;
- booking unavailable;
- provider unavailable;
- locale variation;
- duplicate prevention;
- deterministic ordering;
- no fake purchase CTA without a canonical Offer.

## Dependency graph

Wave E is stacked on Wave D, which is stacked on Wave A.

- Wave A: canonical Business/Place identities and capabilities;
- Wave D: Product/Offer/Menu relations and offer sellability;
- Wave C: media projection provider, consumed through a narrow fact contract;
- Wave E: action authority;
- Wave G: public Place projection consumer;
- Wave H: map/UI rendering consumer.

No merge or deployment is part of Wave E.

Validation checkpoint: exact-head CI must pass on the permanent source tree after temporary formatting helpers are removed.
