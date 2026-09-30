# Capability Gateway

The gateway is the only reasoning-to-domain boundary. It resolves the allowlist, runs policy validation, validates input, enforces timeout/cancellation, validates output and normalizes failures. Planners never call fetch, SQL or DOM directly.
