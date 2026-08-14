import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

async function source(path: string): Promise<string> {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("CRM M119 public browser routes", () => {
  it("maps the frozen V1 public proposal and contract paths to V2 browser surfaces", async () => {
    const server = await source("../tooling/dev-server.mjs");

    expect(server).toContain("/proposals\\/view\\/");
    expect(server).toContain("apps/admin-crm/public/proposal-public.html");
    expect(server).toContain("/contracts\\/view\\/");
    expect(server).toContain("apps/admin-crm/public/contract-public.html");
  });

  it("keeps both public browser clients syntactically valid and pathname-aware", async () => {
    const proposal = await source("../../admin-crm/public/proposal-public.js");
    const contract = await source("../../admin-crm/public/contract-public.js");

    expect(() => new Script(proposal)).not.toThrow();
    expect(() => new Script(contract)).not.toThrow();
    expect(proposal).toContain("window.location.pathname.match");
    expect(contract).toContain("window.location.pathname.match");
    expect(contract).toContain('canvas.toDataURL("image/png")');
    expect(contract).toContain('canvas.addEventListener("pointercancel", end)');
    expect(contract).toContain("let activePointerId = null");
    expect(contract).toContain("event.pointerId !== activePointerId");
    expect(contract).toContain("canvas.setPointerCapture(event.pointerId)");
    expect(contract).toContain("canvas.releasePointerCapture(event.pointerId)");
    expect(contract).not.toContain(
      'canvas.addEventListener("pointerleave", end)',
    );
    expect(contract).toContain(
      'canvas.addEventListener("lostpointercapture", recoverPointer)',
    );
    expect(contract).toContain("event.pointerId === activePointerId");
    expect(contract).toContain("Math.min(Math.max(x, 0), canvas.width)");
    expect(contract).toContain("Math.min(Math.max(y, 0), canvas.height)");
  });
});
