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
    expect(await loadPublicDestination(fetcher)).toEqual({
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
    expect(await loadPublicDestination(fetcher)).toEqual({
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
    expect(await loadPublicDestination(fetcher)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });

  it("falls back on transport failure", async () => {
    const fetcher = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    expect(await loadPublicDestination(fetcher)).toEqual({
      destination: morroDeSaoPauloDestination,
      source: "static-fallback",
    });
  });
});
