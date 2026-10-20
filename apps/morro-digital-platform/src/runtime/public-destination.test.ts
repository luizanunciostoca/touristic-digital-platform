import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { morroDeSaoPauloDestination } from "../config/destination.js";
import { loadPublicDestination } from "./public-destination.js";

const dynamic = {
  ...morroDeSaoPauloDestination,
  name: "Morro governado",
  center: { latitude: -13.4, longitude: -38.9 },
};

describe("public Destination browser runtime", () => {
  it("loads a valid owner projection with its source", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: dynamic,
          source: "destination-owner",
        }),
        { status: 200 },
      )) as typeof fetch;
    const result = await loadPublicDestination(fetcher);
    expect(result.source).toBe("destination-owner");
    expect(result.destination.name).toBe("Morro governado");
    expect(result.destination.center.latitude).toBe(-13.4);
  });

  it("preserves an explicit static fallback source from the server", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: morroDeSaoPauloDestination,
          source: "static-fallback",
        }),
        { status: 200 },
      )) as typeof fetch;
    const result = await loadPublicDestination(fetcher);
    expect(result.source).toBe("static-fallback");
    expect(result.destination.id).toBe(morroDeSaoPauloDestination.id);
  });

  it("falls back on unavailable owner", async () => {
    const fetcher = (async () =>
      new Response("unavailable", { status: 503 })) as typeof fetch;
    expect(await loadPublicDestination(fetcher, "/", true)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });

  it("falls back on malformed payload", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: { id: "morro-de-sao-paulo", center: {} },
          source: "destination-owner",
        }),
        { status: 200 },
      )) as typeof fetch;
    expect(await loadPublicDestination(fetcher, "/", true)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });

  it("falls back on unknown source", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: dynamic,
          source: "unexpected-source",
        }),
        { status: 200 },
      )) as typeof fetch;
    expect(await loadPublicDestination(fetcher, "/", true)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });

  it("falls back on transport failure", async () => {
    const fetcher = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    expect(await loadPublicDestination(fetcher, "/", true)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });
});

describe("Itacare context fail-closed public destination", () => {
  const itacare = {
    ...morroDeSaoPauloDestination,
    id: "itacare" as typeof morroDeSaoPauloDestination.id,
    name: "Itacaré",
    center: { latitude: -14.277, longitude: -38.997 },
  };
  it("reads Itacare only from an owner-backed response and correct context route", async () => {
    const fetcher = (async (url: string) => {
      expect(url).toBe("/d/itacare/api/runtime/destination");
      return new Response(
        JSON.stringify({
          destination: itacare,
          source: "destination-owner",
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const result = await loadPublicDestination(fetcher, "/d/itacare/explore");
    expect(result.destination.id).toBe("itacare");
    expect(result.source).toBe("destination-owner");
  });

  it("refuses Morro as an Itacare response even if the server says owner", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: morroDeSaoPauloDestination,
          source: "destination-owner",
        }),
        { status: 200 },
      )) as typeof fetch;
    await expect(loadPublicDestination(fetcher, "/d/itacare/")).rejects.toThrow(
      "PUBLIC_DESTINATION_IDENTITY_MISMATCH",
    );
  });

  it("never converts an Itacare owner outage into the Morro fallback", async () => {
    const unavailable = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;
    await expect(
      loadPublicDestination(unavailable, "/d/itacare/"),
    ).rejects.toThrow("PUBLIC_DESTINATION_HTTP_UNAVAILABLE");
  });

  it("rejects a static foreign destination fallback", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: itacare,
          source: "static-fallback",
        }),
        { status: 200 },
      )) as typeof fetch;
    await expect(loadPublicDestination(fetcher, "/d/itacare/")).rejects.toThrow(
      "PUBLIC_DESTINATION_FOREIGN_FALLBACK_DENIED",
    );
  });

  it("supports an owner destination on a dedicated hostname", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: itacare,
          source: "destination-owner",
        }),
        { status: 200 },
      )) as typeof fetch;
    const result = await loadPublicDestination(fetcher, "/");
    expect(result.destination.id).toBe("itacare");
  });

  it("rejects owner geo values beyond the common bounded public contract", async () => {
    for (const corrupt of [
      { ...itacare, center: { latitude: 90, longitude: -39 } },
      { ...itacare, radiusMeters: 100_001 },
    ]) {
      const fetcher = (async () =>
        new Response(
          JSON.stringify({ destination: corrupt, source: "destination-owner" }),
          { status: 200 },
        )) as typeof fetch;
      await expect(
        loadPublicDestination(fetcher, "/d/itacare/"),
      ).rejects.toThrow("PUBLIC_DESTINATION_INVALID");
    }
  });
  it("rejects malformed public owner fields without exposing foreign content", async () => {
    const fetcher = (async () =>
      new Response(
        JSON.stringify({
          destination: { ...itacare, center: { latitude: 999, longitude: 0 } },
          source: "destination-owner",
        }),
        { status: 200 },
      )) as typeof fetch;
    await expect(loadPublicDestination(fetcher, "/d/itacare/")).rejects.toThrow(
      "PUBLIC_DESTINATION_INVALID",
    );
  });
});

