import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Morro Pro Location has canonical end-to-end wiring", async () => {
  const [api, client, surface, placeRuntime] = await Promise.all([
    read("apps/morro-digital-platform/tooling/business-api.mjs"),
    read("apps/morro-digital-platform/src/business-dashboard-client.ts"),
    read("apps/morro-digital-platform/src/business-dashboard-surface.ts"),
    read("apps/morro-digital-platform/tooling/place-platform-runtime.mjs"),
  ]);
  const requirements = [
    [
      api,
      [
        "businessLocationPattern",
        "businessLocationCandidatesPattern",
        "businessLocationConfirmPattern",
        "authorizeBusinessRequest",
        "business.location.write",
        "createBusinessLocationDiscoveryAdapter",
        "confirmCandidate",
        "confirmSelection",
      ],
    ],
    [
      client,
      [
        "loadLocation",
        "searchLocationCandidates",
        "confirmLocationCandidate",
        "saveLocationSelection",
        "authClient.secureFetch",
      ],
    ],
    [
      surface,
      [
        'id="morro-pro-location-search-form"',
        'id="morro-pro-location-manual-form"',
        "Usar esta localização",
        "Usar localização do dispositivo",
        "A publicação pública continua governada separadamente.",
      ],
    ],
    [
      placeRuntime,
      [
        "getBusinessLocationPlace",
        "listLocationDiscoveryPlaces",
        "published_revision IS NOT NULL",
        "published_place_json IS NOT NULL",
        "externalProvider",
        "externalPlaceId",
      ],
    ],
  ];
  for (const [source, tokens] of requirements) {
    for (const token of tokens)
      assert.ok(source.includes(token), "missing " + token);
  }
});

test("retired Place sheet and server-authoritative subscriptions stay unchanged", async () => {
  const [contract, explore, payments] = await Promise.all([
    read(
      "apps/morro-digital-platform/src/ux/place-search-explore-v2-contract.test.ts",
    ),
    read("apps/morro-digital-platform/src/map/explore-locations-control.ts"),
    read("docs/payments/MERCADO-PAGO-BRICKS-SUBSCRIPTIONS-IMPLEMENTATION.md"),
  ]);
  assert.ok(contract.includes("retires the legacy Place Bottom Sheet"));
  assert.ok(!explore.includes("installPlaceBottomSheet"));
  assert.ok(payments.includes("canonical Subscription"));
  assert.ok(payments.includes("authenticated server session"));
  assert.ok(payments.includes("authoritative read"));
});
