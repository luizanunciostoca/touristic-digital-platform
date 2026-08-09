# Assistant V1 place-resolution audit — M17

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

## Finding

The V1 Assistant does **not** treat the raw GeoJSON as the canonical navigation/search universe.

`assistant-dialog.js` imports `locations` from `js/map/locations/locations.js`, flattens every category into `allPlaces`, and only accepts entries that have a name, numeric `lat`/`lon`, and fall within the 12 km radius used by `isWithinRadius` around Morro de São Paulo.

The raw `dadosGeoJSON` is used by the dialog primarily as a metadata/detail fallback (`findGeoJSONDetailsByName`). It is not the primary source used by `findPlace`.

`map-commander.js` has a second, map-only resolution path: first a small `KNOWN_PLACES` table and then `window.locations`. This confirms that broad place resolution ultimately depends on the curated locations catalog rather than on arbitrary GeoJSON features.

## V1 `findPlace` precedence

The observable place matcher in `assistant-dialog.js` follows this exact precedence:

1. canonical normalized name equality → `exact`;
2. normalized alias equality → `alias`;
3. canonical/alias substring inclusion in either direction → `partial` / `alias_partial`;
4. Dice coefficient fuzzy match over canonical names and aliases, accepted at score `>= 0.55` → `fuzzy`;
5. otherwise `null`.

Normalization lowercases, removes Latin diacritics and trims whitespace.

## Consequence for V2

The M14–M16 explicit resolver is safe but incomplete because it only freezes a subset of V1 places. M17 closes the **matching-semantics** gap by reproducing the V1 precedence and `0.55` fuzzy threshold over the audited V2 catalog.

Navigation remains `PARTIAL` after M17 because catalog breadth is still incomplete. A later checkpoint must migrate or generate the full curated `locations.js` universe (subject to the V1 12 km filter) before this contract can be promoted to `PASS`.

## Non-goals

- Do not navigate to arbitrary raw GeoJSON features.
- Do not geocode unknown user text into invented destinations.
- Do not substitute external search results for the frozen V1 curated catalog when claiming V1 equivalence.
- Do not promote MIG-0006 to `equivalent` from this checkpoint alone.
