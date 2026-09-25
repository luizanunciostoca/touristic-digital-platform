# Morro Digital — Business / Place Location Discovery

## Scope

Wave B adds governed discovery, confirmation and persistence of a Place location without changing Place identity authority.

Mapbox is an auxiliary search provider only. A Mapbox result becomes canonical location data only after an authorized operator explicitly confirms it.

## Dependency

This wave is stacked on Wave A / PR #344 and consumes its canonical:

- BusinessId;
- PlaceId;
- DestinationId;
- Place;
- PlaceLocation;
- PlaceAccessScope;
- authorizePlaceAccess().

Wave B does not create alternate Business or Place identities.

## Discovery order

The adapter executes discovery in this order:

1. canonical Places already registered for the destination;
2. Morro V1 / legacy catalog;
3. Mapbox Searchbox when configured;
4. cross-source deduplication;
5. ranking by destination eligibility, confidence and distance.

Search never mutates Place state and never auto-confirms the first result.

## Candidate contract

Each candidate carries:

- source;
- name;
- address;
- category;
- latitude;
- longitude;
- externalProvider;
- externalPlaceId;
- distanceMeters;
- confidence;
- destination eligibility.

Candidates outside the configured destination boundary may be surfaced for disambiguation, but cannot be confirmed.

## Explicit confirmation

The UI contract is expected to expose explicit actions equivalent to:

- Usar esta localização;
- Ver no mapa;
- Não é este local.

Marker adjustment is represented as a manual selection before confirmation.

No location is persisted as a side effect of search.

## Fallbacks

When discovery produces no acceptable result:

- map selection uses source=manual;
- device/GPS location uses source=device when permission is granted;
- manual latitude/longitude uses source=manual.

Manual coordinates are validated strictly:

- latitude: -90..90;
- longitude: -180..180.

GPS denial is returned as a non-throwing denied state so UI can continue to map/manual fallback.

## Canonical location metadata

Wave B extends the canonical PlaceLocation source contract additively with:

- mapbox;
- manual;
- device;
- imported.

Legacy source values remain temporarily accepted for migration compatibility.

Confirmed locations persist:

- source;
- externalProvider;
- externalPlaceId;
- verifiedAt;
- verifiedBy.

## Security / tenancy

Discovery and confirmation fail closed when:

- businessId is outside the authenticated scope;
- destinationId differs from the configured destination;
- destinationId is outside the authenticated scope;
- Place.businessId differs from the requested businessId;
- Place.destinationId differs from the requested destinationId;
- business.update capability is absent;
- coordinates are outside the destination boundary;
- repository persistence returns identity drift.

Destination reassignment is not part of this contract. Moving a Place between destinations requires a separate governed contract.

## Provider behavior

The existing shared @touristic/search Mapbox Searchbox adapter is reused.

Wave B configures:

- q as sanitized operator text;
- language from request;
- limit bounded to 1..10 for Mapbox;
- types=poi,place,address;
- proximity at the destination center;
- timeout boundary around provider fetch.

Provider failure, timeout or empty response fail soft to remaining discovery/fallback options.

## Non-scope

Wave B does not:

- create Place Action Registry;
- rewrite Products;
- implement Media;
- rewrite the Wave A Business domain;
- modify place-bottom-sheet;
- merge main;
- deploy production.
