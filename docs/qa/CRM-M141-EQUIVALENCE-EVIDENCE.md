# CRM M141 — FEATURE-0006 Equivalence Evidence

## Scope

This evidence closes only CRM / `FEATURE-0006`. It does not add Payments, Ticketing, Assistant implementation, Marketplace redesign or a parallel CRM domain.

Frozen source of truth:

```text
luizidebook/morro-digital-crm
1915d0260c79f30a63b926a1123e609083587745
```

Promotion remains coordinator-controlled. `Equivalent` is not `released`.

## PR stack

### PR #260 — M140 Lead Detail / Activity

Validated head:

```text
4e5360b62b1fd555234019dc67d8fb80ea4cd1f2
```

Proof on that head:

- Quality Gate: success, including repository tests and build;
- CRM Platform Auth Integration Contract: success;
- CRM Lead Detail Browser Contract: success.

PR #260 was promoted by the coordinator/external integration flow and is in `main` as:

```text
6727b0bcb679677d2e481868bfc23ec80bd74214
```

The CRM closure work represented by this evidence did not execute that merge.

M140 restores the frozen Lead Detail aggregate, exact 16 selectable operational stages, all recognized readback labels, 16-step checklist, activity history/manual interaction, edit/stage lifecycle and list-to-detail navigation. It reuses the existing MySQL schema and adds no migration.

### PR #266 — M141 residual equivalence closure

Validated head:

```text
00557b5cfc990331c5af57012e81e0aff2cd4526
```

PR #266 was reconciled directly onto the post-M140 `main`, reached 0 behind and mergeable, and passed the required permanent gates on that exact head. It was subsequently promoted by the coordinator/external integration flow and is in `main` as:

```text
efad48ad30b86febb5e58496c1bcc25feb3937b0
```

This CRM closure work did not execute that merge either.

## Lead optional-field clearing

The frozen V1 Lead Detail submits the full edit form, so an empty optional field is an observable clear command. M141 preserves that browser/API contract while translating empty optional values to SQL `NULL` at the MySQL repository boundary.

This is required especially for `monthlyValue`: the browser sends `""` to mean clear, but the persisted `DECIMAL` column cannot safely accept an empty string.

Regression evidence covers:

- optional text fields may be explicitly empty;
- `companyName` remains required;
- `contactName`, `email`, `notes`, `monthlyValue` and other optional fields persist as cleared values;
- MySQL readback preserves the required company name;
- no new schema or migration is introduced.

## Follow-up send/respond lifecycle

The server already owned the canonical transitions. M141 exposes those transitions in the authenticated Follow-up browser surface rather than creating a second state machine.

Permanent browser evidence proves:

```text
pending -> sent -> responded
```

Negative paths:

```text
pending -> responded directly = 409 INVALID_TRANSITION
viewer -> sent mutation          = 403 READ_ONLY_ROLE
```

Successful browser mutations:

```text
POST /api/crm/follow-ups/:id/sent       = 200
POST /api/crm/follow-ups/:id/responded  = 200
```

Durable MySQL readback ends with:

```text
status = responded
```

The Follow-up surface uses the canonical `createDashboardAuthClient`; no CRM-local authentication client is introduced.

## Object storage decision

The frozen V1 contains a generic `server/storage.ts` helper, but revalidation found no observable CRM surface/router/domain consumer requiring it for the current parity contract.

Therefore the canonical matrix classifies CRM object storage as:

```text
N/A
```

No server adapter was created. This avoids inventing an unused storage dependency merely because a generic template helper exists in the legacy repository.

## CRM-owned AI-assisted content contract

M141 adds a CRM-owned context boundary, not another Assistant implementation.

The contract:

- authorizes the CRM mutation before generation;
- loads the lead and up to five recent CRM interactions as CRM-owned context;
- supports the frozen CRM content intents: Follow-up message, proposal message, contract draft and partnership announcement;
- calls only an injected `CrmSharedAssistantContentPort` capability:

```text
crm.content.generate
```

- bounds generated output;
- audits allowed/denied/provider-failure outcomes;
- contains no provider API key;
- contains no direct provider `fetch`;
- contains no duplicated LLM/provider authority.

