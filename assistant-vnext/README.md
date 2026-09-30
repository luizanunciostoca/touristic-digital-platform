# Morro Digital Assistant VNext - Isolated Harness

This directory is a parallel, zero-touch implementation of the next assistant architecture.

It is intentionally outside the root pnpm workspace globs and has no import or registration in the current Morro Digital runtime.

## Invariants

- Current runtime files are not modified.
- No production endpoint is called by default.
- No real external effect can execute.
- Facts are represented as evidence.
- Tools are allowlisted, schema validated, policy checked and invoked only through the capability gateway.
- Effectful flows use PREPARE -> CONFIRM -> EXECUTE and idempotency.
- Unknown or unsafe states fail closed.
- The isolated application uses mocks or fixtures only.

## Commands

    npm install
    npm run format
    npm run check

The guard:zero-touch command verifies that branch changes are contained in assistant-vnext/.

## Ownership

Morro Digital engineering. This package remains non-authoritative until a separately authorized cutover.
