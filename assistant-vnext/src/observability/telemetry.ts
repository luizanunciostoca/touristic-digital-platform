export const OBSERVABILITY_EVENTS = [
  "assistant.session.started",
  "assistant.turn.started",
  "assistant.intent.detected",
  "assistant.plan.created",
  "assistant.tool.proposed",
  "assistant.tool.started",
  "assistant.tool.completed",
  "assistant.tool.failed",
  "assistant.action.prepared",
  "assistant.action.confirmed",
  "assistant.action.denied",
  "assistant.response.generated",
  "assistant.fallback.used",
  "assistant.turn.completed",
] as const;
export type AssistantEventName = (typeof OBSERVABILITY_EVENTS)[number];

export interface AssistantTelemetryEvent {
  readonly name: AssistantEventName;
  readonly conversationId: string;
  readonly turnId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly tool?: string;
  readonly result?: string;
  readonly error?: string;
  readonly provider?: string;
}

export interface TelemetrySink {
  emit(event: AssistantTelemetryEvent): void;
}

export class InMemoryTelemetrySink implements TelemetrySink {
  private readonly events: AssistantTelemetryEvent[] = [];
  emit(event: AssistantTelemetryEvent): void {
    this.events.push(Object.freeze({ ...event }));
  }
  snapshot(): readonly AssistantTelemetryEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}
