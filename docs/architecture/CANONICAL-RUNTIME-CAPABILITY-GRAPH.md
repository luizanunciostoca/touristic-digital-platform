# Touristic Digital Platform — Canonical Runtime Capability Graph

Authority: 2026-10-02 source + versioned contracts + exact-main Control Plane. Integration requires a proven **ENTRYPOINT → UI → DOMAIN → API → SERVICE → DATABASE/provider** chain.

## Runtime

Tourist: `index.html` → browser entry → Assistant/Map/Navigation/Explore/Place → commerce/ticketing. Server: `dev-server.mjs` → Auth/Affiliates/Analytics/Notifications/Destinations/CRM/Business/Payments/Ticketing/Commerce/Content/Place/Admin. Morro Pro: dashboard → Auth Browser → Business client/surface → protected APIs → canonical owners.

## Capability status

Assistant/Search/Explore/Place, Map/Navigation/Weather/PWA, Content/Media, CRM, Commerce/Ordering, Ticketing, Affiliates, Analytics/Auth, Control Center and Destinations are active canonical paths. Legacy Place Bottom Sheet is intentionally retired. Payments/subscriptions remain server-authoritative. Notifications runtime/outbox is active while external delivery proof is separate. DS V2 CSS is active; TypeScript component adoption is partial.

## Morro Pro Location

Morro Pro → Location UI → Wave B adapter → `/api/business/:id/location*` → Place platform → `business_places` editable revision. Search is read-only; peers must be public; confirmation re-reads candidate identity; manual/device use the same governed path; cross-business/cross-destination/out-of-radius operations fail closed; platform roles use Control Center; mutations retain origin/CSRF protection; publication remains separate.

## Corrected audit decisions

`business-location-discovery-adapter.ts` belongs to Morro Pro, not onboarding. Reinstalling `installPlaceBottomSheet()` would regress V2. The subscription client does not authorize inventing a new UI because Ordering/Financial remain authority. Responsive-image/content-cache/DS TypeScript/migration utilities require semantic classification before wiring/deletion.

## Acceptance

One exact SHA must pass formatting, secrets, architecture, lint, typecheck, affected tests, Business Location contract/runtime proofs, build, independent proof, Claim Guard, Merge Gate and canonical-main readback. Production publication is separate.
