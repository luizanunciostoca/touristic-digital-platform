import { describe, expect, it } from "vitest";

import {
  contentKinds,
  createContentDraft,
  isContentPublic,
  publishScheduledContent,
  reviseContent,
  transitionContent,
} from "./index.js";

const draft = createContentDraft({
  id: "content-001",
  destinationId: "morro-de-sao-paulo",
  kind: "place",
  locale: "pt-BR",
  sourceReference: "place:segunda-praia",
  fields: {
    title: "Segunda Praia",
    summary: "Conteúdo editorial do local.",
    mediaIds: ["media-001", "media-002"],
  },
  createdAt: "2026-09-20T10:00:00.000Z",
});

if (!draft) throw new Error("Content fixture must be valid.");

describe("content model", () => {
  it("materializes all canonical CMS entity kinds", () => {
    expect(contentKinds).toEqual([
      "destination",
      "category",
      "place",
      "media",
      "tour",
      "event",
      "translation",
      "seo",
      "offer_reference",
    ]);
  });

  it("creates version one as a private draft", () => {
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);
    expect(isContentPublic(draft)).toBe(false);
  });

  it("rejects nested field values", () => {
    expect(
      createContentDraft({
        id: "content-002",
        destinationId: "morro-de-sao-paulo",
        kind: "place",
        locale: "pt-BR",
        fields: {
          nested: { unsafe: true },
        },
        createdAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("keeps offer references outside pricing and payment authority", () => {
    expect(
      createContentDraft({
        id: "content-003",
        destinationId: "morro-de-sao-paulo",
        kind: "offer_reference",
        locale: "pt-BR",
        sourceReference: "offer:tour-001",
        fields: {
          label: "Reservar",
          price: 150,
        },
        createdAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBeNull();

    expect(
      createContentDraft({
        id: "content-004",
        destinationId: "morro-de-sao-paulo",
        kind: "offer_reference",
        locale: "pt-BR",
        sourceReference: "offer:tour-001",
        fields: {
          label: "Reservar",
        },
        createdAt: "2026-09-20T10:00:00.000Z",
      }),
    ).not.toBeNull();
  });
});

describe("content versioning", () => {
  it("increments versions only while content is editable", () => {
    const revised = reviseContent(
      draft,
      { summary: "Nova descrição editorial." },
      "2026-09-20T10:05:00.000Z",
    );

    expect(revised?.version).toBe(2);
    expect(revised?.fields.summary).toBe("Nova descrição editorial.");

    const published = transitionContent(revised!, {
      status: "published",
      transitionedAt: "2026-09-20T10:10:00.000Z",
    });
    expect(published).not.toBeNull();
    expect(
      reviseContent(
        published!,
        { summary: "Mutação direta proibida." },
        "2026-09-20T10:15:00.000Z",
      ),
    ).toBeNull();
  });
});

describe("content lifecycle", () => {
  it("supports preview without exposing content publicly", () => {
    const preview = transitionContent(draft, {
      status: "preview",
      transitionedAt: "2026-09-20T10:05:00.000Z",
    });

    expect(preview?.status).toBe("preview");
    expect(isContentPublic(preview!)).toBe(false);
  });

  it("requires a future timestamp for scheduled content", () => {
    expect(
      transitionContent(draft, {
        status: "scheduled",
        transitionedAt: "2026-09-20T10:05:00.000Z",
        scheduledFor: "2026-09-20T10:04:00.000Z",
      }),
    ).toBeNull();

    const scheduled = transitionContent(draft, {
      status: "scheduled",
      transitionedAt: "2026-09-20T10:05:00.000Z",
      scheduledFor: "2026-09-21T12:00:00.000Z",
    });
    expect(scheduled?.status).toBe("scheduled");
    expect(isContentPublic(scheduled!)).toBe(false);
  });

  it("does not publish scheduled content before its due time", () => {
    const scheduled = transitionContent(draft, {
      status: "scheduled",
      transitionedAt: "2026-09-20T10:05:00.000Z",
      scheduledFor: "2026-09-21T12:00:00.000Z",
    })!;

    expect(
      publishScheduledContent(scheduled, "2026-09-21T11:59:59.000Z"),
    ).toBeNull();

    const published = publishScheduledContent(
      scheduled,
      "2026-09-21T12:00:00.000Z",
    );
    expect(published?.status).toBe("published");
    expect(isContentPublic(published!)).toBe(true);
  });

  it("makes archived content terminal and non-public", () => {
    const published = transitionContent(draft, {
      status: "published",
      transitionedAt: "2026-09-20T10:05:00.000Z",
    })!;
    const archived = transitionContent(published, {
      status: "archived",
      transitionedAt: "2026-09-20T11:00:00.000Z",
    })!;

    expect(archived.status).toBe("archived");
    expect(isContentPublic(archived)).toBe(false);
    expect(
      transitionContent(archived, {
        status: "draft",
        transitionedAt: "2026-09-20T12:00:00.000Z",
      }),
    ).toBeNull();
  });
});
