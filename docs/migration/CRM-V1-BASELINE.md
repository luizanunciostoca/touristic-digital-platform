# CRM V1 Baseline — M67

## Canonical source

The CRM V1 baseline is frozen from the separate repository:

- repository: `luizidebook/morro-digital-crm`;
- commit: `1915d0260c79f30a63b926a1123e609083587745`;
- commit date: 2026-07-07;
- target V2 feature: `FEATURE-0006` / `MIG-0008`;
- intended target: `apps/admin-crm` plus framework-independent CRM packages/services as needed.

This source must remain immutable for parity decisions. Later changes in the legacy CRM do not silently redefine the migration baseline.

## V1 architecture inventory

The frozen CRM is a standalone full-stack application with:

- React 19 client built with Vite;
- Wouter routing;
- TanStack Query + tRPC client/server contracts;
- Express server runtime;
- Drizzle ORM with MySQL;
- Zod validation;
- Radix UI primitives and Tailwind-based presentation;
- Recharts analytics;
- S3-compatible object storage integration;
- scheduled automation handlers;
- AI-assisted CRM behavior;
- Vitest server regression coverage.

The V2 migration must preserve observable behavior while conforming to Touristic Digital Platform ownership boundaries. The V1 framework/library choices are evidence, not mandatory V2 architecture.

## Browser route inventory

The frozen `client/src/App.tsx` exposes these primary routes:

1. `/` — Dashboard;
2. `/leads` — Leads;
3. `/leads/:id` — Lead detail;
4. `/meetings` — Meetings;
5. `/proposals` — Proposals;
6. `/proposals/view/:token` — public/token proposal view;
7. `/contracts` — Contracts;
8. `/contracts/view/:token` — public/token contract view;
9. `/follow-ups` — Follow-ups;
10. `/trials` — Trials;
11. `/referrals` — Referrals;
12. `/settings` — Settings;
13. `/404` and fallback — Not found.

## Domain inventory

### Dashboard and pipeline

The CRM exposes operational dashboard metrics and funnel/pipeline state. Lead detail supports the full 16-stage selector present in the frozen baseline.

### Leads

Lead list/detail behavior includes identity/contact information, stage lifecycle, activity/history and downstream relationships used by meetings, proposals, contracts, follow-ups, trials and referrals.

### Meetings

Meetings can be created directly and have lifecycle actions for completed, no-show and cancelled states.

### Proposals

The CRM owns proposal creation/lifecycle and tokenized public proposal viewing. Accepted proposals may be associated with contracts for pipeline traceability.

### Contracts

Contracts include creation, proposal linkage, tokenized public viewing, signing-related lifecycle and cancellation for eligible statuses.

### Follow-ups

Follow-ups include manual creation, scheduling, generated messaging, sent state, lead-response state and configurable automation behavior.

### Trials

Trials include creation/lifecycle and explicit convert, cancel and expire operations, with scheduled expiry checks.

### Referrals

Referrals include status management, editing, referred-lead linkage, contacted/lost transitions and benefit granting.

### Settings and automation

Settings govern CRM operational behavior including follow-up automation. The frozen source documents scheduled handlers for follow-up checks and trial expiry. Cron execution must remain protected and fail closed.

## Server/runtime inventory

Primary frozen server sources include:

- `server/routers.ts` — tRPC API surface;
- `server/db.ts` — persistence access;
- `server/scheduledHandlers.ts` — scheduled automation behavior;
- `server/storage.ts` — object storage boundary;
- `server/_core/*` — host/runtime/auth infrastructure;
- `server/crm.test.ts` and auth regression tests.

The V2 must not copy host-specific authentication or deployment glue blindly. Authentication/session behavior should reuse the platform Auth boundary where applicable, and CRM-specific authorization must remain server-authoritative.

## Security and ownership rules for migration

- Browser code must never become the authority for user identity, permissions or record ownership.
- Tokenized proposal/contract views must preserve bounded, revocable or otherwise server-validated access semantics from the audited source before being exposed in V2.
- Scheduled endpoints must not become public unauthenticated mutation surfaces.
- Database and object-storage credentials remain server-only.
- AI-generated CRM content must not bypass authorization, validation or audit boundaries.
- CRM must not reimplement platform Auth primitives if `FEATURE-0008` already owns the needed contract.

## Initial migration decision

M67 is inventory/baseline only. It does not claim any CRM V2 parity and does not create `apps/admin-crm` yet. The safe next step is to freeze the domain/API contract and persistence model before mounting browser surfaces.
