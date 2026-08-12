# CRM M78 security invariants

- Reuse platform session resolution; do not duplicate Auth.
- Reuse platform Origin/CSRF mutation security.
- Keep viewer mutations denied by CRM RBAC.
- Keep MySQL mandatory for configured CRM runtime.
- Generate proposal share tokens server-side with cryptographic randomness.
- Do not expose tokenized public proposal access in M78.
