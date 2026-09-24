# Wave J — Place Publication Security and Governance

Status: implemented on `wave/place-publishing-security-20260923`.

Base main: `499cb1eab0353d72b4e988ac1eb1ad0da17405c9`.

Canonical Business/Place contract reviewed from Wave A exact head:
`5ed3fa161b2fa8304ebdb99022f36beff022ac33`.

## Lifecycle decision

Wave A already defines:

- `draft`
- `review`
- `published`
- `suspended`
- `archived`

Wave J therefore does not introduce a competing `READY` state. `review` is the canonical equivalent of "ready for publication/review".

## Revision model

A governed Place keeps:

- `publishedRevision`: the exact revision currently exposed publicly;
- `editableRevision`: the working revision;
- monotonically increasing revision numbers;
- `expectedPreviousRevision` and repository-side optimistic concurrency.

Editing a published Place does not overwrite the public projection. A new edit returns the working state to `draft`; the prior published revision remains the public authority until the new revision is reviewed and atomically published.

## Public projection rule

Only `publicationState === "published"` may produce a public Place projection.

These states produce no public projection:

- draft;
- review;
- suspended;
- archived.

This is the contract Search, Assistant, Map and indexing consumers must use.

## Required versus recommended publication validation

Required:

- name;
- category;
- destination;
- business relationship;
- description;
- valid latitude and longitude;
- active category;
- authorized media references;
- supported capabilities.

Recommended and non-blocking:

- cover;
- hours;
- contact;
- menu when menu capability is enabled.

Recommendations must not be promoted to hard requirements without an explicit product/domain decision.

## Authorization matrix

| Role | Read own Place | Edit own draft | Request review | Publish | Suspend/archive |
| --- | --- | --- | --- | --- | --- |
| PLATFORM_OWNER | yes | yes | yes | yes | yes |
| PLATFORM_ADMIN | yes | yes | yes | yes | yes |
| BUSINESS_OWNER | yes | yes | yes | no | no |
| BUSINESS_MANAGER | yes | yes | yes | no | no |
| BUSINESS_VIEWER | yes | no | no | no | no |

All mutation authorization is server-side.

Platform roles use the existing platform-wide business-scope bypass from `@touristic/auth`. Business roles are constrained by explicit `businessIds`.

## Tenant and destination invariants

Mutation fails closed when any editable revision attempts to change:

- `placeId`;
- `businessId`;
- `destinationId`.

Ownership transfer and destination reassignment are not ordinary Place edits. They require separate, explicit administrative workflows.

## Publication authority

Business owners/managers may prepare a valid revision and move it to `review`.

Final publish, suspend and archive are reserved to:

- `PLATFORM_OWNER`;
- `PLATFORM_ADMIN`.

This is intentionally conservative because there is no existing product-approved auto-publish policy for location/category/ownership-sensitive changes.

## Business Portal approval policy

Documented field policy:

- description: auto-publish eligible in a future controlled workflow;
- name: review required;
- category: review required;
- location: review required;
- business ownership: review required;
- destination: review required.

Wave J does **not** implement automatic publication for description changes yet. It documents eligibility only. This avoids inventing a production approval mechanism before Business Portal/Control Center workflow ownership is finalized.

## Media policy

Wave J does not implement Media.

It defines only the authorization contract:

- every referenced media ID must be verified by an external Media authority;
- cover media is checked the same way;
- foreign-business media is rejected.

Wave C remains Media authority.

## Capability policy

Enabled Place capabilities are checked through an external catalog/policy authority against the Place category.

Wave J does not create or mutate capability definitions.

## Audit contract

Every governed mutation event carries:

- actor;
- canonical role;
- businessId;
- placeId;
- destinationId;
- action;
- before revision;
- after revision when applicable;
- timestamp;
- correlationId;
- result;
- reason.

Denied/conflicting publication and revision operations are auditable as well.

## Concurrency / replay

Optimistic concurrency uses exact `expectedRevision`.

A stale revision fails with `PLACE_PUBLICATION_STALE_REVISION` instead of last-write-wins.

The repository is responsible for making the compare-and-write atomic. Replaying a mutation with an old revision therefore fails closed.

## Adversarial coverage

The test suite covers:

- cross-business mutation;
- cross-destination mutation;
- viewer mutation;
- stale revision;
- unpublished projection visibility;
- invalid coordinates;
- invalid category;
- unsupported capability;
- unauthorized media;
- Business role attempting final publish;
- exact-revision atomic publication;
- suspended/archived removal from public projection;
- audit actor/scope/correlation fields.

Concurrent-write/replay semantics are exercised through the same expected-revision contract.

## Integration boundary with Wave A

Wave J is deliberately structural because Wave A is not yet in main.

During integration, `GovernedPlaceRevisionData` should be adapted directly from Wave A's canonical `Place` fields:

- `Place.id -> placeId`;
- `Place.businessId -> businessId`;
- `Place.destinationId -> destinationId`;
- `Place.name`;
- `Place.categoryId`;
- `Place.description`;
- `Place.location.latitude/longitude`;
- `Place.capabilities.enabled`;
- `Place.visibility`.

Do not create a second canonical Place entity.

## Handoff to Chat 6 and Chat 9

Consumers must enforce these rules:

1. UI state is never authorization authority.
2. Mutation requests carry canonical IDs and expected revision.
3. Business and destination identity are immutable in normal Place edit flows.
4. Draft/review/suspended/archived records are excluded from public Search/Map/Assistant projections.
5. Publish is a distinct command from save.
6. Publish uses exact editable revision and atomic public-projection update.
7. Viewer is read-only.
8. Business owner/manager cannot perform final publish/suspend/archive under this policy.
9. Media references must be validated by Media authority.
10. Required and recommended validation must remain distinct.
11. All mutation outcomes should preserve correlation IDs for audit.
12. Stale/replayed writes must fail closed.

## Out of scope honored

Not implemented:

- Control Center UI;
- map UI;
- Media implementation;
- merge;
- deployment.
