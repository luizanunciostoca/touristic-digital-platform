/** Explicit read-only probe. Never performs POST/PUT/DELETE, cannot activate a feature. */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.MORRO_AUDIT_ORIGIN;
if (!origin) {
  console.log(
    JSON.stringify({ status: "NOT_RUN", reason: "MORRO_AUDIT_ORIGIN_NOT_SET" }),
  );
  process.exit(0);
}
const url = new URL(origin);
if (
  url.protocol !== "https:" ||
  ![
    "morro-digital-v2.onrender.com",
    "morro-digital-v2-staging.onrender.com",
  ].includes(url.hostname)
)
  throw Error("READBACK_HOST_DENIED");
const timeout = AbortSignal.timeout(12000);
const paths = [
  "/readyz",
  "/runtime-config.js",
  "/api/places/v1/map?" +
    new URLSearchParams({
      destinationId: "morro-de-sao-paulo",
      bbox: "-39.05,-13.5,-38.89,-13.35",
      zoom: "13",
    }),
];
const data = [];
for (const path of paths) {
  try {
    const result = await fetch(new URL(path, url.origin), {
      method: "GET",
      headers: {
        Accept: path.includes("runtime-config")
          ? "text/javascript"
          : "application/json",
      },
      signal: timeout,
    });
    const text = await result.text();
    const item = {
      path: path.split("?")[0],
      status: result.status,
      releaseSha: result.headers.get("x-release-sha"),
      readOnly: true,
    };
    if (path.includes("/map")) {
      try {
        const body = JSON.parse(text);
        item.placeItems = Array.isArray(body.items) ? body.items.length : null;
        item.nextCursor = Boolean(body.nextCursor);
      } catch {
        item.responseInvalid = true;
      }
    }
    if (path.includes("/runtime-config")) {
      item.placeFlagPresent = text.includes("VITE_PLACE_PLATFORM_AVAILABLE");
      item.publicConfigBytes = text.length;
    }
    data.push(item);
  } catch (err) {
    data.push({ path: path.split("?")[0], status: "ERROR", code: err.name });
  }
}
const report = {
  source: "read-only-public-api",
  origin: url.origin,
  at: new Date().toISOString(),
  results: data,
  conclusion:
    "A zero-item map response does not certify global catalog absence and never authorizes fallback removal.",
};
mkdirSync(resolve(root, "evidence"), { recursive: true });
writeFileSync(
  resolve(root, "evidence/public-readback.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
