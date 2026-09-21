import { describe, expect, it } from "vitest";
import { morroDeSaoPauloDestination } from "../config/destination.js";
import { loadPublicDestination } from "./public-destination.js";

const dynamic = {
  ...morroDeSaoPauloDestination,
  name: "Morro governado",
  center: { latitude: -13.4, longitude: -38.9 },
};

describe("public Destination browser runtime", () => {
  it("loads a valid owner projection", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ destination: dynamic, source: "destination-owner" }), { status: 200 })) as typeof fetch;
    const result = await loadPublicDestination(fetcher);
    expect(result.name).toBe("Morro governado");
    expect(result.center.latitude).toBe(-13.4);
  });
  it("falls back on unavailable owner", async () => {
    const fetcher = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
    expect(await loadPublicDestination(fetcher)).toBe(morroDeSaoPauloDestination);
  });
  it("falls back on malformed payload", async () => {
    const fetcher = (async () => new Response(JSON.stringify({ destination: { id: "morro-de-sao-paulo", center: {} } }), { status: 200 })) as typeof fetch;
    expect(await loadPublicDestination(fetcher)).toBe(morroDeSaoPauloDestination);
  });
  it("falls back on transport failure", async () => {
    const fetcher = (async () => { throw new Error("network"); }) as typeof fetch;
    expect(await loadPublicDestination(fetcher)).toBe(morroDeSaoPauloDestination);
  });
});
