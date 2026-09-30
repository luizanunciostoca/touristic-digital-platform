# Memory

Layers:

- L0 current turn, RAM
- L1 current session
- L2 device/local
- L3 authenticated account
- L4 durable user-consented preferences
- L5 temporary operational or journey memory

Every record has scope, ownership, source, timestamps, sensitivity, retention policy, writable state and optional TTL. The isolated build uses only an in-memory store; no current database schema or migration is touched.
