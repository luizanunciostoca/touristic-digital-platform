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

  it("allows known admin surfaces while rejecting unsafe returns", () => {
    expect(safeBusinessDashboardReturnPath("")).toBe(canonicalDashboard);

    const controlCenter = "/apps/control-center/public/index.html#system";
    expect(
      safeBusinessDashboardReturnPath(
        `?return=${encodeURIComponent(controlCenter)}`,
      ),
    ).toBe(controlCenter);

    expect(
      safeBusinessDashboardReturnPath(
        `?return=${encodeURIComponent("https://evil.example/")}`,
      ),
    ).toBe(canonicalDashboard);
    expect(
      safeBusinessDashboardReturnPath(
        `?return=${encodeURIComponent("//evil.example/control-center")}`,
      ),
    ).toBe(canonicalDashboard);
  });
});