describe("ambiguous-host fallback protection", () => {
  it("does not assume Morro on a root URL if the owner endpoint is down", async () => {
    const unavailable = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;
    await expect(loadPublicDestination(unavailable)).rejects.toThrow(
      "PUBLIC_DESTINATION_HTTP_UNAVAILABLE",
    );
  });
  it("rejects malformed explicit destination paths before network access", async () => {
    const fetcher = (async () => {
      throw new Error("SHOULD_NOT_BE_CALLED");
    }) as typeof fetch;
    await expect(loadPublicDestination(fetcher, "/d/Itacare/")).rejects.toThrow(
      "PUBLIC_DESTINATION_ROUTE_INVALID",
    );
  });
  it("keeps a consciously opted-in Morro-only offline fallback", async () => {
    const fetcher = (async () =>
      new Response("offline", { status: 503 })) as typeof fetch;
    const result = await loadPublicDestination(
      fetcher,
      "/d/morro-de-sao-paulo/",
      true,
    );
    expect(result.destination.id).toBe("morro-de-sao-paulo");
  });
});

describe("Morro entry opt-in and reusable fail-closed contract", () => {
  it("uses the explicit Morro-only option at the retained browser entry", () => {
    const source = readFileSync(
      new URL("../browser-entry.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(
      /loadPublicDestination\(\s*fetch,\s*window\.location\.pathname,\s*true,?\s*\)/u,
    );
  });

  const failures: ReadonlyArray<readonly [string, typeof fetch]> = [
    [
      "transport",
      async () => {
        throw new Error("network");
      },
    ],
    ["HTTP 503", async () => new Response("offline", { status: 503 })],
    ["malformed payload", async () => new Response("{}", { status: 200 })],
    [
      "unknown source",
      async () =>
        new Response(
          JSON.stringify({
            destination: dynamic,
            source: "unknown",
          }),
          { status: 200 },
        ),
    ],
  ];

  it.each(failures)(
    "keeps %s fail-closed except for explicit Morro",
    async (_label, fetcher) => {
      await expect(loadPublicDestination(fetcher)).rejects.toThrow();
      await expect(loadPublicDestination(fetcher, "/")).rejects.toThrow();
      await expect(
        loadPublicDestination(fetcher, "/d/itacare/"),
      ).rejects.toThrow();
      await expect(
        loadPublicDestination(fetcher, "/d/itacare/", true),
      ).rejects.toThrow();
      for (const pagePath of ["/", "/d/morro-de-sao-paulo/"]) {
        await expect(
          loadPublicDestination(fetcher, pagePath, true),
        ).resolves.toEqual({
          destination: morroDeSaoPauloDestination,
          source: "static-fallback",
        });
      }
    },
  );
});
