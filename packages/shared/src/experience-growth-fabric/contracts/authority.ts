export type EventTrustClass =
  | "behavioral"
  | "session_verified"
  | "experience_verified"
  | "financial_authoritative";

export type ValueActionClass =
  | "telemetry"
  | "low_risk_progress"
  | "experience_value"
  | "financial_consequence";

const TRUST_RANK: Record<EventTrustClass, number> = {
  behavioral: 0,
  session_verified: 1,
  experience_verified: 2,
  financial_authoritative: 3,
};

const REQUIRED_TRUST: Record<ValueActionClass, EventTrustClass> = {
  telemetry: "behavioral",
  low_risk_progress: "session_verified",
  experience_value: "experience_verified",
  financial_consequence: "financial_authoritative",
};

export function canTrustClassAuthorize(
  trust: EventTrustClass,
  action: ValueActionClass,
): boolean {
  return TRUST_RANK[trust] >= TRUST_RANK[REQUIRED_TRUST[action]];
}

export type DecisionActor =
  | "browser"
  | "llm"
  | "deterministic_service"
  | "financial";

export function actorMayAuthorizeValue(
  actor: DecisionActor,
  action: ValueActionClass,
): boolean {
  if (action === "telemetry") return true;
  if (action === "financial_consequence") return actor === "financial";
  return actor === "deterministic_service" || actor === "financial";
}
