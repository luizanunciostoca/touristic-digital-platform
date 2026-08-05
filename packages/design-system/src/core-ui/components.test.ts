import { describe, expect, it } from "vitest";

import { createAppShell } from "./app-shell.js";
import { createHeader } from "./header.js";
import { createNavigation } from "./navigation.js";

describe("Core UI builders", () => {
  it("creates an immutable header model", () => {
    const header = createHeader({ title: "Morro Digital" });

    expect(header.title).toBe("Morro Digital");
    expect(header.ariaLabel).toBe("Morro Digital");
    expect(Object.isFrozen(header)).toBe(true);
  });

  it("rejects navigation with duplicate ids", () => {
    expect(() =>
      createNavigation({
        items: [
          { id: "home", label: "Início", href: "/" },
          { id: "home", label: "Mapa", href: "/mapa" },
        ],
      }),
    ).toThrow("Navigation item ids must be unique.");
  });

  it("composes AppShell, Header and Navigation", () => {
    const shell = createAppShell({
      destinationId: "morro-de-sao-paulo",
      status: "success",
      header: { title: "Morro Digital" },
      navigation: {
        items: [{ id: "home", label: "Início", href: "/", active: true }],
      },
    });

    expect(shell.destinationId).toBe("morro-de-sao-paulo");
    expect(shell.header?.title).toBe("Morro Digital");
    expect(shell.navigation?.activeItemId).toBe("home");
    expect(shell.overlayOpen).toBe(false);
  });
});
