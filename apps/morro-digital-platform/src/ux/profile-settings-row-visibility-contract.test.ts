import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readPublic = (path: string) =>
  readFile(new URL(`../../public/${path}`, import.meta.url), "utf8");

describe("Profile assistant settings row visibility", () => {
  it("keeps Tourist Shell V2 as the final surface-specific CSS authority", async () => {
    const html = await readPublic("index.html");
    expect(html).toContain("tourist-shell-v2.css");
    expect(html).not.toContain("profile-settings-row-fix.css");
  });

  it("neutralizes frozen circular configButton geometry inside Tourist Shell V2", async () => {
    const css = await readPublic("tourist-shell-v2.css");
    expect(css).toContain(
      "#home-profile-panel #configButton.md-home-profile-row",
    );
    expect(css).toContain("display: grid");
    expect(css).toContain("width: 100%");
    expect(css).toContain("height: auto");
    expect(css).toContain("margin-left: 0");
    expect(css).toContain("grid-template-columns: auto minmax(0, 1fr) auto");
    expect(css).toContain(
      "#home-profile-panel #configButton.md-home-profile-row::before",
    );
    expect(css).toContain("content: none");
  });
});
