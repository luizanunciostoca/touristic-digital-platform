# Chat 7 — Runtime Startup Performance Evidence

## Scope

This wave activates the runtime budgets already declared by the Chat 7 performance foundation for:

- Assistant startup;
- map startup.

The existing versioned budget file defines:

- Assistant startup <= 5000 ms;
- map startup <= 15000 ms.

This wave does not invent new thresholds.

## Measurement points

Timing is navigation-relative through `performance.now()`.

Assistant readiness is recorded immediately after the V1 Assistant shell is installed.

Map readiness is recorded only after the browser provider has started successfully and the application has connected its geospatial engine, immediately before the runtime enters its ready state.

Each metric is also exposed as:

- a `performance.mark`;
- a `document.documentElement.dataset` value;
- a `morro:startup-performance` browser event.

The marks contain only metric name and duration; no user data is collected.

## Chromium contract

The dedicated workflow:

1. builds the workspace;
2. starts the real Mapbox browser runtime with the existing CI public token;
3. launches deterministic Chromium;
4. waits for real-map readiness;
5. validates both startup timings;
6. enforces the existing runtime thresholds;
7. rejects duplicate/missing marks;
8. rejects browser runtime errors;
9. uploads a JSON evidence report.

## Boundary

These are deterministic CI startup budgets, not a substitute for production field performance.

Final production performance should continue to evaluate LCP/INP/CLS and real-device/network behavior separately.
