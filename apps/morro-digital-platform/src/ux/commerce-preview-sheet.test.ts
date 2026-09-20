import { describe, expect, it } from "vitest";

import {
  cycleCommercePreviewSheetState,
  stepCommercePreviewSheetState,
} from "./commerce-preview-sheet.js";

describe("Commerce preview bottom sheet state", () => {
  it("cycles through peek, half and full states", () => {
    expect(cycleCommercePreviewSheetState("peek")).toBe("half");
    expect(cycleCommercePreviewSheetState("half")).toBe("full");
    expect(cycleCommercePreviewSheetState("full")).toBe("peek");
  });

  it("expands and collapses without leaving the supported state range", () => {
    expect(stepCommercePreviewSheetState("peek", "collapse")).toBe("peek");
    expect(stepCommercePreviewSheetState("peek", "expand")).toBe("half");
    expect(stepCommercePreviewSheetState("half", "expand")).toBe("full");
    expect(stepCommercePreviewSheetState("full", "expand")).toBe("full");
    expect(stepCommercePreviewSheetState("full", "collapse")).toBe("half");
    expect(stepCommercePreviewSheetState("half", "collapse")).toBe("peek");
  });
});
