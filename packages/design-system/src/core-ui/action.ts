import type { ActionContract } from "./contracts.js";

export interface ActionViewModel {
  readonly type: "action";
  readonly label: string;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly size: NonNullable<ActionContract["size"]>;
  readonly variant: NonNullable<ActionContract["variant"]>;
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

export function createAction(contract: ActionContract): ActionViewModel {
  const label = contract.label.trim();
  if (!label) throw new Error("Action label is required.");

  const loading = contract.loading ?? false;

  return Object.freeze({
    type: "action",
    label,
    disabled: (contract.disabled ?? false) || loading,
    loading,
    size: contract.size ?? "md",
    variant: contract.variant ?? "primary",
    ariaLabel: contract.ariaLabel?.trim() || label,
    hidden: contract.hidden ?? false,
  });
}
