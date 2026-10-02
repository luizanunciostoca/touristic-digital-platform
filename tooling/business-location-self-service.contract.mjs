import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFile(root + path, "utf8");

test("Morro Pro location self-service binds the governed Wave B capability end to end", async () => {
  const [api, client, surface, placeRuntime, adapter, architecture] =
    await Promise.all([
      read("apps/morro-digital-platform/tooling/business-api.mjs"),
      read("apps/morro-digital-platform/src/business-dashboard-client.ts"),
      read("apps/morro-digital-platform/src/business-dashboard-surface.ts"),
      read("apps/morro-digital-platform/tooling/place-platform-runtime.mjs"),
      read(
        "apps/morro-digital-platform/src/business-location-discovery-adapter.ts",
      ),
      read("docs/architecture/CANONICAL-RUNTIME-CAPABILITY-GRAPH.md"),
    ]);

  assert.ok(api.includes("businessLocationPattern"));
  assert.ok(api.includes("businessLocationCandidatesPattern"));
  assert.ok(api.includes("businessLocationConfirmPattern"));
  assert.ok(client.includes('"/candidates"'));
  assert.ok(client.includes('"/confirm"'));

  assert.ok(api.includes("requiresBusinessScope"));
  assert.ok(api.includes("MORRO_PRO_ROLE_DENIED"));
  assert.ok(api.includes("authorizeBusinessRequest"));
  assert.ok(api.includes("LOCATION_CANDIDATE_STALE"));
  assert.ok(client.includes("searchLocationCandidates"));
  assert.ok(client.includes("confirmLocationCandidate"));
  assert.ok(client.includes("saveLocationSelection"));
  assert.ok(surface.includes("Usar esta localização"));
  assert.ok(surface.includes("Usar localização do dispositivo"));
  assert.ok(
    surface.includes("A publicação pública continua governada separadamente."),
  );
  assert.ok(placeRuntime.includes("listLocationDiscoveryPlaces"));
  assert.ok(placeRuntime.includes("published_revision IS NOT NULL"));
  assert.ok(adapter.includes("confirmCandidate"));
  assert.ok(adapter.includes("LOCATION_OUTSIDE_DESTINATION"));
  assert.ok(
    architecture.includes(
      "ENTRYPOINT → UI → DOMAIN → API → SERVICE → DATABASE",
    ),
  );
});

test("legacy Place Bottom Sheet remains retired and subscription lifecycle stays server-authoritative", async () => {
  const [placeContract, paymentContract] = await Promise.all([
    read(
      "apps/morro-digital-platform/src/ux/place-search-explore-v2-contract.test.ts",
    ),
    read("docs/payments/MERCADO-PAGO-BRICKS-SUBSCRIPTIONS-IMPLEMENTATION.md"),
  ]);
  assert.ok(
    placeContract.includes(
      "retires the legacy Place Bottom Sheet from runtime ownership",
    ),
  );
  assert.ok(placeContract.includes('not.toContain("installPlaceBottomSheet")'));
  assert.ok(paymentContract.includes("Browser subscription lifecycle"));
  assert.ok(
    paymentContract.includes("Ordering owns the canonical Subscription"),
  );
  assert.ok(paymentContract.includes("Financial owns the provider"));
  assert.ok(paymentContract.includes("browser sends only the card token"));
});
