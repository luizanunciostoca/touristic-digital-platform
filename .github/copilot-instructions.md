# Morro Digital Copilot Repository Instructions

## Engineering invariants

- Treat canonical domain owners as authority; never create a second source of truth.
- Preserve exact IDs, tenant/destination boundaries and server-side authorization.
- Never bypass release governance, required checks, exact-head proof or target identity.
- Prefer small semantic changes with focused evidence over broad rewrites.

## Conversation architecture

- User/domain actions must flow through context reduction and the conversation authority before presentation.
- The Assistant must preserve session context even when only one message is visible.
- New public messages require a conversation cause, message key and turn linkage.
- Do not add a presenter that writes competing Assistant copy directly to the DOM.
- Do not resurrect welcome copy after a meaningful turn without an explicit new-session cause.
- Async responses must be associated with a sequence/turn and dropped if superseded.
- Public copy must be conversational; avoid technical state labels, error codes and internal names.
- Back, navigation-end, offline/online and payment flows must preserve conversational continuity.
- Deterministic critical flows (navigation, payment, geolocation, errors) must not depend on an LLM.

## CI / test impact

- Classify changes by affected domain and risk using tooling/ci/test-impact-manifest.json.
- Unknown impact is fail-closed and requires full regression.
- Assistant conversation changes require focused unit tests plus the continuity browser contract.
- Shared state, auth, payments, release governance, schemas, Docker or dependency changes widen coverage.
- Reuse evidence only when source identity/tree equivalence is proven.
- Build a release candidate once and promote the same immutable artifact; do not rebuild per environment.

## Review questions

1. Who owns this state/message?
2. What previous context is preserved?
3. Can a stale async result overwrite a newer turn?
4. Is there a duplicate presenter?
5. Is public copy conversational rather than technical?
6. Is tenant/destination scope explicit?
7. Is test selection sufficient for direct and indirect impact?
8. Does any change weaken exact-head, artifact, security or deployment-target proof?
