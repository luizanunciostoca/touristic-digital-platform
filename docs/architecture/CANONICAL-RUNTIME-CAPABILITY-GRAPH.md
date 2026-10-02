# Touristic Digital Platform — Canonical Runtime Capability Graph

Authority: 2026-10-02 source + versioned contracts + exact-main Control Plane.
Integration requires a proven **ENTRYPOINT → UI → DOMAIN → API → SERVICE → DATABASE/provider** chain; dynamic imports, HTML scripts, workflows, migrations, superseding contracts and duplicate authority must be checked before code is labeled unused.

## Runtime roots

Tourist: `public/index.html` → browser entry → Home/Weather/Assistant → Map/Navigation → Explore/Search/Place → commerce/ticketing. Server: `dev-server.mjs` → Auth/Affiliates/Analytics/Notifications/Destinations/CRM/Business/Payments/Ticketing/Commerce/Content/Place/Admin. Morro Pro: dashboard HTML → Auth Browser → Business client/surface → protected Business APIs → canonical owners.

## Capability map

| Capability                                                      | Canonical chain / status                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assistant; Search; Explore; Place                               | Tourist → Assistant/contextual rail → assistant + Places APIs → Assistant/Place services — active V2; legacy Place Bottom Sheet retired          |
| Map; Navigation; Weather; PWA                                   | browser entry → provider/navigation/weather/offline runtimes → APIs/service worker — active                                                      |
| Content; Media; Business Profile/Catalog/Photos                 | user/admin surfaces → domain APIs → canonical runtimes/storage — active                                                                          |
| **Business Location**                                           | Morro Pro → Location UI → Wave B adapter → `/api/business/:id/location*` → Place platform → `business_places` editable revision — this ChangeSet |
| CRM; Commerce; Ordering; Ticketing; Affiliates; Analytics; Auth | dedicated surfaces/APIs → domain services/persistence — active                                                                                   |
| Payments; Subscriptions                                         | protected browser adapters → Payments → Ordering/Financial → Mercado Pago/Financial DB — server-authoritative                                    |
| Notifications; Control Center; Destinations; Design System      | outbox/admin/domain APIs + canonical data + DS V2 CSS — active; external notification provider proof and TS DS adoption remain separate          |

## Morro Pro Location invariants

`loadLocation` reads the editable Place. Candidate search is read-only and combines own editable Place + published destination Places + legacy + optional Mapbox. Confirmation re-runs search and re-reads candidate identity server-side before tenant/destination/capability/radius checks. Manual/device coordinates use the same governed path. `updateLocation` creates an editable revision; publication remains separate.
Security: Business roles only; backend tenant authority mandatory; search never persists; cross-business/cross-destination/out-of-radius operations fail closed; platform roles use Control Center; mutation CSRF/origin checks remain active.

## Corrected audit conclusions

Reinstalling `installPlaceBottomSheet()` would regress V2; the production consumer of `business-location-discovery-adapter.ts` is Morro Pro, not onboarding; the subscription browser client does not authorize inventing a new UI because Ordering/Financial remain authority. Responsive-image/content-cache/DS TypeScript/migration utilities require semantic classification before wiring or deletion.

## Acceptance

One exact SHA must pass formatting, secrets, architecture, lint, typecheck, affected tests, Business Location contract/runtime proofs, build, independent proof, Claim Guard, Merge Gate and canonical-main readback. Production publication is separate.
