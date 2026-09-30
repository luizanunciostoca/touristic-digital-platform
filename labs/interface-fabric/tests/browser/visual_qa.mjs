import { mkdir, readFile } from "node:fs/promises";
const base =
  process.env.IF_BASE_URL || "http://127.0.0.1:4173/labs/interface-fabric";
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "PLAYWRIGHT_REQUIRED: install/use the repository Playwright toolchain before visual certification.",
  );
  process.exit(2);
}
const manifest = JSON.parse(
  await readFile(new URL("../../manifest/interfaces.json", import.meta.url), "utf8"),
);
const ids = manifest.map(({ id }) => id);
const viewports = [
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [800, 360],
];
const representativeIds = new Set([
  "IF-PUB-006",
  "IF-PUB-010",
  "IF-COM-004",
  "IF-AFF-005",
  "IF-BIZ-003",
  "IF-CRM-001",
  "IF-CTL-001",
  "IF-GRW-001",
]);
await mkdir(new URL("../../visual/evidence/", import.meta.url), {
  recursive: true,
});
const browser = await chromium.launch({ headless: true });
const failures = [];
for (const [width, height] of viewports) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    failures.push({ width, height, error: e.message }),
  );
  for (const id of ids) {
    const url = base + "/interfaces/" + id + ".html";
    const response = await page.goto(url, { waitUntil: "networkidle" });
    if (!response || !response.ok()) {
      failures.push({ id, width, height, http: response?.status() });
      continue;
    }
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (layout.scrollWidth > layout.clientWidth + 1) {
      failures.push({ id, width, height, ...layout });
    }
    if (
      (width === 390 && height === 844) ||
      representativeIds.has(id)
    ) {
      await page.screenshot({
        path: new URL(
          "../../visual/evidence/" + id + "-" + width + "x" + height + ".png",
          import.meta.url,
        ).pathname,
        fullPage: true,
      });
    }
  }
  await context.close();
}
await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("VISUAL_RESPONSIVE_PASS");
