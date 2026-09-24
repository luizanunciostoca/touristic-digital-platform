import type {
  ConversationPriority,
  ConversationStateSnapshot,
} from "./assistant-conversation-orchestrator.js";

export interface ConversationPolicyInput {
  readonly cause: string;
  readonly source: string;
  readonly previousState: ConversationStateSnapshot;
  readonly now?: number;
  readonly requestedPriority?: ConversationPriority;
}

export interface ConversationPolicyDecision {
  readonly present: boolean;
  readonly speak: boolean;
  readonly priority: ConversationPriority;
  readonly replace: boolean;
  readonly reason: string;
}

const PROACTIVE_COOLDOWN_MS = 5_000;

function priorityForCause(cause: string): ConversationPriority {
  if (
    cause === "payment_started" ||
    cause === "payment_processing" ||
    cause === "payment_approved" ||
    cause === "payment_declined" ||
    cause === "payment_timeout"
  ) {
    return "transaction";
  }
  if (
    cause.startsWith("navigation_") ||
    cause === "route_calculating" ||
    cause === "rerouting" ||
    cause === "near_destination" ||
    cause === "arrived"
  ) {
    return "navigation";
  }
  if (
    cause === "emergency" ||
    cause === "safety_warning" ||
    cause === "provider_error"
  ) {
    return "emergency";
  }
  if (cause === "assistant_response") return "explicit";
  if (cause === "proactive_suggestion") return "proactive";
  if (cause === "passive_information") return "passive";
  return "contextual";
}

export function evaluateConversationPolicy(
  input: ConversationPolicyInput,
): ConversationPolicyDecision {
  const priority = input.requestedPriority ?? priorityForCause(input.cause);
  const now = input.now ?? Date.now();
  const elapsed = Math.max(0, now - input.previousState.timestamp);

  const lowPriority = priority === "proactive" || priority === "passive";
  const present = !lowPriority || elapsed >= PROACTIVE_COOLDOWN_MS;

  const speak =
    present &&
    input.cause !== "navigation_active" &&
    input.cause !== "rerouting" &&
    priority !== "passive";

  return Object.freeze({
    present,
    speak,
    priority,
    replace: priority !== "emergency",
    reason: present ? "allowed" : "low_priority_cooldown",
  });
}
