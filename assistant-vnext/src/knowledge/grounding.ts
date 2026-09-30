import type { AssistantContextEnvelope } from "../context/context-envelope.js";
import type { Result } from "../core/contracts.js";
import { ok } from "../core/contracts.js";
import type { AssistantCapabilityGateway, ToolCallProposal } from "../tools/capability-gateway.js";
import type { ToolExecutionContext } from "../tools/tool-registry.js";
import type { AssistantEvidenceAggregator, EvidenceItem, EvidencePack } from "./evidence.js";

export class AssistantGroundingEngine {
  constructor(
    private readonly gateway: AssistantCapabilityGateway,
    private readonly aggregator: AssistantEvidenceAggregator,
  ) {}

  async retrieve(
    args: Readonly<{
      question: string;
      proposals: readonly ToolCallProposal[];
      requiredFacts: readonly string[];
      context: Readonly<AssistantContextEnvelope>;
      execution: ToolExecutionContext;
      now: Date;
    }>,
  ): Promise<Result<EvidencePack>> {
    const items: EvidenceItem[] = [];
    for (const proposal of args.proposals) {
      const result = await this.gateway.invoke(proposal, args.context, args.execution);
      if (!result.ok) {
        if (result.error.code === "POLICY_DENIED" || result.error.code === "VALIDATION_FAILED") {
          return result;
        }
        continue;
      }
      for (const evidence of result.value.evidence) {
        items.push({
          id: evidence.id,
          source: evidence.source,
          sourceType: evidence.sourceType as EvidenceItem["sourceType"],
          factType: proposal.name,
          retrievedAt: result.value.observedAt,
          ...(result.value.validUntil ? { validUntil: result.value.validUntil } : {}),
          data: result.value.data,
        });
      }
    }
    const pack = this.aggregator.build({
      question: args.question,
      items,
      requiredFacts: args.requiredFacts,
      now: args.now,
    });
    if (pack.missingFacts.length > 0) return this.aggregator.require(pack, args.requiredFacts);
    return ok(pack);
  }
}
