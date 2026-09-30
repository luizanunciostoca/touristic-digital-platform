# Future database design

The file schemas/assistant-vnext-future.sql is a design artifact only. It is intentionally not referenced by the current migration system and must not be applied during the isolated-build mission. A separately authorized integration phase must review tenancy, retention, encryption, least privilege, migration ordering and rollback before any schema reaches a database.
