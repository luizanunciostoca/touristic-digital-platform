# Morro Digital — Home & Tourist Experience P01–P11 (ISOLATED LAB)

**STATUS: NEW CODE ONLY / NON-PRODUCTION / NO MERGE / NO REAL COMMERCIAL OPERATIONS**

This laboratory implements the user-approved _isolated construction and testing scope_ of the eleven proposals in the 2026-09-30 Home & Tourist Experience approval document. It is **not** a new Tourist UI shell and is **not** integrated into the production app. Each source module is an independently importable candidate policy/adapter with a fail-closed boundary. The visual comparative preview is explicitly marked as a mockup and must never be represented as a real production screenshot.

## Exact source & authority

- Repository: `luizanunciostoca/touristic-digital-platform`.
- Baseline exact `main`: `37eb641eefa91f57d8d74c1dc87894c2da36f3ae`.
- Changes permitted in **this branch/worktree**: `labs/tourist-ux-p01-p11/**` only.
- Frozen V1: `apps/morro-digital-platform/public/legacy/**` unchanged.
- Prior visual authority is Home/Discover V2, not the generic 112-screen Interface Fabric shell.
- Approval received: develop all P01–P11 **in isolation**. No approval was given to merge, deploy, execute real purchases, modify live content or change the approved visual identity.

### Preserved user decisions

Mapbox map-first viewport; `#unified-assistant-dock` with grabber → bounded message → one horizontal category rail (10 approved categories, >=44px) → persistent composer (Send+Voice) → five-route primary navigation; no Quick Actions or floating Assistant button; Place with `peek/half/full`, Mapbox/Place owner priority and unified contextual Assistant (no duplicate buttons or duplicate business logic); current Tour/Navigation/Ticketing/Weather/Analytics/Privacy behaviors, 4 languages including HE RTL, context preservation and V1 compatibility. The original app and feature owners remain the only authoritative runtime.

### Implemented isolated modules

| Proposal | Lab module                              | What can be tested now                                                                                               | What remains before merge                                                                                |
| :------- | :-------------------------------------- | :------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| P01      | `src/locale-policy.mjs`                 | manual > supported browser > destination; PT/EN/ES/HE, RTL                                                           | convert main module + its tests in later exact-head integration PR                                       |
| P02      | `src/canonical-places.mjs`              | dynamic camera query, bounded cursor iteration, real-source counts and clearly labeled opt-in legacy fallback        | prove canonical API/media coverage with destination/bbox/readback; verify backend flag and map lifecycle |
| P03      | `src/place-presentation.mjs`            | partial vs ready, category labels, owner-gated actions, same peek/half/full state                                    | map to exact `PublicPlaceDetail` contract and real locale catalog                                        |
| P04      | `src/commercial-gateway.mjs`            | owner/capability + quote gates, 4 documented Portuguese CTAs, checkout impossible in lab                             | independently verify each current owner and TEST-only readback across 4 waves                            |
| P05      | `src/tutorial-extension.mjs`            | six original target anchors + Explore + Place→action; preserve completed users and extension opt-in                  | embed with actual onboarding storage/overlay; keyboard and mobile browser E2E                            |
| P06      | `src/assistant-continuity.mjs`          | known selectors, original category and nav ordering, restore state plan for Place/Assistant/Commerce/navigation/tour | run browser E2E on **actual** separate assembled app; no Assistant VNext substitution                    |
| P07      | `src/header-correction.mjs`, `preview/` | scoped opt-in header shadow diff preserving Weather CSS                                                              | only apply after normalized actual Home screenshot proves halo and comparison is accepted                |
| P08      | `src/saved-options.mjs`, `preview/`     | A saved inside Assistant / B Home overlay, same read-only provider                                                   | user must select final A or B after comparison; do not merge both UX presentations                       |
| P09      | `src/offline-safety.mjs`                | no offline checkout/payment/booking; stale-safe reads; reconnection readback                                         | real browser SW/IndexedDB E2E against isolated app and security tests                                    |
| P10      | `src/qa-profile.mjs`                    | viewport/hit-target/overlay/a11y test contracts                                                                      | real screenshot/axe/keyboard/RTL/200% proof on final exact head and physical Samsung certification       |
| P11      | `src/media-coverage.mjs`                | per-Place canonical attribution, HTTPS/host vetting, approved editorial fallback, no invented ratings                | real canonical media coverage/readback and exact Place/media owner contracts                             |

## Execute

From inside `labs/tourist-ux-p01-p11/` on the repository's Node 22.x environment:

```sh
node --test tests/*.test.mjs
node tools/source-contracts.mjs
PORT=4179 node tools/preview-server.mjs  # 127.0.0.1 only, mock comparison at /
MORRO_AUDIT_ORIGIN=https://morro-digital-v2-staging.onrender.com node tools/public-readback.mjs  # optional GETs only
```

All feature flags are OFF in `src/authority.mjs`. Any browser-initiated payment or non-GET request via the lab is prohibited. The preview server is loopback-only and sends an `x-morro-mode: isolated-fixture-only` header.

## Gates to unlock future real integration (not authorized by this task)

1. G0: exact-main SHA, source-file inventory, approved before screenshots and risk assessment.
2. G1: map owner API and canonical media coverage; endpoints and capabilities owner-by-owner. Zero-item `GET /api/places/v1/map` is insufficient to disable V1 fallback.
3. G2: independent import candidate into **new integration worktree** only with flags OFF, source file diffs and rollback plan.
4. G3: real app browser action→state/readback matrix across URL/affiliate QR, four locales and keyboard/RTL, tutorial, map, Places, Assistant, Tour/Navigation, TEST-only Commerce, return, offline/recovery and saved option.
5. G4: P07 actual before/after shadow evidence and P08 A/B user visual choice; reconcile responsive/contrast without altering other approved pixels.
6. G5: exact-head gates (Node 22, quality, security, screenshot review, browser matrix incl. WebKit and physical Samsung SM-X820/API36). Merge and production still require separate authorization/release gates.

**No status inside this lab is equivalent to real `main` integration or production acceptance.**
