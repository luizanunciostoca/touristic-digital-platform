# Search M44 — V1 Dice Fuzzy Fallback Evidence

## Scope

M44 closes the single functional `PARTIAL` identified by the M43 post-M42 audit: the V1-equivalent Dice fuzzy fallback must be owned by `@touristic/search`, not only by the equivalent Assistant resolver.

Frozen reference:

- V1-equivalent implementation: `apps/morro-digital-platform/src/assistant/assistant-v1-place-resolver.ts`;
- frozen threshold: `0.55`;
- Search base after M43: `02623622c043af12d662898cce878a522f93f8e8`;
- final implementation validation runs from an authored head after formatter helpers are absent from the diff.

## Search-owned contract

`packages/search/src/index.ts` now exposes the same normalized bigram Dice coefficient through `diceSearchSimilarity()` and freezes `searchV1FuzzyThreshold = 0.55`.

The fuzzy fallback obeys the audited precedence boundary:

1. apply Search filters first;
2. run all existing deterministic Search strategies;
3. if any deterministic result exists, return those results unchanged and do not run fuzzy selection;
4. only when deterministic matching returns no result, compare the normalized query against canonical names and aliases;
5. preserve the first catalog candidate on equal scores by replacing the current best only on a strictly greater score;
6. accept only the best candidate when its Dice score is at least `0.55`;
7. otherwise return an empty result set.

The fuzzy score intentionally remains the raw Dice coefficient (`0..1`). It is never mixed with deterministic M37 scores (`45..100`) because the two result paths are mutually exclusive.

## Executable regression

`packages/search/src/search-fuzzy.test.ts` freezes:

- threshold exactly `0.55`;
- real-catalog typo `baslico` resolving fuzzily to `Basílico`;
- equivalence between the returned fuzzy score and the normalized Dice coefficient;
- deterministic exact/alias/prefix/tag precedence over fuzzy;
- alias typo fallback;
- rejection below threshold;
- filtering before fuzzy selection.

## Architectural boundary

M44 does not modify the Assistant resolver, Mapbox provider, presentation layer, browser DOM or ranking semantics. It ports the already-proven V1 fuzzy primitive into the Search-owned query boundary and keeps the existing Assistant implementation untouched as regression evidence.

## Matrix consequence

When the M44 code, repository Quality Gate and Search Browser Contract are green on one final authored head, the former `Fuzzy fallback` row can move from `PARTIAL` to `PASS`.

The resulting 22-row Search matrix is then:

- `PASS`: 21
- `PARTIAL`: 0
- `GAP`: 0
- `N/A`: 1
- total: 22

At that point every applicable Search equivalence contract is `PASS`, and `FEATURE-0002` becomes eligible for Feature Registry promotion after the registry contract itself is audited and validated.

## Exit gate

M44 may close only when:

- the official Quality Gate is green on the final authored head;
- Search Browser Contract is green on that same head;
- the final diff contains no temporary helper workflow;
- the final matrix records 21 `PASS`, 0 `PARTIAL`, 0 `GAP`, 1 `N/A`;
- any Feature Registry promotion is consistent with the repository registry validator and the audited consumer visual contract.
