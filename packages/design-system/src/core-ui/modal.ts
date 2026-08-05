import type { ModalContract } from "./contracts.js";

export interface ModalViewModel {
  readonly type: "modal";
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel: string;
  readonly dismissible: boolean;
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

export function createModal(contract: ModalContract): ModalViewModel {
  const title = contract.title.trim();
  const closeLabel = contract.closeLabel.trim();

  if (!title) throw new Error("Modal title is required.");
  if (!closeLabel) throw new Error("Modal close label is required.");

  return Object.freeze({
    type: "modal",
    open: contract.open,
    title,
    ...(contract.description?.trim()
      ? { description: contract.description.trim() }
      : {}),
    closeLabel,
    dismissible: contract.dismissible ?? true,
    ariaLabel: contract.ariaLabel?.trim() || title,
    hidden: contract.hidden ?? !contract.open,
  });
}
