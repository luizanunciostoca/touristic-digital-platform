import { AssistantCapabilityGateway } from "./tools/capability-gateway.js";
import { AssistantToolRegistry } from "./tools/tool-registry.js";
import { createMockDomainTools, type MockDomainDataset } from "./tools/mock-domain-tools.js";
import { AssistantPolicyEngine } from "./policy/policy-engine.js";
import { AssistantEvidenceAggregator } from "./knowledge/evidence.js";
import { MockReasoningProvider } from "./reasoning/provider.js";
import { AssistantPlanValidator } from "./orchestration/planner.js";
import { AssistantOrchestrator } from "./orchestration/orchestrator.js";
import { GroundedResponseComposer } from "./response/response-composer.js";
import { InMemoryTelemetrySink } from "./observability/telemetry.js";
import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "./core/runtime.js";
import { PreparedActionStore } from "./actions/prepared-actions.js";
import { ConfirmationEngine, SandboxActionExecutor } from "./actions/confirmation-engine.js";

export class AssistantVNextApplication {
  readonly registry = new AssistantToolRegistry();
  readonly telemetry = new InMemoryTelemetrySink();
  readonly policy: AssistantPolicyEngine;
  readonly gateway: AssistantCapabilityGateway;
  readonly preparedActions: PreparedActionStore;
  readonly confirmation: ConfirmationEngine;
  readonly sandboxExecutor: SandboxActionExecutor;
  readonly orchestrator: AssistantOrchestrator;

  constructor(
    dataset: MockDomainDataset,
    clock: Clock,
    ids: IdGenerator = {
      next(prefix: string): string {
        return prefix + "_" + randomUUID();
      },
    },
  ) {
    for (const tool of createMockDomainTools(dataset)) this.registry.register(tool);
    this.policy = new AssistantPolicyEngine({
      executeEnabled: false,
      memoryWritesEnabled: false,
      proactiveEnabled: false,
      disabledTools: new Set(),
      unhealthyDomains: new Set(),
    });
    this.gateway = new AssistantCapabilityGateway(this.registry, this.policy);
    this.preparedActions = new PreparedActionStore(clock, ids);
    this.confirmation = new ConfirmationEngine(this.preparedActions);
    this.sandboxExecutor = new SandboxActionExecutor(this.preparedActions);
    this.orchestrator = new AssistantOrchestrator(
      new MockReasoningProvider(),
      this.registry,
      this.gateway,
      new AssistantPlanValidator(this.registry),
      new AssistantEvidenceAggregator(),
      new GroundedResponseComposer(),
      this.telemetry,
      clock,
      this.preparedActions,
    );
  }
}
