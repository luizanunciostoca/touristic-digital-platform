import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../public/", import.meta.url));

async function readPublic(path: string): Promise<string> {
  return readFile(publicRoot + path, "utf8");
}

describe("Ticketing UX Design V2 contract", () => {
  it("loads V2 foundations before Ticketing feature styles", async () => {
    const html = await readPublic("tickets.html");

    const foundations = html.indexOf("design-system-v2.css");
    const premium = html.indexOf("premium-ux-v2.css");
    const feature = html.indexOf('href="/ticketing.css"');

    expect(foundations).toBeGreaterThan(-1);
    expect(premium).toBeGreaterThan(foundations);
    expect(feature).toBeGreaterThan(premium);
    expect(html).toContain('content="light dark"');
  });

  it("uses the canonical Tourist UI typography and semantic tokens", async () => {
    const [css, designSystem] = await Promise.all([
      readPublic("ticketing.css"),
      readPublic("design-system-v2.css"),
    ]);

    expect(css).toContain("font-family: var(--md-font-family-sans)");
    expect(css).not.toMatch(/\bInter\b/u);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(css).not.toContain("transition: all");
    expect(css).not.toMatch(/z-index\s*:\s*-?\d+/u);
    expect(css).not.toContain("!important");

    for (const token of [
      "--md-color-brand",
      "--md-color-brand-strong",
      "--md-color-surface-canvas",
      "--md-color-surface-card",
      "--md-color-surface-glass",
      "--md-color-surface-elevated",
      "--md-color-text-primary",
      "--md-color-text-secondary",
      "--md-color-text-inverse",
      "--md-color-interactive-primary",
      "--md-color-interactive-secondary",
      "--md-color-success",
      "--md-color-warning",
      "--md-color-danger",
      "--md-color-info",
    ]) {
      expect(designSystem).toContain(token);
    }
  });

  it("adopts shared primitives in static and dynamic Ticketing consumers", async () => {
    const [html, runtime] = await Promise.all([
      readPublic("tickets.html"),
      readPublic("ticketing.js"),
    ]);

    expect(html).toContain("panel md-card");
    expect(html).toContain("md-button md-button--primary");
    expect(html).toContain("md-button md-button--secondary");
    expect(html).toContain('class="md-input"');
    expect(html).toContain('id="quantity"');
    expect(html).toContain("ticket-dialog md-dialog");
    expect(html).toContain("dialog-close md-icon-button");

    expect(runtime).toContain("offer-card md-card");
    expect(runtime).toContain("reservation-card md-card");
    expect(runtime).toContain("availability md-badge");
    expect(runtime).toContain("status md-badge");
    expect(runtime).toContain("elements.dialog.showModal()");
    expect(runtime).toContain("elements.dialog.close()");

    // Dates are grouped from server inventory; the browser never invents
    // bookable dates or changes reservation authority.
    expect(runtime).toContain("when.textContent = dateTime(offer.startsAt)");
    expect(runtime).toContain("function renderDateSelector()");
    expect(html).toContain('id="date-selector"');
    expect(html).toContain('role="listbox"');
    expect(html).not.toMatch(/type="(?:date|datetime-local)"/u);
  });

  it("uses a product-led progressive purchase hierarchy without promoting browser authority", async () => {
    const [html, runtime, experience] = await Promise.all([
      readPublic("tickets.html"),
      readPublic("ticketing.js"),
      readPublic("experience.js"),
    ]);

    const hero = html.indexOf("ticketing-product-stage");
    const selection = html.indexOf('id="offers-title"');
    const summary = html.indexOf('id="selection-summary"');
    const identity = html.indexOf('id="reservation-title"');
    const wallet = html.indexOf('id="my-tickets-title"');

    expect(hero).toBeGreaterThan(-1);
    expect(selection).toBeGreaterThan(hero);
    expect(summary).toBeGreaterThan(selection);
    expect(identity).toBeGreaterThan(summary);
    expect(wallet).toBeGreaterThan(identity);
    expect(html).toContain('id="quantity-decrease"');
    expect(html).toContain('id="quantity-increase"');
    expect(html).toContain('id="identity-panel"');
    expect(html).toContain(
      'aria-labelledby="reservation-title"\n          hidden',
    );
    expect(runtime).toContain("elements.identityPanel.hidden = false");
    expect(html).toContain('id="summary-unit-price"');
    expect(html).toContain('id="summary-subtotal"');
    expect(html).toMatch(
      /O valor final,\s+moeda,\s+disponibilidade e status de pagamento são\s+confirmados pelo servidor/u,
    );

    expect(runtime).toContain(
      'const canonicalCheckoutPath = "/api/payments/v1/checkouts"',
    );
    expect(runtime).toContain(
      'const commerceSessionPath = "/api/ticketing/v1/consumer-session"',
    );
    expect(runtime).toContain('api("/api/ticketing/v1/reservations"');
    expect(runtime).toContain('api("/api/ticketing/v1/quote"');
    expect(runtime).toContain("quote.totalAmount");
    expect(runtime).toContain("quote.unitAmount");
    expect(runtime).toContain("quoteIdentity");
    expect(runtime).not.toContain("estimatedSubtotal");
    expect(runtime).not.toContain("offer.unitAmount.minorUnits *");
    expect(runtime).not.toContain("providerStatus =");
    expect(runtime).not.toContain("paymentStatus =");
    expect(html).toContain("Finalizar Reserva");
    expect(html).toContain('id="refresh-button"');
    expect(html).toMatch(/id="refresh-button"[\s\S]*?hidden/u);
    expect(runtime).toContain("if (state.submitting) return");
    expect(runtime).toContain("QUOTE_CURRENCY_MISMATCH");
    expect(runtime).toContain("Preço ou disponibilidade mudou");
    expect(runtime).toContain("friendlyError");
    expect(experience).toContain(
      'for (const key of ["place", "source", "lang", "locale"])',
    );
  });

  it("renders progressive loading structure without weakening accessibility", async () => {
    const [css, runtime, designSystem] = await Promise.all([
      readPublic("ticketing.css"),
      readPublic("ticketing.js"),
      readPublic("design-system-v2.css"),
    ]);

    expect(runtime).toContain("renderOfferSkeletons()");
    expect(runtime).toContain("renderReservationSkeletons()");
    expect(runtime).toContain('setAttribute("aria-busy", "true")');
    expect(runtime).toContain('setAttribute("aria-hidden", "true")');
    expect(runtime).toContain('removeAttribute("aria-busy")');
    expect(css).toContain(".ticketing-skeleton-card");
    expect(css).toContain(".date-selector");
    expect(css).toContain(".date-chip");
    expect(designSystem).toContain(".md-skeleton");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("keeps primary interactions reachable and QR dialog inside the safe viewport", async () => {
    const css = await readPublic("ticketing.css");

    expect(css).toContain("min-height: var(--md-touch-target-min)");
    expect(css).toContain("100dvh - var(--md-safe-top)");
    expect(css).toContain("overflow-y: auto");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain(
      'body[data-md-mode="commerce"] .analytics-consent-preferences.is-collapsed',
    );
    expect(css).toContain(
      "bottom: max(var(--md-space-3), var(--md-safe-bottom))",
    );
    expect(css).toContain("font-weight: var(--md-font-weight-bold)");
  });


  it("keeps the 390px flow compact, contextual, and server-authoritative", async () => {
    const [html, css, runtime] = await Promise.all([
      readPublic("tickets.html"),
      readPublic("ticketing.css"),
      readPublic("ticketing.js"),
    ]);

    expect(html).toContain('class="ticketing-topbar"');
    expect(html).toContain('data-ticketing-return');
    expect(html).toContain('data-ticketing-hero');
    expect(html).toContain('id="product-rating"');
    expect(html).toContain("Reserva segura");
    expect(html).toContain('aria-label="Escolha a data"');
    expect(html).toContain('aria-label="Diminuir quantidade"');
    expect(html).toContain('aria-label="Aumentar quantidade"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="1"');
    expect(css).toContain("@media (max-width: 24.375rem)");
    expect(css).toContain("min-height: 12rem");
    expect(runtime).toContain("offer.sellable === false");
    expect(runtime).toContain("copy.soldOut");
    expect(runtime).toContain("elements.quantityDecrease.disabled");
    expect(runtime).toContain("elements.quantityIncrease.disabled");
    expect(runtime).not.toContain('setMessage(error.message || copy.ticketingUnavailable');
  });

  it("uses the formal V2 stacking scale and theme contract", async () => {
    const designSystem = await readPublic("design-system-v2.css");

    for (const token of [
      "--md-layer-map",
      "--md-layer-marker",
      "--md-layer-map-control",
      "--md-layer-dock",
      "--md-layer-sheet",
      "--md-layer-navigation",
      "--md-layer-dialog",
      "--md-layer-tour",
      "--md-layer-toast",
      "--md-layer-system",
    ]) {
      expect(designSystem).toContain(token);
    }

    expect(designSystem).toContain('[data-theme="dark"]');
    expect(designSystem).toContain('[data-destination-theme="morro"]');
  });
});
