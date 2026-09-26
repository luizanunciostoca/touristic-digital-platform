# Morro Digital — UX Design V2 Reference Assets

Canonical Google Drive folder:

https://drive.google.com/drive/folders/1jiXe_9HM6fL-CGRTca_ZofvVzYJFeMBs

This folder is the canonical visual/documentation reference set for the UX Design V2 mobile convergence work.

## Files currently in the folder

- `Morro_Digital_Manual_Desenvolvedor_UX_Design_V2.pdf`
  - Drive file ID: `16oAqwh1UVdWZgjf2_zl7uM54QH8EX6m-`
  - Purpose: canonical UX Design V2 developer manual.

- `IMG_2421.PNG`
  - Drive file ID: `1OIDnjxfobEp7rTQ-faS1MZK97k6G61Ub`
  - Purpose: approved manual/infographic reference showing the five canonical smartphone states.

### Current onboarding baseline

These files are current iPhone/staging evidence for the onboarding flow. They are NOT Golden authority by themselves.

- `IMG_2423.PNG` — onboarding welcome/entry state
  - Drive file ID: `1AIb2-R6vnKCkp4nXqT-TY_fpdhXjpCH0`
- `IMG_2424.PNG` — Step 1 of 6: Explore Morro on the map
  - Drive file ID: `1hUyFbT3FKz27tINSNXQP5Sc4iiEOfUVq`
- `IMG_2425.PNG` — Step 2 of 6: Weather
  - Drive file ID: `18qzPPtHJg5Bidzs-rwPbUZfMYavH1DVq`
- `IMG_2426.PNG` — Step 3 of 6: Composer / ask naturally
  - Drive file ID: `1Gwa5cVIpKCoi9yQvYbwhPaieq5VCG1R7`
- `IMG_2427.PNG` — Step 4 of 6: Voice
  - Drive file ID: `1tqREnOiUglYR5w1FO36QokfDeMyesyrT`
- `IMG_2428.PNG` — Step 5 of 6: Assistant preferences/Profile
  - Drive file ID: `1dDCmAalssuWVnY8xNYzxs25FGKeXG6nk`
- `IMG_2429.PNG` — Step 6 of 6: Map perspective/global controls
  - Drive file ID: `1VAPsrwoRHeeeTM5hibNG4KJZBuLItS9C`

### Current product baseline

- `IMG_2430.PNG` — Discover default
  - Drive file ID: `11FosTYw8WiFWD0VXGpGtb9wL_U9dyf6X`
- `IMG_2431.PNG` — Assistant expanded/current quick-action baseline
  - Drive file ID: `1aH8J3LD9dc_v4fUmMVaIADAa3PYZ5oid`
- `IMG_2432.PNG` — Tours discovery/filtering
  - Drive file ID: `1PaowJCfn2yVNyvEH6mBH3k5Jy2hj6BR7`
- `IMG_2433.PNG` — Tour preview/pre-tour
  - Drive file ID: `1MKwH3kdUkJDA01-kMvbcWW7RZvMoUZKx`
- `IMG_2434.PNG` — Place current state
  - Drive file ID: `1AIro96SpMHpmrnrCtjEr_M80wUb8Lhak`
- `IMG_2435.PNG` — Ticketing current state
  - Drive file ID: `15RZD2n105s6luD_1hRx-Ymy458t7dGVz`
- `IMG_2436.PNG` — Profile current state
  - Drive file ID: `1iKc1wwxW7HsoFyHUT5Q2MBGeTVBHd5a-`

## Exact visual mapping

- Discover Golden: `IMG_2421.PNG`, smartphone 1 ("Modo Descobrir")
  - Current: `IMG_2430.PNG`
- Assistant contextual Golden: `IMG_2421.PNG`, smartphone 1 lower/context region
  - Current: `IMG_2431.PNG`
- Place Golden: `IMG_2421.PNG`, smartphone 2 ("Modo Lugar")
  - Current: `IMG_2434.PNG`
- Navigation Golden: `IMG_2421.PNG`, smartphone 3 ("Modo Navegação")
  - Current runtime screenshot still must be generated from the app
- Tour Golden: `IMG_2421.PNG`, smartphone 4 ("Modo Tour")
  - Current discovery: `IMG_2432.PNG`
  - Current preview: `IMG_2433.PNG`
  - Active Tour runtime screenshot still must be generated
- Ticketing Golden: `IMG_2421.PNG`, smartphone 5 ("Ticketing Unificado")
  - Current: `IMG_2435.PNG`
- Profile current: `IMG_2436.PNG`
  - Authority: manual/transversal rules; the cover does not contain a dedicated Profile Golden
- Onboarding current: `IMG_2423.PNG` through `IMG_2429.PNG`
  - Authority: UX V2 manual + canonical screen hierarchy + progressive-disclosure principles; the cover does not contain a dedicated onboarding Golden.

## Onboarding conformance notes

The current onboarding screenshots establish the BEFORE baseline. Workers must not promote them to Golden.

Observed risks that must be verified in code/runtime and corrected where confirmed:

- Welcome modal is visually large and blocks most map context.
- Tutorial panels are oversized relative to the map-first product hierarchy.
- Background dimming is heavy in multiple steps.
- Step 1 teaches the map while covering a large portion of the map.
- Step 2 weather spotlight is much larger than the target and the guidance card is dominant.
- Step 3 composer highlight/coachmark placement risks viewport clipping and obscures context.
- Step 4 ("Voice") appears to highlight the lower navigation region rather than the voice/microphone target; target-to-copy correspondence must be corrected.
- Step 5 copy says Assistant tuning/preferences while the visual spotlight targets Profile; target/copy semantics must be reconciled with the real information architecture.
- Step 6 highlights multiple map controls while the copy specifically discusses changing map perspective/global view; the exact intended control must be unambiguous.
- Back/Next controls consume excessive vertical space.
- Onboarding must preserve safe areas, map visibility, target visibility and one-handed use.
- Skip and completion persistence must be deterministic.
- Missing-target and unavailable-capability states must fail safely rather than trapping the user.

## Worker instructions

Every UX V2 implementation or conformance wave must:

1. Read GitHub LIVE first.
2. Read the canonical manual from the Drive folder above.
3. Inspect the approved five-smartphone reference image.
4. Inspect the exact current iPhone staging screenshots mapped to its wave.
5. Treat the manual/approved Golden references as visual authority.
6. Treat staging/onboarding screenshots as evidence of the current implementation, not as design authority.
7. Never infer exact pixel/token values from a reduced screenshot when the manual/code provides the authoritative value.
8. Never rely on a locally copied asset if the Drive source has changed; re-read the Drive folder before final certification.
9. Record which source files were used for visual evidence in the PR.
10. Do not expose Drive file IDs or URLs in end-user product UI.

## Product-level visual invariants

- The map is the environment/canvas.
- The Assistant is contextual intelligence, not a category dashboard.
- No Quick Actions grid.
- No legacy floating Assistant FAB.
- Content appears progressively and contextually.
- Commerce is a consequence of discovery.
- UI must not become financial authority.
- Onboarding teaches the real product without replacing the product with a modal experience.
- Every onboarding step must point to the correct live target and preserve enough surrounding context to teach spatially.
- Git mergeability does not prove semantic or visual compatibility.

## Freshness rule

Before final visual certification, re-list the canonical Drive folder and verify whether the manual or screenshots have changed. If any canonical source changed materially, invalidate affected visual evidence and re-run the corresponding conformance checks.
