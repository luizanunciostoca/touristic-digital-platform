import { describe, expect, it } from "vitest";

import {
  BusinessOnboardingHostController,
  type BusinessOnboardingHostSnapshot,
} from "./onboarding-host.js";

describe("BusinessOnboardingHostController lifecycle observation", () => {
  it("emits committed workflow mutations without reporting blocked transitions", async () => {
    const observed: BusinessOnboardingHostSnapshot[] = [];
    const host = new BusinessOnboardingHostController({
      onChange: (snapshot) => observed.push(snapshot),
      beforeTransition: ({ fromStepId }) => fromStepId !== "category",
    });

    await host.next();
    expect(observed.at(-1)?.stepId).toBe("category");

    host.updateStepInput("category", "events");
    expect(observed.at(-1)?.stepId).toBe("category");
    expect(observed.at(-1)?.session.status).toBe("ACTIVE");

    const callsBeforeBlockedMove = observed.length;
    await host.next();
    expect(host.snapshot().stepId).toBe("category");
    expect(observed).toHaveLength(callsBeforeBlockedMove);

    host.pause("user_pause");
    expect(observed.at(-1)?.session.status).toBe("PAUSED");

    host.restart();
    expect(observed.at(-1)?.session.status).toBe("ACTIVE");
    expect(observed.at(-1)?.stepId).toBe("welcome");

    host.complete();
    expect(observed.at(-1)?.session.status).toBe("COMPLETED");
  });
});
