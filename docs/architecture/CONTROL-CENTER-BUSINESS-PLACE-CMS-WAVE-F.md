# Wave F — Control Center Business / Place Admin CMS

## Intent

Evolve `Control Center → Empresas` from an Identity-backed directory / Business 360 composition into an administrative CMS without taking authority from the canonical Business/Place, Location, Media, Commerce, Action Registry or Publication domains.

## Transport boundary

Wave F consumes the existing server-side `domainAdapters.businesses` boundary already enforced by `admin-api.mjs`. The browser only talks to `/api/admin/v1/businesses/**` through the Control Center API helper and requires `business.update` for mutations.

The CMS route contract is additive:

- `GET /businesses/cms`
- `POST /businesses/cms`
- `GET /businesses/:businessId/cms`
- `PUT /businesses/:businessId/cms/profile`
- `PUT /businesses/:businessId/cms/location`
- `POST/DELETE /businesses/:businessId/cms/media`
- `/businesses/:businessId/cms/catalog`
- `/businesses/:businessId/cms/actions`
- `POST /businesses/:businessId/cms/publication`

Those endpoints are an admin transport projection. Their payload authority must come from the owner contracts during Control Tower integration; Wave F does not define parallel domain entities.

## Upstream contracts inspected

- Wave A / PR #344: canonical BusinessId, PlaceId, CategoryId, DestinationId relationships, profile/location/capabilities and authorization.
- Wave B / PR #348: explicit location discovery/confirmation and manual/device fallbacks.
- Wave C / PR #345: PlaceMedia / MediaAsset upload, cover, logo, gallery, reorder/delete.
- Wave D / PR #346: Business → Product → Offer and Place → Menu relationships.
- Wave J / PR #347: governed publication revisions and lifecycle.
- Wave E was not yet available when this branch started; the UI intentionally consumes an `actions` projection and never implements CTA resolution locally.

## Conflict strategy

`apps/control-center/public/control-center.js` is treated as a shared hotspot. The implementation lives in `control-center-business-cms.js` and `control-center-business-cms.css`; the shared shell receives only a small import/delegation change.

When `domainAdapters.businesses` is not composed yet, the current Business 360 view remains available with an explicit compatibility callout. This keeps the branch reviewable before cross-wave integration.

## Integration checklist

- bind list/detail projection to canonical Business/Place repository;
- bind location commands to Wave B;
- bind media commands to Wave C;
- bind catalog/menu projection and mutations to Wave D;
- bind action projection/configuration to Wave E;
- bind publish validation/revisions to Wave J;
- preserve cross-business and cross-destination denial server-side;
- add browser E2E fixtures once the composed adapter exists;
- capture visual evidence for desktop/tablet/mobile after adapter composition.

No merge or deployment is performed by this wave.
