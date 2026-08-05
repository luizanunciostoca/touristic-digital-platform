import type { ActionContract, HeaderContract } from "./contracts.js";

export interface HeaderViewModel {
  readonly type: "header";
  readonly title: string;
  readonly subtitle?: string;
  readonly logoAlt?: string;
  readonly actions: readonly ActionContract[];
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

export function createHeader(contract: HeaderContract): HeaderViewModel {
  const title = contract.title.trim();
  if (!title) throw new Error("Header title is required.");

  return Object.freeze({
    type: "header",
    title,
    ...(contract.subtitle?.trim()
      ? { subtitle: contract.subtitle.trim() }
      : {}),
    ...(contract.logoAlt?.trim() ? { logoAlt: contract.logoAlt.trim() } : {}),
    actions: Object.freeze([...(contract.actions ?? [])]),
    ariaLabel: contract.ariaLabel?.trim() || title,
    hidden: contract.hidden ?? false,
  });
}
