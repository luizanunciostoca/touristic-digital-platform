import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { Clock } from "../core/runtime.js";
import type { Result } from "../core/contracts.js";
import { err, ok } from "../core/contracts.js";
import type { AssistantEvidenceAggregator, EvidencePack } from "../knowledge/evidence.js";
import type { AssistantReasoningProvider, UserRequest } from "../reasoning/provider.js";
import type { GroundedResponseComposer, AssistantResponse } from "../response/response-composer.js";
import type { AssistantCapabilityGateway } from "../tools/capability-gateway.js";
import type { AssistantToolRegistry, ToolExecutionContext } from "../tools/tool-registry.js";
import type { AssistantPlanValidator } from "./planner.js";
import type { TelemetrySink } from "../observability/telemetry.js";
import type { PreparedActionStore, PreparedAction } from "../actions/prepared-actions.js";

export class AssistantOrchestrator {
  constructor(
    private readonly provider: AssistantReasoningProvider,
    private readonly registry: AssistantToolRegistry,
    private readonly gateway: AssistantCapabilityGateway,
    private readonly validator: AssistantPlanValidator,
    private readonly evidenceAggregator: AssistantEvidenceAggregator,
    private readonly composer: GroundedResponseComposer,
    private readonly telemetry: TelemetrySink,
    private readonly clock: Clock,
    private readonly preparedActions?: PreparedActionStore,
  ) {}

  async run(
    args: Readonly<{
      request: UserRequest;
      context: Readonly<AssistantContextEnvelope>;
      execution: ToolExecutionContext;
    }>,
  ): Promise<Result<AssistantResponse>> {
    const started = this.clock.now();
    const emit = (name: Parameters<TelemetrySink["emit"]>[0]["name"], extra = {}) =>
      this.telemetry.emit({
        name,
        conversationId: args.execution.conversationId,
        turnId: args.execution.turnId,
        correlationId: args.execution.correlationId,
        timestamp: this.clock.now().toISOString(),
        ...extra,
      });

    emit("assistant.turn.started");
    const understood = await this.provider.understand(args.request, args.context);
    if (!understood.ok) return understood;
    emit("assistant.intent.detected", { result: understood.value.intent, provider: "mock" });

    const available = this.registry.list().map((tool) => tool.name);
    const planned = await this.provider.plan(
      args.request,
      understood.value,
      args.context,
      available,
    );
    if (!planned.ok) return planned;
    const validated = this.validator.validate(planned.value);
    if (!validated.ok) {
      emit("assistant.fallback.used", { error: validated.error.code });
      return validated;
    }
    emit("assistant.plan.created", { result: validated.value.goal });

    const evidenceItems = [];
    let preparedAction: PreparedAction | undefined;
    for (const step of validated.value.steps) {
      emit("assistant.tool.proposed", { tool: step.tool });
      emit("assistant.tool.started", { tool: step.tool });
      const result = await this.gateway.invoke(
        { name: step.tool, version: step.version, arguments: step.input },
        args.context,
        args.execution,
      );
      if (!result.ok) {
        emit("assistant.tool.failed", { tool: step.tool, error: result.error.code });
        if (result.error.code === "POLICY_DENIED" || result.error.code === "VALIDATION_FAILED")
          return result;
        continue;
      }
      emit("assistant.tool.completed", { tool: step.tool, result: "ok" });
      if (step.effect === "prepare" && this.preparedActions) {
        preparedAction = this.preparedActions.prepare({
          type: step.tool,
          tool: step.tool,
          toolVersion: step.version,
          requestedBy: args.context.user.userId ?? "anonymous",
          input: step.input,
          summary: "Prepared action: " + step.tool,
          requiresConfirmation: true,
          confirmationText: "Confirm " + step.tool + "?",
          expiresInMs: 5 * 60 * 1000,
          contextFingerprint: args.context.metadata.contextFingerprint,
          sessionId: args.context.session.sessionId,
        });
        emit("assistant.action.prepared", { tool: step.tool, result: preparedAction.id });
      }
      for (const ref of result.value.evidence) {
        evidenceItems.push({
          id: ref.id,
          source: ref.source,
          sourceType: ref.sourceType as
            | "place"
            | "business"
            | "content"
            | "weather"
            | "commerce"
            | "ticketing"
            | "navigation"
            | "profile"
            | "payments",
          factType: step.tool,
          retrievedAt: result.value.observedAt,
          ...(result.value.validUntil ? { validUntil: result.value.validUntil } : {}),
          data: result.value.data,
        });
      }
    }

    let evidence: EvidencePack | null = null;
    if (validated.value.requiredEvidence.length > 0) {
      evidence = this.evidenceAggregator.build({
        question: args.request.text,
        items: evidenceItems,
        requiredFacts: validated.value.requiredEvidence,
        now: this.clock.now(),
      });
      const enough = this.evidenceAggregator.require(evidence, validated.value.requiredEvidence);
      if (!enough.ok) return enough;
    }

    const draft = await this.provider.compose(
      args.request,
      validated.value,
      evidence,
      args.context,
    );
    if (!draft.ok) return draft;
    if (!draft.value.message.trim())
      return err("PROVIDER_ERROR", "Provider returned an empty response");

    const response = this.composer.compose({
      message: draft.value.message,
      ...(draft.value.options ? { options: draft.value.options } : {}),
      evidence,
      ...(preparedAction ? { preparedAction } : {}),
      generatedAt: this.clock.now().toISOString(),
    });
    emit("assistant.response.generated", { result: response.metadata.mode });
    emit("assistant.turn.completed", {
      durationMs: Math.max(0, this.clock.now().getTime() - started.getTime()),
    });
    return ok(response);
  }
}
