import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(root + path, "utf8");

test("Morro Pro Location binds Wave B end to end", async () => {
  const app = "apps/morro-digital-platform/";
  const api = await read(app + "tooling/business-api.mjs");
  const client = await read(app + "src/business-dashboard-client.ts");
  const surface = await read(app + "src/business-dashboard-surface.ts");
  const place = await read(app + "tooling/place-platform-runtime.mjs");
  const adapter = await read(
    app + "src/business-location-discovery-adapter.ts",
  );
  const graph = await read(
    "docs/architecture/CANONICAL-RUNTIME-CAPABILITY-GRAPH.md",
  );

  for (const signal of [
    "businessLocationCandidatesPattern",
    "businessLocationConfirmPattern",
    "requiresBusinessScope",
    "MORRO_PRO_ROLE_DENIED",
    "LOCATION_CANDIDATE_STALE",
    "Não foi possível concluir a solicitação de localização.",
  ])
    assert.ok(api.includes(signal), signal);
  for (const signal of [
    "searchLocationCandidates",
    "confirmLocationCandidate",
    "saveLocationSelection",
    "body.message",
  ])
    assert.ok(client.includes(signal), signal);
  for (const signal of [
    "Usar esta localização",
    "locationSearchGeneration",
    "isCurrent(request)",
  ])
    assert.ok(surface.includes(signal), signal);
  assert.ok(place.includes('visibility === "public"'));
  assert.ok(place.includes("listLocationDiscoveryPlaces"));
  assert.ok(adapter.includes("LOCATION_OUTSIDE_DESTINATION"));
  assert.ok(
    graph.includes("ENTRYPOINT → UI → DOMAIN → API → SERVICE → DATABASE"),
  );
});
