import { describe, expect, it } from "vitest";

import { renderTicketQrSvg } from "./qr-svg.js";

describe("Ticketing QR SVG", () => {
  it("renders the signed PII-free payload as a deterministic Version 10 QR matrix", () => {
    const payload = `tck.v1.tck_ticketing_qr_0001.${"a".repeat(64)}`;
    const svg = renderTicketQrSvg(payload);
    expect(svg).not.toBeNull();
    expect(svg).toContain('viewBox="0 0 65 65"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).not.toContain("Maria da Silva");
    expect(renderTicketQrSvg(payload)).toBe(svg);
  });

  it("rejects non-ticket payloads and oversized signed payloads", () => {
    expect(renderTicketQrSvg("https://example.com")).toBeNull();
    expect(() => renderTicketQrSvg(`tck.v1.${"x".repeat(400)}`)).toThrow(
      "TICKETING_QR_PAYLOAD_TOO_LARGE",
    );
  });
});
