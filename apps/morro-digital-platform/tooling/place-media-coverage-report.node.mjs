import assert from "node:assert/strict";
import test from "node:test";

import { runPlaceMediaCoverageAudit } from "./place-media-coverage-report.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("paginates canonical places and delegates the matrix audit", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    calls.push(url.toString());

    if (url.pathname === "/api/places/v1/map") {
      if (url.searchParams.get("cursor") === "next-1") {
        return jsonResponse({
          items: [{ id: "place-toca", name: "Toca do Morcego" }],
          nextCursor: null,
        });
      }
      return jsonResponse({
        items: [{ id: "place-segunda", name: "Segunda Praia" }],
        nextCursor: "next-1",
      });
    }

    if (url.pathname === "/api/places/v1/place-segunda") {
      return jsonResponse({
        profile: { id: "place-segunda", name: "Segunda Praia" },
        media: {
          placeId: "place-segunda",
          coverImage: { providerReference: "/media/segunda.webp" },
          gallery: [],
        },
      });
    }

    if (url.pathname === "/api/places/v1/place-toca") {
      return new Response(null, { status: 404 });
    }

    return new Response(null, { status: 500 });
  };

  const audit = async (input) => {
    assert.deepEqual(input.canonicalPlaces, [
      { id: "place-segunda", name: "Segunda Praia" },
      { id: "place-toca", name: "Toca do Morcego" },
    ]);
    assert.deepEqual(input.legacyPlaceNames, [
      "Segunda Praia",
      "Toca do Morcego",
    ]);
    assert.deepEqual(input.legacyEntries, [
      { place: "Segunda Praia", images: ["/legacy/segunda.jpg"] },
    ]);

    const segunda = await input.getDetail("place-segunda");
    const toca = await input.getDetail("place-toca");
    assert.equal(segunda.profile.id, "place-segunda");
    assert.equal(toca, null);

    return {
      rows: [
        {
          legacyPlace: "Segunda Praia",
          legacyImages: ["/legacy/segunda.jpg"],
          status: "canonical_media",
          canonicalPlaceId: "place-segunda",
          canonicalPlaceName: "Segunda Praia",
          canonicalImageCount: 1,
        },
      ],
      totals: {
        canonical_media: 1,
        canonical_no_media: 0,
        legacy_only: 0,
        not_canonical: 0,
      },
    };
  };

  const report = await runPlaceMediaCoverageAudit({
    baseUrl: "https://staging.example.test/app",
    fetchImpl,
    audit,
    legacyEntries: [
      { place: "Segunda Praia", images: ["/legacy/segunda.jpg"] },
    ],
    legacyPlaceNames: ["Segunda Praia", "Toca do Morcego"],
  });

  assert.equal(report.baseUrl, "https://staging.example.test");
  assert.equal(report.destinationId, "morro-de-sao-paulo");
  assert.equal(report.canonicalPlaceCount, 2);
  assert.equal(report.totals.canonical_media, 1);
  assert.ok(
    calls.some((url) => new URL(url).searchParams.get("cursor") === "next-1"),
  );
});

test("fails closed on invalid map payloads", async () => {
  await assert.rejects(
    runPlaceMediaCoverageAudit({
      baseUrl: "https://staging.example.test",
      fetchImpl: async () => jsonResponse({ items: null }),
      audit: async () => {
        throw new Error("audit should not run");
      },
      legacyEntries: [],
      legacyPlaceNames: [],
    }),
    /PLACE_MEDIA_COVERAGE_MAP_RESPONSE_INVALID/u,
  );
});

test("requires an explicit runtime origin", async () => {
  await assert.rejects(
    runPlaceMediaCoverageAudit({
      baseUrl: "",
      audit: async () => ({
        rows: [],
        totals: {
          canonical_media: 0,
          canonical_no_media: 0,
          legacy_only: 0,
          not_canonical: 0,
        },
      }),
      legacyEntries: [],
      legacyPlaceNames: [],
    }),
    /MORRO_V2_BASE_URL_REQUIRED/u,
  );
});
