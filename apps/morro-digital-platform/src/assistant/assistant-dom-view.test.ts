import { describe, expect, it } from "vitest";

import { sanitizeAssistantRenderableHtml } from "./assistant-dom-view.js";

describe("assistant DOM view", () => {
  it("preserves the small formatting subset used by audited V1 responses", () => {
    expect(
      sanitizeAssistantRenderableHtml(
        "💰 <b>Segunda Praia</b><br><strong>R$ 80-150</strong><br /><em>por pessoa</em>",
      ),
    ).toBe(
      "💰 <b>Segunda Praia</b><br><strong>R$ 80-150</strong><br><em>por pessoa</em>",
    );
  });

  it("escapes executable or attributed markup instead of trusting response HTML", () => {
    const result = sanitizeAssistantRenderableHtml(
      '<script>alert(1)</script><b onclick="alert(2)">unsafe</b><img src=x onerror=alert(3)>',
    );

    expect(result).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result).toContain("&lt;b onclick=&quot;alert(2)&quot;&gt;unsafe</b>");
    expect(result).toContain("&lt;img src=x onerror=alert(3)&gt;");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("onclick=");
  });
});
