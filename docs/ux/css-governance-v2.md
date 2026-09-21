# CSS governance — UX Design V2

## Decision

The active product CSS is governed by two rules:

1. `transition: all` is forbidden in every active Tourist UI stylesheet.
2. `!important` may only remain inside reviewed compatibility or accessibility boundaries and may not grow above the checked per-file ceiling.

The frozen `public/legacy/**` tree remains immutable evidence and is excluded from active-product debt accounting.

## Cascade architecture

`premium-ux-v2.css` declares the deterministic layer order:

`reset → vendor → legacy → tokens → base → components → features → utilities → overrides`.

The normal V2 foundations use named layers. One unlayered compatibility bridge remains deliberately outside those layers while frozen V1 selectors are still part of the runtime. This is a **formal intentional compatibility boundary**, not an untracked hybrid. The bridge is source-tested and must disappear when the matching frozen V1 runtime selectors are retired.

## Accepted `!important` boundaries

- **reduced-motion safety override** — the Design System uses five global important declarations so motion suppression wins over legacy animation/transition declarations.
- **frozen V1 compatibility bridge** — Navigation V2 and Assistant V2 use reviewed important declarations only where immutable V1 declarations otherwise win specificity/cascade.
- **Mapbox/provider inline presentation** — Explore and first-person Navigation marker rules use reviewed important declarations where provider/inline presentation would otherwise override required position/visibility.
- **screen-reader utility** — the active `.sr-only` utility retains important declarations to guarantee accessible clipping semantics against older feature CSS.

Commerce, Ticketing and Carousel V2 are required to stay `!important`-free.

## Transition governance

The unused legacy `--transition: all …` alias was removed from `styles.css`. The permanent contract scans all active product stylesheets and fails if a literal `transition: all` returns.

## Exit criteria for the compatibility bridge

The unlayered bridge can be removed only after its matching frozen V1 selectors stop loading at runtime and the Navigation/Assistant/Explore visual and browser parity gates pass without compatibility overrides.
