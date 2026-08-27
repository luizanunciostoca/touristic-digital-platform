#!/usr/bin/env node

if (!String(process.env.MORRO_V2_BASE_URL ?? "").trim()) {
  throw new Error("MORRO_V2_BASE_URL_REQUIRED");
}

await import("../payments/render-v2-smoke.mjs");
