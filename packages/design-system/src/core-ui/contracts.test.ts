import { describe, expect, it } from "vitest";

import type { AppShellContract, ModalContract } from "./contracts.js";

describe("Core UI contracts", () => {
  it("represents a destination-aware application shell", () => {
    const shell: AppShellContract = {
      destinationId: "morro-de-sao-paulo",
      status: "loading",
      header: { title: "Morro Digital" },
      navigation: {
        items: [{ id: "map", label: "Mapa", href: "/map" }],
      },
    };

    expect(shell.destinationId).toBe("morro-de-sao-paulo");
    expect(shell.navigation?.items[0]?.id).toBe("map");
  });

  it("requires an accessible close label for modals", () => {
    const modal: ModalContract = {
      open: true,
      title: "Detalhes da empresa",
      closeLabel: "Fechar detalhes da empresa",
      dismissible: true,
    };

    expect(modal.closeLabel).toContain("Fechar");
  });
});
