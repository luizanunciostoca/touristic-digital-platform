# Search M41 — Presentation Contract Evidence

## Scope

M41 implements step 6 of the frozen Search migration order at the domain/presentation boundary. It freezes result formatting, category icons, loading/empty/error copy and PT/EN/ES/HE result copy without introducing browser DOM or a standalone Search UI.

## Frozen V1 source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary evidence:

- `js/map/integrations/mapbox-search-service.js`
- `js/assistant/assistant-dialog/assistant-dialog.js`
- `js/i18n/pt.js`
- `js/i18n/en.js`
- `js/i18n/es.js`
- `js/i18n/he.js`

## Result formatting

The frozen V1 provider formats one result as `name` plus ` — placeFormatted` when formatted place copy is available.

The V1 list formatter produces numbered rows and the following category icon map:

- restaurants → `🍽️`
- hotels → `🏨`
- shops → `🛍️`
- nightlife → `🌙`
- emergencies → `🚨`
- attractions → `📍`
- places → `🏙️`
- addresses → `📬`
- beaches → `🏖️`
- tours → `🗺️`
- unknown category → `📍`

M41 preserves that data contract as structured rows with index, icon, name and description.

## Security boundary

V1 builds result HTML with provider-derived `name` and `placeFormatted` values inside `<strong>`/`<br>` markup. The Search migration matrix explicitly requires sanitization rather than trusting provider HTML.

M41 therefore does not emit HTML. Provider strings remain plain structured values for a future browser adapter to render with safe text nodes while preserving the same visible text, ordering and iconography. The executable test boundary includes provider-looking markup as plain data so a later browser renderer cannot assume these strings are trusted HTML.

## Multilingual copy

M41 freezes PT/EN/ES/HE copies for:

- loading (`assistant_thinking`);
- empty result (`assistant_no_results`);
- process error (`dialog_process_error`);
- result heading derived from `dialog_search_results`;
- result-selection prompt derived from `dialog_search_results`.

Locale variants such as `en-US` resolve to their base supported locale. Unsupported locales fall back to Portuguese, matching the current Search default language boundary.

## Non-goals

- no browser DOM implementation;
- no standalone Search modal/input;
- no CSS/layout port;
- no Map/Details/Navigation integration;
- no provider markup injection;
- no Feature Registry promotion yet.

## Exit gate

M41 may close only when this final authored head passes installation, formatting, architecture, Feature Registry, lint, typecheck, tests and build, and the PR diff contains only permanent presentation-contract files and evidence. Any temporary formatter workflow must be absent from the final diff before merge.
