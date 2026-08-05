import type { AppShellContract } from "./contracts.js";
import { createHeader, type HeaderViewModel } from "./header.js";
import {
  createNavigation,
  type NavigationViewModel,
} from "./navigation.js";

export interface AppShellViewModel {
  readonly type: "app-shell";
  readonly destinationId: string;
  readonly status: AppShellContract["status"];
  readonly header?: HeaderViewModel;
  readonly navigation?: NavigationViewModel;
  readonly overlayOpen: boolean;
  readonly ariaLabel: string;
  readonly hidden: boolean;
}

export function createAppShell(
  contract: AppShellContract,
): AppShellViewModel {
  const destinationId = contract.destinationId.trim();
  if (!destinationId) throw new Error("Destination id is required.");

  return Object.freeze({
    type: "app-shell",
    destinationId,
    status: contract.status,
    ...(contract.header ? { header: createHeader(contract.header) } : {}),
    ...(contract.navigation
      ? { navigation: createNavigation(contract.navigation) }
      : {}),
    overlayOpen: contract.overlayOpen ?? false,
    ariaLabel: contract.ariaLabel?.trim() || `Aplicação ${destinationId}`,
    hidden: contract.hidden ?? false,
  });
}
