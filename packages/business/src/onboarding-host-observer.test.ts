import { describe, expect, it, vi } from "vitest";

import { BusinessOnboardingHostController } from "./onboarding-host.js";

describe("BusinessOnboardingHostController lifecycle observation", () => {
  it("emits committed workflow mutations without reporting blocked transitions", async () => {
    const onChange = vi.fn();
    const host = new BusinessOnboardingHostController({
      onChange,
      beforeTransition: ({ fromStepId }) => fromStepId !== "category",
    });

    await host.next();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ stepId: "category" }),
    );

    host.updateStepInput("category", "events");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ status: "ACTIVE" }),
        stepId: "category",
      }),
    );

    const callsBeforeBlockedMove = onChange.mock.calls.length;
    await host.next();
    expect(host.snapshot().stepId).toBe("category");
    expect(onChange).toHaveBeenCalledTimes(callsBeforeBlockedMove);

    host.pause("user_pause");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ status: "PAUSED" }),
      }),
    );

    host.restart();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ status: "ACTIVE" }),
        stepId: "welcome",
      }),
    );

    host.complete();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });
});
