# Morro Code Review Skill

Use this review checklist for every Morro Digital change.

## Assistant / conversational review

- Trace event -> reducer/state -> orchestrator -> response -> single presenter.
- Flag direct DOM copy from Explore, Navigation, Search, Place, Payments, Geolocation or Network when it bypasses conversation authority.
- Verify previous turn/category/place/intent are preserved where relevant.
- Verify back/return/navigation completion do not reset to greeting.
- Verify async work has sequence or cancellation semantics.
- Flag technical public phrases such as "Categoria selecionada:", "state changed", "navigation active", internal codes or generic "Escolher ação".
- Require semantic browser coverage for new conversation transitions, not string-existence tests only.

## Platform / security review

- Preserve canonical owner and multi-tenant isolation.
- Reject client-authoritative mutation, cross-business/destination access and secret exposure.
- Treat auth, payments, dependency, Docker, schema and CI/CD changes as high/critical risk.

## CI selection review

- Compare changed paths against tooling/ci/test-impact-manifest.json.
- If a path is unmapped, fail closed to full regression.
- Require Assistant continuity + related Navigation/Explore coverage when assistant conversation authority changes.
- Do not accept repeated full builds where an immutable candidate artifact can be reused.

## Release review

- Exact commit SHA and tree SHA must be recorded.
- Candidate artifact digest and lockfile digest must be recorded.
- Staging and production must promote the same certified artifact.
- Final release acceptance verifies evidence; it should not silently create a different candidate.
