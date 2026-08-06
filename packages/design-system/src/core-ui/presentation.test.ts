import { describe, expect, it } from "vitest";

import { createAction } from "./action.js";
import { createFeedback } from "./feedback.js";
import { createModal } from "./modal.js";

describe("core ui presentation models", () => {
  it("disables an action while loading", () => {
    const action = createAction({ label: "Continuar", loading: true });

    expect(action.disabled).toBe(true);
    expect(action.variant).toBe("primary");
    expect(Object.isFrozen(action)).toBe(true);
  });

  it("creates an accessible modal with safe defaults", () => {
    const modal = createModal({
      open: true,
      title: "Detalhes do local",
      closeLabel: "Fechar",
    });

    expect(modal.dismissible).toBe(true);
    expect(modal.hidden).toBe(false);
    expect(modal.ariaLabel).toBe("Detalhes do local");
  });

  it("uses a default title for feedback and composes its action", () => {
    const feedback = createFeedback({
      status: "error",
      message: "Tente novamente.",
      action: { label: "Repetir", variant: "secondary" },
    });

    expect(feedback.title).toBe("Não foi possível concluir");
    expect(feedback.action?.variant).toBe("secondary");
  });

  it("rejects incomplete presentation contracts", () => {
    expect(() => createAction({ label: "   " })).toThrow(
      "Action label is required.",
    );
    expect(() =>
      createModal({ open: true, title: "Modal", closeLabel: "   " }),
    ).toThrow("Modal close label is required.");
  });
});
