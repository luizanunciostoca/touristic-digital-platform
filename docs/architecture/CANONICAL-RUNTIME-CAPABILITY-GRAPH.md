# Touristic Digital Platform - Canonical Runtime Capability Graph

Status: runtime architecture reference for the current main lineage and the Morro Pro Location self-service integration.

## 1. Operating principle

A capability is considered integrated only when the complete authority path exists:

`ENTRYPOINT -> UI -> DOMAIN -> API -> SERVICE/RUNTIME -> DATABASE/PROVIDER -> READBACK`

A source file or exported function that is not reachable from an entrypoint is not automatically dead code. It may be tooling, migration evidence, a deliberate compatibility layer or a retired component. Product activation requires both a runtime caller and an accepted contract.

## 2. Tourist runtime

`public/index.html`
-> `dist/browser-entry.js`
-> locale + analytics + application bootstrap
-> home/discovery + weather + Assistant shell
-> map provider boot
-> navigation runtime
-> Explore Locations control
-> canonical public Place API (`/api/places/v1/*`)
-> Place platform runtime
-> `business_places` published projection.

### Place presentation authority

The active Place V2 flow is:

`Explore selection`
-> `renderPlaceDetailMessage`
-> Assistant detail message
-> contextual action rail
-> canonical Place detail/actions.

`place-bottom-sheet.ts` is historical/migration evidence and is intentionally not installed by the active Explore runtime. Re-enabling `installPlaceBottomSheet()` would violate the current Place/Search Explore V2 contract.

## 3. Morro Pro / Business runtime

`public/business-dashboard.html`
-> `dist/business-dashboard-entry.js`
-> `BusinessDashboardClient`
-> authenticated Business context controller
-> module capability matrix
-> profile / location / media / catalog surfaces.

### Location self-service - canonical chain

`Morro Pro > Localização`
-> current canonical location read
-> candidate search
-> explicit confirmation OR manual/device selection
-> `BusinessDashboardClient`
-> `/api/business/:businessId/location*`
-> `authApi.authorizeBusinessRequest`
-> Wave B `createBusinessLocationDiscoveryAdapter`
-> Place platform runtime
-> editable `business_places` revision.

Rules:

1. search is read-only and never auto-confirms;
2. mutation requires same-origin/CSRF + authenticated Business scope;
3. Wave B re-checks Place/Business/Destination identity and `business.update`;
4. candidates outside the destination may be shown but cannot be confirmed;
5. confirmation preserves source/provider metadata;
6. mutation creates a new editable revision only;
7. public projection is unchanged until governed publication;
8. cross-business and cross-destination access fail closed.

## 4. Backend dispatch

`apps/morro-digital-platform/tooling/dev-server.mjs` is the composed Node runtime.

Major dispatch sequence:

- health/readiness/runtime config;
- runtime destination and weather;
- analytics;
- auth;
- affiliates;
- media;
- public Places;
- admin / Control Center;
- CRM;
- Business / Morro Pro;
- payments;
- ticketing;
- commerce;
- Assistant;
- static asset fallback.

The Morro Pro Location routes are owned by the Business API namespace and delegate Place persistence to the canonical Place runtime rather than creating a second location database.

## 5. Payments / subscriptions

The recurring subscription lifecycle is server-authoritative:

`authenticated browser client`
-> `/api/payments/v1/subscriptions`
-> Ordering canonical subscription
-> Financial provider binding
-> Mercado Pago `/preapproval`
-> authoritative readback/webhook
-> durable Financial persistence.

The existence of `payments-browser-subscription-client.ts` does not imply that an additional Morro Pro management screen must be invented. Product/UI expansion requires an explicit product contract. Amount, currency, frequency and payer identity remain server-authoritative.

## 6. Notifications

The notifications runtime is started dynamically by the server and composes persistence, preference, idempotency and scheduling primitives. External delivery providers must be configured separately. A running notifications runtime is not proof that email/push delivery is active when its provider list is empty.

## 7. Design system and lower-severity dormant capabilities

The Design System V2 CSS is active across product surfaces. The TypeScript design-system component package is not broadly imported by product runtime surfaces and should be treated as adoption debt, not as proof that no design system exists.

Other implemented capabilities that currently require separate product decisions before activation include:

- browser content snapshot cache;
- responsive image helper;
- selected migration/audit utilities.

They must not be wired merely because static reachability analysis marks them unused.

## 8. Integration status after this ChangeSet

| Capability                      | Runtime status                                | Authority                        |
| ------------------------------- | --------------------------------------------- | -------------------------------- |
| Tourist Explore/Search          | Active                                        | Explore + Search + public Places |
| Place V2 detail                 | Active via Assistant detail + contextual rail | canonical Place                  |
| Legacy Place Bottom Sheet       | Intentionally retired                         | none                             |
| Morro Pro profile               | Active                                        | Business/Place                   |
| Morro Pro location              | Integrated by this ChangeSet                  | Business Auth + Wave B + Place   |
| Morro Pro media                 | Active when storage is configured             | Media/Content                    |
| Morro Pro products/offers/menu  | Active governed drafts                        | Business/Catalog                 |
| Payments one-time checkout      | Active where provider config permits          | Ordering/Financial               |
| Subscription provider lifecycle | Server-authoritative                          | Ordering/Financial               |
| Notifications core runtime      | Active infrastructure                         | Notifications                    |
| External notification delivery  | Configuration-dependent                       | provider-specific                |

## 9. Structural rule for future audits

Before classifying any apparently unused function as a missing integration:

1. find its product contract and migration evidence;
2. check whether a newer runtime explicitly retired it;
3. distinguish static import reachability from dynamic import/tooling reachability;
4. identify the canonical owner of identity, authorization and persistence;
5. connect only when the full end-to-end authority path is defined;
6. prove the exact head with affected tests, typecheck and integration evidence.
