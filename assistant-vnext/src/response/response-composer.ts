import type { EvidencePack } from "../knowledge/evidence.js";
import type { PreparedAction } from "../actions/prepared-actions.js";

export interface AssistantOption {
  readonly id: string;
  readonly label: string;
}

export interface AssistantCard {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly data?: unknown;
}

export interface AssistantResponse {
  readonly message: string;
  readonly voice?: string;
  readonly options?: readonly AssistantOption[];
  readonly cards?: readonly AssistantCard[];
  readonly mapActions?: readonly unknown[];
  readonly navigationAction?: unknown;
  readonly commerceAction?: unknown;
  readonly preparedAction?: PreparedAction;
  readonly evidence: readonly Readonly<{ id: string; source: string; sourceType: string }>[];
  readonly metadata: Readonly<{
    grounded: boolean;
    evidenceCount: number;
    generatedAt: string;
    mode: "deterministic" | "grounded" | "action" | "fallback";
  }>;
}

export class GroundedResponseComposer {
  compose(
    args: Readonly<{
      message: string;
      options?: readonly string[];
      evidence: EvidencePack | null;
      preparedAction?: PreparedAction;
      generatedAt: string;
    }>,
  ): AssistantResponse {
    const refs =
      args.evidence?.items.map((item) => ({
        id: item.id,
        source: item.source,
        sourceType: item.sourceType,
      })) ?? [];
    return {
      message: args.message,
      ...(args.options
        ? {
            options: args.options.map((label, index) => ({
              id: "option-" + String(index + 1),
              label,
            })),
          }
        : {}),
      ...(args.preparedAction ? { preparedAction: args.preparedAction } : {}),
      evidence: refs,
      metadata: {
        grounded: refs.length > 0,
        evidenceCount: refs.length,
        generatedAt: args.generatedAt,
        mode: args.preparedAction ? "action" : refs.length > 0 ? "grounded" : "deterministic",
      },
    };
  }
}
