import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";

import {
  ContentAdminApplicationService,
  MySqlContentRepository,
  applyContentM156Schema,
  createContentPool,
} from "./index.js";

const databaseUrl = process.env.CONTENT_DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("Content owner MySQL acceptance", () => {
  const pool = createContentPool(databaseUrl);
  const repository = new MySqlContentRepository(pool);
  let clock = "2026-09-20T20:00:00.000Z";
  const service = new ContentAdminApplicationService(repository, () => clock);

  beforeAll(async () => {
    await applyContentM156Schema(pool);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM content_documents");
    clock = "2026-09-20T20:00:00.000Z";
  });

  afterAll(async () => {
    await pool.end();
  });

  it("persists owner-created content and projects it through list/read", async () => {
    const created = await service.create({
      id: "content-control-center-001",
      destinationId: "morro-de-sao-paulo",
      kind: "place",
      locale: "pt-BR",
      sourceReference: "place:segunda-praia",
      fields: {
        title: "Segunda Praia",
        summary: "Conteúdo administrado pelo domínio Content.",
      },
    });

    expect(created.status).toBe("draft");
    expect(created.version).toBe(1);
    await expect(service.read(created.id)).resolves.toEqual(created);

    const listed = await service.list({
      query: "segunda-praia",
      destinationId: "morro-de-sao-paulo",
      limit: 10,
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
  });

  it("owns revision and lifecycle transitions with optimistic concurrency", async () => {
    const created = await service.create({
      id: "content-control-center-002",
      destinationId: "morro-de-sao-paulo",
      kind: "event",
      locale: "pt-BR",
      fields: { title: "Evento editorial" },
    });

    clock = "2026-09-20T20:05:00.000Z";
    const revised = await service.revise(created.id, {
      title: "Evento editorial revisado",
    });
    expect(revised.version).toBe(2);

    clock = "2026-09-20T20:10:00.000Z";
    const scheduled = await service.transition(created.id, {
      status: "scheduled",
      scheduledFor: "2026-09-21T12:00:00.000Z",
    });
    expect(scheduled.status).toBe("scheduled");

    clock = "2026-09-21T12:00:00.000Z";
    const published = await service.transition(created.id, {
      status: "published",
    });
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe(clock);

    clock = "2026-09-21T13:00:00.000Z";
    const archived = await service.transition(created.id, {
      status: "archived",
    });
    expect(archived.status).toBe("archived");

    await expect(
      service.revise(created.id, { title: "Mutação terminal" }),
    ).rejects.toThrow("CONTENT_TRANSITION_INVALID");
  });

  it("fails a stale repository replacement instead of losing a concurrent edit", async () => {
    const created = await service.create({
      id: "content-control-center-003",
      destinationId: "morro-de-sao-paulo",
      kind: "seo",
      locale: "pt-BR",
      fields: { title: "SEO original" },
    });
    const stale = await repository.get(created.id);
    if (!stale) throw new Error("CONTENT_FIXTURE_MISSING");

    clock = "2026-09-20T20:05:00.000Z";
    await service.revise(created.id, { title: "SEO atualizado" });

    expect(await repository.replace(stale, {
      ...stale,
      version: stale.version + 1,
      fields: { ...stale.fields, title: "Sobrescrita stale" },
      updatedAt: "2026-09-20T20:06:00.000Z",
    })).toBe(false);
  });

  it("preserves Commerce/Financial authority by rejecting offer monetary fields", async () => {
    await expect(
      service.create({
        id: "content-control-center-004",
        destinationId: "morro-de-sao-paulo",
        kind: "offer_reference",
        locale: "pt-BR",
        sourceReference: "offer:tour-001",
        fields: {
          label: "Reservar",
          price: 100,
        },
      }),
    ).rejects.toThrow("CONTENT_INVALID_INPUT");
  });
});
