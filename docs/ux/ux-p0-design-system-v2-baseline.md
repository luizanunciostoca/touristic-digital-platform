# UX P0 + Design System V2 — Baseline

## Source of truth

- Repository: `luizanunciostoca/touristic-digital-platform`
- Audited base branch: `main`
- Audited base SHA: `154d584ff8e0d555f296f35022c1e4acda26d455`
- V1 reference commit preserved by the repository: `60746fd7fed97b805758b37adfdbe3bad2582bfe`
- Delivery PR: #102
- Delivery branch: `wave/ux-p0-design-system-v2`

This document records the pre-change baseline. GitHub LIVE remains the release source of truth.

## Preservation boundary

Files under `apps/morro-digital-platform/public/legacy/**` are treated as historical V1 evidence. They are protected by the byte-for-byte snapshot test in:

`apps/morro-digital-platform/src/legacy/v1-style-snapshot.test.ts`

The UX P0 wave does not modify those files. Runtime corrections that must supersede a legacy declaration are applied by the V2 foundation stylesheet loaded after the legacy bundle.

## Public surfaces audited

| Surface | Baseline files | Primary states |
| --- | --- | --- |
| Home / map shell | `public/index.html`, `public/styles.css` | initial, ready, map controls, weather |
| Explore / places | `public/explore-locations.css` | categories, selection, close/back |
| Navigation | navigation runtime + legacy banner CSS | active, minimized, end navigation |
| Tours | tour runtime + legacy tour CSS | intro, stop, narration, completion |
| Assistant | assistant runtime + legacy assistant CSS | input, message, options, modal |
| Commerce / experience | `public/commerce.css`, `experience.html` | experience details, CTA |
| Ticketing | `ticketing.css`, `tickets.html` | offers, reservation, ticket dialog |
| Business | `business-dashboard.*`, `business-onboarding.*` | dashboard, mobile nav, forms |
| Dashboard login | `dashboard/login.css` | login form |

## P0 findings at the audited base SHA

1. The main viewport meta blocked user zoom with `maximum-scale=1.0` and `user-scalable=no`.
2. `.sr-only` shared `display:none !important` with `.hidden`, removing assistive-only content from the accessibility tree.
3. Some critical controls rendered below the 44 × 44 px target, including Explore mobile controls, Business Dashboard icon buttons and the Ticketing dialog close action.
4. Primary shells still relied on `100vh`; legacy declarations loaded later could reintroduce unsafe mobile viewport sizing.
5. Reduced-motion and forced-colors handling existed in multiple feature/legacy files but lacked one V2-wide accessibility contract.
6. Focus behavior existed in several features but there was no shared canonical focus token/rule for public interactive elements.
7. Design tokens were distributed across legacy and feature styles rather than exposed through one additive V2 foundation contract.

## Existing regression evidence retained

The following repository workflows/tests are part of the baseline and remain authoritative evidence when they run on the exact PR HEAD:

- `.github/workflows/navigation-accessibility-baseline.yml`
- `.github/workflows/navigation-visual-baseline.yml`
- `.github/workflows/mapbox-visual-contract-regression.yml`
- `.github/workflows/v1-home-responsive-browser-regression.yml`
- `.github/workflows/v1-home-parity-browser-regression.yml`
- `.github/workflows/v1-tour-responsive-browser-regression.yml`
- `.github/workflows/home-first-run-browser-regression.yml`
- `.github/workflows/business-dashboard-browser-contract.yml`
- `.github/workflows/commerce-browser-regression.yml`
- `apps/morro-digital-platform/src/legacy/visual-regression-manifest.test.ts`

The visual regression manifest already requires keyboard navigation, high contrast, enlarged text and offline/provider-unavailable scenarios.

## V2 acceptance evidence for this wave

The wave adds the canonical `public/design-system-v2.css` contract and the test:

`apps/morro-digital-platform/src/accessibility/ux-p0-foundations.test.ts`

The Navigation Accessibility workflow is extended to prove in Chromium:

- forced colors;
- 200% reflow emulation;
- touch targets of at least 44 × 44 px for active navigation controls;
- reduced-motion media preference;
- no horizontal overflow.

No item is considered accepted solely because it appears in this document. Final acceptance requires green checks on the exact current PR HEAD and reconciliation against the then-current `main`.
