import { describe, expect, it, vi } from "vitest";

import type { MorroV1SearchCatalogItem } from "@touristic/search";

import { resolvePlacePrimaryAction } from "./place-commerce-capability.js";

const nightlife: MorroV1SearchCatalogItem = Object.freeze({
  name: "Toca do Morcego",
  latitude: -13.3766787,
  longitude: -38.9172057,
  category: "nightlife",
});

const transport: MorroV1SearchCatalogItem = Object.freeze({
  name: "Agência de Passagens do Terminal",
  latitude: -13.3774,
  longitude: -38.9138,
  category: "transport",
});

const garapuaTour: MorroV1SearchCatalogItem = Object.freeze({
  name: "Passeio para Garapuá",
  latitude: -13.4769538,
  longitude: -38.9165457,
  category: "tours",
  aliases: ["garapua tour", "passeio garapua"],
});

function response(data: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue({ data }),
  } as unknown as Response;
}

function offer(overrides: Record<string, unknown> = {}) {
  return {
    id: "mpi_12345678",
    destinationId: "morro-de-sao-paulo",
    product: {
      kind: "business_experience",
      reference: "morro-pro:toca-do-morcego:the-party",
    },
    label: "Toca do Morcego · The Party",
    unitAmount: { minorUnits: 8000, currency: "BRL" },
    salesStartAt: "2026-09-01T00:00:00.000Z",
    salesEndAt: "2026-09-20T00:00:00.000Z",
    startsAt: "2026-09-20T02:00:00.000Z",
    availableQuantity: 20,
    ...overrides,
  };
}

describe("place commerce capability", () => {
  it("creates a full-width direct ticket CTA for a matching nightlife offer", async () => {
    const fetch = vi.fn().mockResolvedValue(response([offer()]));
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toMatchObject({
      value: "commerce:offer:mpi_12345678",
      presentation: "primary",
      commerceState: "sellable",
    });
    expect(action?.label).toContain("Comprar ingressos");
    expect(action?.label).toContain("80");
  });

  it("matches an explicitly place-bound Morro Pro offer even when its label omits the venue", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response([
        offer({
          product: {
            kind: "business_experience",
            reference: "morro-pro:business-a:place-toca-do-morcego:the-party",
          },
          label: "The Party",
        }),
      ]),
    );
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toMatchObject({
      value: "commerce:offer:mpi_12345678",
      commerceState: "sellable",
    });
  });

  it("keeps a place-specific ticket CTA visible when nightlife inventory has no matching offer", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
    });

    expect(action).toEqual({
      actionId: "nightlife.tickets",
      label: "🎟️ Comprar ingressos",
      value: "commerce:place:toca-do-morcego",
      presentation: "primary",
      commerceState: "fallback",
    });
  });

  it("uses a filtered multi-offer CTA when the place has more than one sellable offer", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response([
          offer(),
          offer({ id: "mpi_87654321", label: "Toca do Morcego · Sunset" }),
        ]),
      );
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toEqual(
      expect.objectContaining({
        label: "🎟️ Ver ingressos (2 opções)",
        value: "commerce:offers:mpi_12345678,mpi_87654321",
        presentation: "primary",
        commerceState: "multiple",
      }),
    );
  });

  it("caps multi-offer handoffs at the checkout parser limit", async () => {
    const inventory = Array.from({ length: 21 }, (_, index) =>
      offer({
        id: `mpi_bulk_${String(index).padStart(2, "0")}`,
        label: `Toca do Morcego · Opção ${index + 1}`,
        startsAt: new Date(
          Date.parse("2026-09-20T02:00:00.000Z") + index * 60_000,
        ).toISOString(),
      }),
    );
    const fetch = vi.fn().mockResolvedValue(response(inventory));
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action?.label).toBe("🎟️ Ver ingressos (20 opções)");
    const ids = action?.value.replace("commerce:offers:", "").split(",");
    expect(ids).toHaveLength(20);
    expect(ids).toContain("mpi_bulk_00");
    expect(ids).not.toContain("mpi_bulk_20");
  });

  it("keeps sold-out inventory visible as a disabled primary CTA", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response([offer({ availableQuantity: 0 })]));
    const action = await resolvePlacePrimaryAction({
      location: nightlife,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toMatchObject({
      label: "🎟️ Ingressos esgotados",
      disabled: true,
      commerceState: "sold_out",
    });
  });

  it("matches concise tour labels through the catalog aliases", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response([
        offer({
          id: "mpi_garapua01",
          product: {
            kind: "tour",
            reference: "tour:garapua",
          },
          label: "Garapuá",
        }),
      ]),
    );
    const action = await resolvePlacePrimaryAction({
      location: garapuaTour,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toMatchObject({
      value: "commerce:offer:mpi_garapua01",
      commerceState: "sellable",
    });
    expect(action?.label).toContain("Comprar ingressos");
  });

  it("falls back to the transport request action when no ticketable inventory matches", async () => {
    const fetch = vi.fn().mockResolvedValue(response([]));
    const action = await resolvePlacePrimaryAction({
      location: transport,
      locale: "pt",
      fetch,
    });

    expect(action).toMatchObject({
      actionId: "transport.request",
      label: "🚕 Solicitar transporte",
      value: "solicitar transporte",
      presentation: "primary",
      commerceState: "fallback",
    });
  });

  it("does not reinterpret business experiences as transport tickets", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response([
        offer({
          id: "mpi_transportlegacy",
          destinationId: "transport-agencia-de-passagens-do-terminal",
          product: {
            kind: "business_experience",
            reference: "agencia-de-passagens-do-terminal",
          },
          label: "Agência de Passagens do Terminal",
        }),
      ]),
    );
    const action = await resolvePlacePrimaryAction({
      location: transport,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action).toMatchObject({
      label: "🚕 Solicitar transporte",
      value: "solicitar transporte",
      commerceState: "fallback",
    });
  });

  it("uses the transport-specific purchase copy when a transport offer exists", async () => {
    const fetch = vi.fn().mockResolvedValue(
      response([
        offer({
          id: "tin_transport01",
          destinationId: "transport-agencia-de-passagens-do-terminal",
          product: {
            kind: "transport",
            reference: "agencia-de-passagens-do-terminal",
          },
          label: "Agência de Passagens do Terminal",
        }),
      ]),
    );
    const action = await resolvePlacePrimaryAction({
      location: transport,
      locale: "pt",
      fetch,
      now: () => Date.parse("2026-09-19T22:00:00.000Z"),
    });

    expect(action?.label).toContain("Comprar passagem");
    expect(action?.value).toBe("commerce:offer:tin_transport01");
  });
});
