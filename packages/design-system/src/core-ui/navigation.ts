import type {
  NavigationContract,
  NavigationItemContract,
} from "./contracts.js";

export interface NavigationViewModel {
  readonly type: "navigation";
  readonly items: readonly NavigationItemContract[];
  readonly expanded: boolean;
  readonly orientation: "horizontal" | "vertical";
  readonly activeItemId?: string;
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

export function createNavigation(
  contract: NavigationContract,
): NavigationViewModel {
  const ids = contract.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Navigation item ids must be unique.");
  }

  const activeItems = contract.items.filter((item) => item.active);
  if (activeItems.length > 1) {
    throw new Error("Navigation accepts only one active item.");
  }

  for (const item of contract.items) {
    if (!item.id.trim() || !item.label.trim() || !item.href.trim()) {
      throw new Error("Navigation items require id, label and href.");
    }
  }

  return Object.freeze({
    type: "navigation",
    items: Object.freeze([...contract.items]),
    expanded: contract.expanded ?? false,
    orientation: contract.orientation ?? "vertical",
    ...(activeItems[0] ? { activeItemId: activeItems[0].id } : {}),
    ariaLabel: contract.ariaLabel?.trim() || "Navegação principal",
    hidden: contract.hidden ?? false,
  });
}
