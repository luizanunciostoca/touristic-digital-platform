import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readPublic = (path: string) =>
  readFile(new URL(`../../public/${path}`, import.meta.url), "utf8");

describe("Profile assistant settings row visibility", () => {
  it("loads the scoped override after tourist shell authority", async () => {
    const html = await readPublic("index.html");
    const shell = html.indexOf("tourist-shell-v2.css");
    const fix = html.indexOf("profile-settings-row-fix.css");
    expect(shell).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(shell);
  });

  it("neutralizes frozen circular configButton geometry only inside Profile", async () => {
    const css = await readPublic("profile-settings-row-fix.css");
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
