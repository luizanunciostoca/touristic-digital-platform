---
name: morro-tenant-security
description: Audit and prove server-enforced authentication, authorization, tenant and destination isolation.
---

# morro-tenant-security

## Purpose

Prevent cross-tenant leakage and client-side authority.

## Inputs

- Affected endpoints/services
- auth/session contracts
- tenant/destination ownership
- negative test matrix

## Allowed operations

- Inspect code
- Add claimed security tests
- Run non-destructive adversarial checks

## Forbidden operations

- Expose secrets
- Relax authorization
- Use UI filtering as authorization
- Destructive production actions

## Acceptance criteria

- Scope enforced server-side
- Negative isolation paths fail closed
- Session/authz checks pass
- No secret exposure

## Evidence format

- ChangeSet ID.
- Exact base/head/source SHA as applicable.
- Command, workflow run, or runtime target.
- Timestamp, result, and residual blockers.

## Failure states

- TENANT_LEAK
- AUTHZ_BYPASS
- CLIENT_AUTHORITY
- SECRET_EXPOSURE
