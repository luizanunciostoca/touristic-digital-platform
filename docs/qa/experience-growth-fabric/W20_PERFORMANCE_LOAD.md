# W20 — Performance & Load Qualification

Status: candidate on the isolated construction branch.

The deterministic CI load probe executes 24,000 pure-domain operations across
referral resolution, acquisition policy, risk decisions, experiment assignment
and HTTP request guards. Each hot path has a conservative five-second ceiling
for its complete batch to detect pathological regressions without relying on
production traffic or external infrastructure.

This is an isolated qualification, not a production-capacity benchmark.
