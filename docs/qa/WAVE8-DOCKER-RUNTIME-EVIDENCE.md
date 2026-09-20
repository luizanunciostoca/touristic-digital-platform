# Wave 8 — Docker Runtime Startup Evidence

## Finding

The production stage previously launched `apps/morro-digital-platform/dist/browser-entry.js`.
That module is browser-only and dereferences `document` / `window` during initialization, so a successfully built image could still fail immediately as a Node web process.

## Remediation

The production image now launches the same canonical server boundary used by Render:

`node apps/morro-digital-platform/tooling/dev-server.mjs`

## Regression prevention

Two independent gates cover the fix:

1. release-readiness statically requires the server CMD and forbids the browser CMD;
2. Security Scanning builds the canonical image, starts it as a non-root production container, supplies only synthetic release identity plus safe startup variables, and requires `/healthz` to return `status=live` with the exact CI SHA.

The smoke deliberately does not claim `/readyz` because production readiness depends on real databases/providers and must remain fail-closed when those dependencies are absent.

## Release boundary

This proves the Docker application artifact can start the production web process. It does not provision production, configure external secrets, authorize real-money Payments, or replace exact-SHA staging acceptance.
