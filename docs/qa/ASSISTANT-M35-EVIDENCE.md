# Assistant M35 — Final Validation Evidence

## Scope

M35 closes the physical photo-asset delivery gap recorded by `MIG-0006` for `FEATURE-0004` (Assistente Digital), against V1 baseline commit `60746fd7fed97b805758b37adfdbe3bad2582bfe`.

## Physical asset evidence

- Source: V1 `images/fotos` at the frozen baseline.
- Exact physical set: 63 files.
- Extensions: 62 `.jpg` and one `.jpeg` (`primeira_praia2.jpeg`).
- Destination: V2 `/images/fotos/*`, preserving the same public paths.
- Integrity: all 63 files are frozen in `docs/qa/ASSISTANT-V1-PHOTO-ASSETS.sha256` and verified by `assistant-v1-photo-assets.test.ts`.
- Runtime delivery: `.jpg` and `.jpeg` are served as `image/jpeg` by `apps/morro-digital-platform/tooling/dev-server.mjs`.

No external photo origin, new browser secret, synthetic replacement asset, or transformation of the audited V1 bytes is introduced by M35.

## Browser contract

`.github/workflows/assistant-photo-browser-contract.yml` validates the real authenticated V2 browser runtime. It checks:

1. HTTP delivery of representative `.jpg` and `.jpeg` assets.
2. `Content-Type: image/jpeg`.
3. SHA-256 integrity of the served bytes.
4. Mapbox-backed runtime readiness before Assistant interaction.
5. Canonical V1 utterance `Fotos de Toca do Morcego`.
6. Resolved `photos` presentation through the Assistant runtime.
7. `.assistant-photo-carousel` DOM rendering with the expected V1 image paths.
8. Successful loading of the rendered image without browser page errors.

## Final green validation head

Validated implementation head: `e423807227a32f0492bfdbd0396a201f122913c1`.

| Gate                              |           Run | Result  |
| --------------------------------- | ------------: | ------- |
| Quality Gate                      | `31400332081` | success |
| Assistant Photo Browser Contract  | `31400332074` | success |
| Map Provider Regression           | `31400332107` | success |
| Mapbox Visual Contract Regression | `31400332035` | success |
| Navigation Visual Baseline        | `31400332236` | success |

The subsequent M35 documentation promotion changes only migration evidence/registry state and does not modify the validated photo/runtime implementation.

## Equivalence decision

With the physical assets, integrity regression, MIME delivery and observable browser carousel contract validated, the two remaining `PARTIAL` rows in `ASSISTANT-MIGRATION-MATRIX.md` are promoted to `PASS`:

- `location/photos/price/hours`
- `Handlers de domínio do diálogo`

All rows in the Assistant equivalence matrix are therefore `PASS`. `FEATURE-0004` and `MIG-0006` may be recorded as `equivalent`.

`equivalent` is not `released`; production rollout remains a separate migration state and requires its own release evidence.

## Final branch validation

The promoted migration state must pass the repository Quality Gate again on the final user-authored branch head before PR #96 can be merged.
