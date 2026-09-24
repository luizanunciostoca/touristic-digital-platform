import { describe, expect, it } from "vitest";

import { createAssistantMessageDom } from "./assistant-message-dom.js";

describe("assistant message DOM authority", () => {
  it("shares one presenter pipeline per browser document", () => {
    const document = {} as Document;

    const first = createAssistantMessageDom({ document });
    const second = createAssistantMessageDom({ document });

    expect(second).toBe(first);
  });

  it("keeps custom-clock instances isolated for deterministic tests", () => {
    const document = {} as Document;

    const first = createAssistantMessageDom({ document, now: () => 1 });
    const second = createAssistantMessageDom({ document, now: () => 2 });

    expect(second).not.toBe(first);
  });
});
