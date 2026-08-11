# Business M56 — Onboarding Per-Step Contracts Evidence

## Scope

M56 closes the next observable Business onboarding checkpoint after M55 established the dedicated browser host lifecycle. It ports the frozen V1 per-step tutorial contract into the isolated Business onboarding boundary without moving Auth, Search, geospatial, Assistant or Payments ownership into Business.

## Frozen V1 source

Repository: `luizidebook/morro-de-sao-paulo-digital`

Frozen commit: `60746fd7fed97b805758b37adfdbe3bad2582bfe`

Primary evidence:

- `js/onboarding/tours/business-tour-config.js`
- `js/onboarding/conversation/business-conversation-step-contracts.js`
- `js/onboarding/business-onboarding.js`

The V1 evidence defines 28 ordered steps across five chapters, including category/specialty/name/objective/audience input contracts, interpolated tutorial copy, representative presentation types, and guarded/effectful transitions for location, discovery, voice, ranking explanation, Assistant recommendation and route demonstration.

## M56 implementation

M56 preserves the runtime-isolation decision introduced in M54/M55. The main `@touristic/business` entrypoint remains free of onboarding browser runtime dependencies.

Dedicated subpaths now include:

- `@touristic/business/onboarding`
- `@touristic/business/onboarding-host`
- `@touristic/business/onboarding-steps`

The M56 step contract freezes:

- all 28 V1 step identifiers and ordering;
- V1 category choices and category-specific specialties;
- objective and audience choices;
- titles, descriptions, eyebrow labels, actions, lists and metrics;
- context interpolation for business name, category, specialty and category-specific Assistant copy;
- validation for the five editable foundation inputs.

The host/session boundary now persists validated foundation choices immutably into onboarding workflow state and the sandbox-only business draft. Runtime context updates are explicitly allow-listed and remain separate from authentication authority.

## Browser surface

The dedicated `business-onboarding.html` surface now consumes the M56 step contract rather than rendering an identifier-only placeholder.

It renders:

- frozen step copy and chapter progress;
- category, specialty, objective and audience choice controls;
- business-name text input with V1 maximum length;
- lists, metrics and Assistant-style response presentation where defined;
- V1-equivalent primary labels where applicable;
- validation feedback that blocks forward navigation when required input is missing or invalid;
- responsive and accessible control states on the existing dialog lifecycle.

The permanent Business Onboarding Browser Contract was updated to validate the real welcome/category/specialty/name path, persisted selection behavior, back navigation and skip lifecycle rather than the former M55 placeholder text.

## Adapter and orchestration ownership

M56 reuses the already-merged M54 Search/geospatial/Assistant adapters. It does not duplicate their underlying implementations.

The browser runtime binds observable step effects through explicit ports and host runtime context. Location/discovery/Assistant effects remain external capabilities consumed by Business.

Route behavior remains fail-closed where an equivalent route port is not yet available. M56 does not fabricate route success merely to promote migration status.

## Security boundary

Onboarding workflow state is product state, not authentication state.

M56 does not introduce credentials, signed session cookies, CSRF secrets, tenant role authority or authorization decisions into onboarding context. Runtime context mutation is allow-listed to tutorial-owned fields.

## Validation

Targeted Business package validation on the final authored implementation includes:

- formatting of all M56-authored files;
- `@touristic/business` lint;
- `@touristic/business` typecheck;
- `@touristic/business` tests;
- `@touristic/morro-digital-platform` lint;
- `@touristic/morro-digital-platform` typecheck.

The permanent browser and integration regressions were also revalidated after the M56 binding work: Business Onboarding Browser, Business Onboarding Adapter, Business Auth Integration, Business Dashboard Browser and Navigation Accessibility all passed together before the final documentation-only checkpoint.

The migration matrix is now recorded conservatively at `11 PASS / 4 PARTIAL / 4 GAP / 1 N/A`. The two promoted contracts are the tutorial/presentation contract and the Business onboarding visual surface. Business onboarding orchestration remains `PARTIAL` specifically because route execution still lacks an equivalent explicit port.

The final merge gate must pass on one permanent head:

- official Quality Gate;
- Business Onboarding Browser Contract;
- Business Onboarding Adapter Browser Contract;
- Business Auth Integration Contract;
- Business Dashboard Browser Contract;
- Navigation Accessibility Baseline;
- final review/diff audit with no temporary helper workflow.

## Non-goals

M56 does not absorb Payments/commercial conversion, invent analytics endpoints, claim unrelated recommendation/workspace sandbox ownership, or mark route behavior equivalent without an executable route port.

## Exit decision

Migration statuses may only be promoted where the final executable evidence proves the observable V1 contract. Any remaining route/commercial/analytics/runtime breadth stays PARTIAL or GAP for later milestones.

The next Business milestone is M57: freeze and port the smallest equivalent route capability required by the onboarding `route` step, preserving fail-closed behavior when routing is unavailable and keeping navigation/geospatial ownership outside Business.
