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

it("returns to the affiliate portal with its query and fragment only for the exact portal path", () => {
  for (const path of [
    "/affiliate-portal.html",
    "/apps/morro-digital-platform/public/affiliate-portal.html",
  ]) {
    const destination = path + "?campaign=summer#links";
    expect(
      safeBusinessDashboardReturnPath(
        "?return=" + encodeURIComponent(destination),
      ),
    ).toBe(destination);
    for (const unsafe of [
      path + ".other",
      path + "/../escape",
      "//evil.example" + path,
    ]) {
      expect(
        safeBusinessDashboardReturnPath(
          "?return=" + encodeURIComponent(unsafe),
        ),
      ).toBe(canonicalDashboard);
    }
  }
});
