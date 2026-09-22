import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(`${publicRoot}${path}`, "utf8");
}

async function readRepository(path: string): Promise<string> {
  return readFile(`${repositoryRoot}${path}`, "utf8");
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  );
  return (
    0.2126 * channelToLinear(channels[0] ?? 0) +
    0.7152 * channelToLinear(channels[1] ?? 0) +
    0.0722 * channelToLinear(channels[2] ?? 0)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function readHexToken(css: string, name: string): string {
  const marker = `${name}: `;
  const start = css.indexOf(marker);
  expect(start, `missing token ${name}`).toBeGreaterThanOrEqual(0);
  const tail = css.slice(start + marker.length);
  const value = tail.match(/^#[0-9a-fA-F]{6}/u)?.[0];
  expect(value, `token ${name} is not a six-digit hex color`).toBeTruthy();
  return value ?? "#000000";
}

describe("UX V2 Wave G shared visual system contract", () => {
  it("defines canonical typography, spacing, radius, elevation and icon tokens", async () => {
    const css = await readPublic("design-system-v2.css");
    const tokens = [
      "--md-font-family-sans",
      "--md-font-size-xs",
      "--md-font-size-sm",
      "--md-font-size-md",
      "--md-font-size-lg",
      "--md-font-size-xl",
      "--md-font-size-2xl",
      "--md-font-size-3xl",
      "--md-font-size-display",
      "--md-font-size-title",
      "--md-font-size-body",
      "--md-font-size-label",
      "--md-space-1",
      "--md-space-2",
      "--md-space-3",
      "--md-space-4",
      "--md-space-6",
      "--md-space-8",
      "--md-space-12",
      "--md-radius-sm",
      "--md-radius-md",
      "--md-radius-lg",
      "--md-radius-xl",
      "--md-radius-pill",
      "--md-elevation-1",
      "--md-elevation-2",
      "--md-elevation-3",
      "--md-icon-size-sm",
      "--md-icon-size-md",
      "--md-icon-size-lg",
    ];

    for (const token of tokens) {
      expect(css, `missing shared token ${token}`).toContain(token);
    }
  });

  it("governs bottom navigation size and active-state geometry through shared tokens", async () => {
    const css = await readPublic("design-system-v2.css");
    for (const token of [
      "--md-bottom-nav-min-height",
      "--md-bottom-nav-item-target",
      "--md-bottom-nav-active-target",
      "--md-bottom-nav-icon-size",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain(":where(.md-home-bottom-nav)");
    expect(css).toContain(":where(.md-home-nav-item)");
    expect(css).toContain(":where(.md-home-nav-item.is-active)");
  });

  it("preserves safe-area, dynamic viewport and keyboard-safe foundations", async () => {
    const css = await readPublic("design-system-v2.css");
    expect(css).toContain("--md-safe-top");
    expect(css).toContain("--md-safe-bottom");
    expect(css).toContain("100svh");
    expect(css).toContain("100dvh");
    expect(css).toContain("--md-keyboard-safe-gap");
    expect(css).toContain("scroll-padding-block-end");
    expect(css).toContain("font-size: max(1rem, 1em)");
  });

  it("preserves focus-visible, accessible target size, forced colors and reduced motion", async () => {
    const css = await readPublic("design-system-v2.css");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("--md-touch-target-min: 2.75rem");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms !important");
  });

  it("meets explicit WCAG contrast obligations for canonical light-theme tokens", async () => {
    const css = await readPublic("design-system-v2.css");
    const surface = readHexToken(css, "--md-color-surface");
    const text = readHexToken(css, "--md-color-text");
    const muted = readHexToken(css, "--md-color-text-muted");
    const primary = readHexToken(css, "--md-color-brand-primary");
    const danger = readHexToken(css, "--md-color-danger");
    const inverse = "#ffffff";

    expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(muted, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inverse, primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inverse, danger)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the canonical layer registry instead of introducing local z-index authority", async () => {
    const css = await readPublic("design-system-v2.css");
    const layers = [
      "--md-layer-map: 0",
      "--md-layer-marker: 100",
      "--md-layer-map-control: 200",
      "--md-layer-dock: 300",
      "--md-layer-sheet: 400",
      "--md-layer-navigation: 500",
      "--md-layer-dialog: 600",
      "--md-layer-tour: 700",
      "--md-layer-toast: 800",
      "--md-layer-system: 900",
    ];
    for (const layer of layers) {
      expect(css).toContain(layer);
    }
  });

  it("defines explicit responsive density bands covering the Wave G device matrix", async () => {
    const css = await readPublic("design-system-v2.css");
    for (const marker of [
      "max-width: 20rem",
      "max-width: 22.5rem",
      "max-width: 23.4375rem",
      "max-width: 24.375rem",
      "max-width: 26.875rem",
      "min-width: 48rem",
    ]) {
      expect(css, `missing responsive band ${marker}`).toContain(marker);
    }
  });

  it("uses the canonical Tourist UI font at the shared foundation", async () => {
    const css = await readPublic("design-system-v2.css");
    expect(css).toContain("font-family: var(--md-font-family-sans)");
    expect(css).toContain(
      '--md-font-family-sans: "Poppins", system-ui, sans-serif',
    );
  });

  it("keeps RTL-safe shared navigation directionality", async () => {
    const css = await readPublic("design-system-v2.css");
    expect(css).toContain(':where([dir="rtl"] .md-home-bottom-nav)');
    expect(css).toContain("direction: rtl");
  });

  it("keeps browser zoom user-controlled and root language explicit", async () => {
    const html = await readPublic("index.html");
    expect(html).not.toContain("user-scalable=no");
    expect(html).not.toContain("maximum-scale");
    expect(html).toMatch(/<html\s+lang="[^"]+"/u);
  });

  it("keeps shared interactive surfaces named in canonical shell markup", async () => {
    const shell = await readRepository(
      "apps/morro-digital-platform/src/layouts/app-shell.ts",
    );
    expect(shell).toContain('aria-label="Navegação principal"');
    expect(shell).toContain('aria-current="page"');
    expect(shell).toContain('aria-hidden="true"');
  });

  it("keeps Wave G implementation outside frozen legacy CSS", async () => {
    const workflow = await readRepository(
      ".github/workflows/ux-v2-wave-g-design-system-regression.yml",
    );
    expect(workflow).toContain(
      "apps/morro-digital-platform/public/design-system-v2.css",
    );
    expect(workflow).not.toContain("public/legacy/**");
  });
});
