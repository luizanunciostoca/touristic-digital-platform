---
name: morro-tenant-security
description: Audits and proves server-enforced tenant, destination, session and authorization boundaries.
---

# morro-tenant-security

## Purpose
Prevent cross-tenant leakage and client-side authorization assumptions.

## Inputs
- Affected APIs
- tenant/destination model
- auth/session contracts
- negative test matrix

## Allowed operations
- Read code
- Add deterministic security tests under an active claim
- Run adversarial non-destructive tests

## Forbidden operations
- Expose secrets
- Relax authorization
- Use UI filtering as authorization
- Perform destructive production actions

## Acceptance criteria
- Server scope explicit
- Negative cross-tenant paths fail closed
- Session/authz tests green
- No secret exposure

## Evidence format
- ChangeSet ID
- exact source/base/head SHA as applicable
- command/workflow/runtime target
- timestamp
- result and residual blockers

## Failure states
- TENANT_LEAK
- AUTHZ_BYPASS
- CLIENT_AUTHORITY
- SECRET_EXPOSURE
