import type { FeedbackContract } from "./contracts.js";
import { createAction, type ActionViewModel } from "./action.js";

export interface FeedbackViewModel {
  readonly type: "feedback";
  readonly status: FeedbackContract["status"];
  readonly title: string;
  readonly message?: string;
  readonly action?: ActionViewModel;
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

const defaultTitles: Record<FeedbackContract["status"], string> = {
  loading: "Carregando",
  success: "Concluído",
  empty: "Nenhum resultado",
  error: "Não foi possível concluir",
};

export function createFeedback(
  contract: FeedbackContract,
): FeedbackViewModel {
  const title = contract.title?.trim() || defaultTitles[contract.status];

  return Object.freeze({
    type: "feedback",
    status: contract.status,
    title,
    ...(contract.message?.trim()
      ? { message: contract.message.trim() }
      : {}),
    ...(contract.action ? { action: createAction(contract.action) } : {}),
    ariaLabel: contract.ariaLabel?.trim() || title,
    hidden: contract.hidden ?? false,
  });
}
