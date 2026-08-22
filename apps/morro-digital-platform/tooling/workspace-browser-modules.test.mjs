import { describe, expect, it } from "vitest";
import { rewriteWorkspaceModuleSpecifiers } from "./workspace-browser-modules.mjs";

describe("workspace browser module resolution", () => {
  it("rewrites root and subpath imports to public dist URLs", () => {
    const source = [
      'import { createClient } from "@touristic/auth-browser";',
      'const ordering = await import("@touristic/ordering/ticketing-checkout");',
    ].join("\n");

    expect(rewriteWorkspaceModuleSpecifiers(source)).toBe(
      [
        'import { createClient } from "/packages/auth-browser/dist/index.js";',
        'const ordering = await import("/packages/ordering/dist/ticketing-checkout.js");',
      ].join("\n"),
    );
  });

  it("leaves external and traversal-like specifiers unchanged", () => {
    const source = [
      'import React from "react";',
      'import value from "@touristic/core/../private";',
    ].join("\n");

    expect(rewriteWorkspaceModuleSpecifiers(source)).toBe(source);
  });
});