This keeps Assistant/shared capability ownership external while CRM owns the authorized business context.

## Auth, security and real persistence

The final permanent browser contract runs against:

```text
MySQL 8.4
authenticated Morro Digital runtime
Platform Auth
```

The M140/M141 proof set includes:

- unauthenticated protected CRM detail denial;
- invalid CSRF denial;
- read-only Viewer mutation denial;
- cross-lead checklist ownership denial;
- forged system/manual event rejection;
- prepared MySQL query paths;
- structured CRM authorization/audit behavior;
- real database readback after browser mutations.

## Responsive, keyboard, accessibility and visual evidence

The permanent `CRM Equivalence Browser Contract` captures and validates:

```text
mobile   390 x 844
tablet   768 x 1024
desktop 1280 x 900
```

For the critical Lead Detail and Follow-up surfaces it verifies:

- no root viewport overflow;
- visible keyboard focus on interactive controls;
- semantic headings and form labels;
- live status regions;
- authenticated browser lifecycle;
- canonical CRM `crm.css` visual treatment;
- responsive one/two/three-column form behavior where applicable;
- HTML `hidden` state is honored via the CRM stylesheet so authenticated pages do not retain ghost loading surfaces;
- screenshots are uploaded as workflow artifacts for visual inspection.

Exact-head pre-merge evidence on `00557b5cfc990331c5af57012e81e0aff2cd4526`:

```text
Quality Gate run: 31935807732 — success
latest duplicate Quality Gate run: 31936023179 — success
CRM Platform Auth Integration Contract run: 31935807760 — success
CRM Lead Detail Browser Contract run: 31935807779 — success
CRM Equivalence Browser Contract run: 31935807756 — success
artifact: 9260636789
artifact digest: sha256:fc8cb030a3b031dcf76b0d5c85473ce3de02f903457f7ba1b7b8221ebef91364
```

Post-merge evidence on `main@efad48ad30b86febb5e58496c1bcc25feb3937b0`:

```text
Quality Gate run: 31936185623 — success
CRM Platform Auth Integration Contract run: 31936185619 — success
CRM Lead Detail Browser Contract run: 31936185643 — success
CRM Equivalence Browser Contract run: 31936185617 — success
artifact: 9260740071
artifact digest: sha256:d3e23f5abdb0008c9507344a66a15ba0f24deff89091e759014052f18355ac43
```

## Canonical score

```text
PASS     24
PARTIAL   0
GAP       0
N/A       1
TOTAL    25
```

No technical CRM parity gap remains.

## Canonical sources synchronized

The merged M141 state agrees across the canonical sources:

- `CRM-MIGRATION-MATRIX.md`: `24 PASS / 0 PARTIAL / 0 GAP / 1 N/A`;
- Feature Registry: `FEATURE-0006.status = equivalent` with behavior/visual/API all `true`;
- `MASTER-MIGRATION-TRACKER.md`: `MIG-0008 = equivalent` with the M141 closure record;
- this evidence record.

Temporary tracker reconciliation tooling was removed before the clean post-M140 reconciliation. Only permanent CRM/runtime/workflow assets remained in the M141 code candidate.

## Migrations

M140:

```text
none
```

M141:

```text
none
```

Both releases reuse the existing CRM MySQL schema.

## Release and rollback readiness

Migration equivalence and release are separate states. Code promotion for the CRM equivalence work is complete:

1. PR #260 / M140 → `6727b0bcb679677d2e481868bfc23ec80bd74214`;
2. PR #266 / M141 → `efad48ad30b86febb5e58496c1bcc25feb3937b0`.

Operational release remains coordinator-controlled: deploy staging through the normal platform release process, smoke authenticated CRM/MySQL behavior and platform health/readiness, and only then release production.

Rollback:

1. revert/deploy back from #266 first;
2. if necessary revert/deploy back from #260;
3. no database down-migration is required because M140/M141 add no schema migration.

## Final rule

`FEATURE-0006` is canonically `equivalent`, not `released`, because matrix, Feature Registry, tracker, exact-head gates and post-merge gates all agree. Any production-release declaration remains outside this CRM equivalence closure and belongs to the coordinator-controlled release process.
