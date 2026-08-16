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

- Quality Gate draft: success;
- CRM Platform Auth Integration Contract: success;
- CRM Lead Detail Browser Contract: success;
- temporary ready-for-review full Quality: success, including repository tests and build;
- returned to draft;
- no merge performed by the CRM closure chat.

M140 restores the frozen Lead Detail aggregate, exact 16 selectable operational stages, all recognized readback labels, 16-step checklist, activity history/manual interaction, edit/stage lifecycle and list-to-detail navigation. It reuses the existing MySQL schema and adds no migration.

### PR #266 — M141 residual equivalence closure

Branch:

```text
feat/crm-m141-equivalence-closure
```

Base:

```text
feat/crm-m140-lead-detail-activity
```

The PR is intentionally stacked so the coordinator can promote #260 before #266.

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

The successful functional/visual evidence run before final documentation promotion was:

```text
CRM Equivalence Browser Contract run #17
run id: 31935098886
head: 5d5be68de1bd84f4ca3eb87f41a30abbf6b8319e
artifact id: 9260428935
artifact digest: sha256:744f12b4d11d5a73a722c60b658859c9b515d616126c83f50dd4e6eedee84ec2
```

The authenticated hidden-state fix is frozen by the M141 static contract and the permanent browser workflow is required again on this final promotion commit.

## Canonical score

```text
PASS     24
PARTIAL   0
GAP       0
N/A       1
TOTAL    25
```

No technical CRM parity gap remains after the final exact-head gates.

## Canonical sources synchronized

The final promotion candidate requires and now contains the same state in all canonical sources:

- `CRM-MIGRATION-MATRIX.md`: `24 PASS / 0 PARTIAL / 0 GAP / 1 N/A`;
- Feature Registry: `FEATURE-0006.status = equivalent` with behavior/visual/API all `true`;
- `MASTER-MIGRATION-TRACKER.md`: `MIG-0008 = equivalent` with the M141 closure record;
- this evidence record.

Temporary tracker reconciliation tooling was removed before this sealing commit. Only permanent CRM/runtime/workflow assets remain in the candidate branch.

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

Migration equivalence and release are separate states.

Coordinator promotion order:

1. merge/promote PR #260;
2. revalidate #266 against the resulting `main` and promote it;
3. deploy staging through the normal platform release process;
4. require permanent Quality, Platform Auth, CRM Lead Detail Browser and CRM Equivalence Browser gates;
5. smoke authenticated CRM/MySQL behavior and platform health/readiness;
6. release production only through the coordinator-controlled process.

Rollback:

1. revert/deploy back from #266 first;
2. if necessary revert/deploy back from #260;
3. no database down-migration is required because M140/M141 add no schema migration.

## Promotion rule

`FEATURE-0006` is eligible for `equivalent` only when all of the following agree on the final PR head:

- this evidence;
- `CRM-MIGRATION-MATRIX.md`;
- Feature Registry;
- `MASTER-MIGRATION-TRACKER.md`;
- permanent CRM browser/auth checks;
- full Quality including tests and build;
- PR remains coordinator-controlled and unmerged by this chat.
