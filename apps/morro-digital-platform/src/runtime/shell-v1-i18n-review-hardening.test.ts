import { describe, expect, it } from "vitest";

import { applyV1ShellPresentation } from "./shell-v1-i18n.js";

describe("shell i18n review hardening", () => {
  it("ignores inherited Object.prototype keys used as data-i18n hooks", () => {
    document.body.innerHTML = '<div id="probe" data-i18n="toString">UNKNOWN_KEY_SENTINEL</div>';
    document.documentElement.lang = "en-US";

    applyV1ShellPresentation(document);

    expect(document.getElementById("probe")?.textContent).toBe(
      "UNKNOWN_KEY_SENTINEL",
    );
  });
});
