import { describe, expect, it } from "vitest";
import { safeBusinessDashboardReturnPath } from "./business-login-entry.js";

const canonicalDashboard =
  "/apps/morro-digital-platform/public/business-dashboard.html";

describe("Business login return path", () => {
  it("maps the legacy dashboard bridge directly to the canonical surface", () => {
    const legacy =
      "/dashboard/index-v3-improved.html?businessId=toca-do-morcego";

    expect(
      safeBusinessDashboardReturnPath(`?return=${encodeURIComponent(legacy)}`),
    ).toBe(`${canonicalDashboard}?businessId=toca-do-morcego`);
  });

  it("uses the canonical dashboard for absent or unsafe returns", () => {
    expect(safeBusinessDashboardReturnPath("")).toBe(canonicalDashboard);
    expect(
      safeBusinessDashboardReturnPath(
        `?return=${encodeURIComponent("https://evil.example/")}`,
      ),
    ).toBe(canonicalDashboard);
  });
});
