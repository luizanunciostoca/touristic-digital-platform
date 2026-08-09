import { describe, expect, it, vi } from "vitest";

import { fetchAssistantPlaceDetails } from "./assistant-place-details-adapter.js";

describe("assistant Mapbox place details adapter", () => {
  it("uses the curated V1 destination as query and proximity", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            features: [
              {
                geometry: { coordinates: [-38.91, -13.38] },
                properties: {
                  mapbox_id: "poi.far",
                  full_address: "Resultado distante",
                  poi_category: ["bar"],
                },
              },
              {
                geometry: { coordinates: [-38.9118443, -13.3800508] },
                properties: {
                  mapbox_id: "poi.segunda-praia",
                  full_address: "Segunda Praia, Morro de São Paulo",
                  poi_category: ["beach"],
                  metadata: {
                    open_hours: { open_now: true },
                    phone: "+55 75 99999-0000",
                    website: "https://example.com/segunda-praia",
                  },
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    const details = await fetchAssistantPlaceDetails("praia 2", {
      accessToken: "pk.test",
      fetch: fetchImplementation,
    });

    expect(details).toEqual({
      name: "Segunda Praia",
      address: "Segunda Praia, Morro de São Paulo",
      category: "beach",
      openNow: true,
      phone: "+55 75 99999-0000",
      website: "https://example.com/segunda-praia",
      mapboxId: "poi.segunda-praia",
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const requestInput = fetchImplementation.mock.calls[0]?.[0];
    expect(typeof requestInput).toBe("string");
    const requestUrl = typeof requestInput === "string" ? requestInput : "";
    expect(requestUrl).toContain("q=Segunda+Praia");
    expect(requestUrl).toContain("access_token=pk.test");
    expect(requestUrl).toContain("proximity=-38.9118443%2C-13.3800508");
  });

  it("does not call Mapbox without a public access token", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>();

    await expect(
      fetchAssistantPlaceDetails("Segunda Praia", {
        fetch: fetchImplementation,
      }),
    ).resolves.toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("returns null instead of inventing details for an unknown place", async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>();

    await expect(
      fetchAssistantPlaceDetails("Lugar inexistente XYZ", {
        accessToken: "pk.test",
        fetch: fetchImplementation,
      }),
    ).resolves.toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
