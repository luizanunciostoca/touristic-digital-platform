import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Morro Pro Location has an end-to-end canonical authority path", async () => {
  const [api, client, surface, placeRuntime, graph] = await Promise.all([
    read("apps/morro-digital-platform/tooling/business-api.mjs"),
    read("apps/morro-digital-platform/src/business-dashboard-client.ts"),
    read("apps/morro-digital-platform/src/business-dashboard-surface.ts"),
    read("apps/morro-digital-platform/tooling/place-platform-runtime.mjs"),
    read("docs/architecture/CANONICAL-RUNTIME-CAPABILITY-GRAPH.md"),
  ]);

  for (const route of [
    "businessLocationPattern",
    "businessLocationCandidatesPattern",
    "businessLocationConfirmPattern",
  ]) {
    assert.ok(api.includes(route), "missing " + route);
  }
  assert.ok(api.includes("authorizeBusinessRequest"));
  assert.ok(api.includes("business.location.write"));
  assert.ok(api.includes("createBusinessLocationDiscoveryAdapter"));
  assert.ok(api.includes("confirmCandidate"));
  assert.ok(api.includes("confirmSelection"));
  for (const method of [
    "loadLocation",
    "searchLocationCandidates",
    "confirmLocationCandidate",
    "saveLocationSelection",
  ]) {
    assert.ok(client.includes(method), "missing client method " + method);
  }
  assert.ok(client.includes("authClient.secureFetch"));

  for (const control of [
    'id="morro-pro-location-search-form"',
    'id="morro-pro-location-manual-form"',
    "Usar esta localização",
    "Usar localização do dispositivo",
    "A publicação pública continua governada separadamente.",
  ]) {
    assert.ok(surface.includes(control), "missing surface contract " + control);
  }

  assert.ok(placeRuntime.includes("getBusinessLocationPlace"));
  assert.ok(placeRuntime.includes("listLocationDiscoveryPlaces"));
  assert.ok(placeRuntime.includes("published_revision IS NOT NULL"));
  assert.ok(placeRuntime.includes("published_place_json IS NOT NULL"));
  assert.ok(placeRuntime.includes("externalProvider"));
  assert.ok(placeRuntime.includes("externalPlaceId"));
  assert.ok(
    graph.includes(
      "ENTRYPOINT -> UI -> DOMAIN -> API -> SERVICE/RUNTIME -> DATABASE/PROVIDER -> READBACK",
    ),
  );
  assert.ok(graph.includes("search is read-only and never auto-confirms"));
  assert.ok(
    graph.includes("public projection is unchanged until governed publication"),
  );
});

test("legacy Place Bottom Sheet remains retired and subscriptions remain server-authoritative", async () => {
  const [exploreContract, exploreControl, graph] = await Promise.all([
    read(
      "apps/morro-digital-platform/src/ux/place-search-explore-v2-contract.test.ts",
    ),
    read("apps/morro-digital-platform/src/map/explore-locations-control.ts"),
    read("docs/architecture/CANONICAL-RUNTIME-CAPABILITY-GRAPH.md"),
  ]);
  assert.ok(exploreContract.includes("retires the legacy Place Bottom Sheet"));
  assert.ok(!exploreControl.includes("installPlaceBottomSheet"));
  assert.ok(graph.includes("server-authoritative"));
  assert.ok(graph.includes("must be configured separately"));
});
