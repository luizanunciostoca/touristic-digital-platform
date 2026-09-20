import { describe, expect, it } from "vitest";

import {
  createContentDraft,
  transitionContent,
  type ContentDocument,
} from "./index.js";
import {
  createOfflineContentSnapshot,
  isOfflineContentSnapshotFresh,
  parseOfflineContentSnapshot,
  projectPublicContent,
  selectLocalizedPublicContent,
} from "./public-projection.js";

function published(input: {
  id: string;
  kind?: ContentDocument["kind"];
  locale: string;
  sourceReference?: string;
  fields?: Readonly<Record<string, unknown>>;
  publishedAt?: string;
}): ContentDocument {
  const createdAt = "2026-09-20T10:00:00.000Z";
  const draft = createContentDraft({
    id: input.id,
    destinationId: "morro-de-sao-paulo",
    kind: input.kind ?? "place",
    locale: input.locale,
    ...(input.sourceReference
      ? { sourceReference: input.sourceReference }
      : {}),
    fields: input.fields ?? { title: input.id },
    createdAt,
  });
  if (!draft) throw new Error("Expected valid content fixture.");

  const result = transitionContent(draft, {
    status: "published",
    transitionedAt: input.publishedAt ?? "2026-09-20T10:05:00.000Z",
  });
  if (!result) throw new Error("Expected published content fixture.");
  return result;
}

describe("public content projection", () => {
  it("never exposes non-published lifecycle states", () => {
    const draft = createContentDraft({
      id: "place-draft",
      destinationId: "morro-de-sao-paulo",
      kind: "place",
      locale: "pt-BR",
      fields: { title: "Rascunho" },
      createdAt: "2026-09-20T10:00:00.000Z",
    });
    if (!draft) throw new Error("Expected valid draft fixture.");

    const preview = transitionContent(draft, {
      status: "preview",
      transitionedAt: "2026-09-20T10:01:00.000Z",
    });
    const scheduled = transitionContent(draft, {
      status: "scheduled",
      transitionedAt: "2026-09-20T10:01:00.000Z",
      scheduledFor: "2026-09-21T10:00:00.000Z",
    });

    expect(projectPublicContent(draft)).toBeNull();
    expect(preview && projectPublicContent(preview)).toBeNull();
    expect(scheduled && projectPublicContent(scheduled)).toBeNull();
  });

  it("selects exact locale before language and configured fallback", () => {
    const documents = [
      published({
        id: "place-pt",
        locale: "pt-BR",
        sourceReference: "place:segunda-praia",
        fields: { title: "Segunda Praia" },
      }),
      published({
        id: "place-en",
        locale: "en",
        sourceReference: "place:segunda-praia",
        fields: { title: "Second Beach" },
      }),
      published({
        id: "place-es",
        locale: "es",
        sourceReference: "place:segunda-praia",
        fields: { title: "Segunda Playa" },
      }),
    ];

    expect(
      selectLocalizedPublicContent(documents, {
        destinationId: "morro-de-sao-paulo",
        kind: "place",
        sourceReference: "place:segunda-praia",
        preferredLocales: ["en-US", "es"],
      })?.fields.title,
    ).toBe("Second Beach");

    expect(
      selectLocalizedPublicContent(documents, {
        destinationId: "morro-de-sao-paulo",
        kind: "place",
        sourceReference: "place:segunda-praia",
        preferredLocales: ["fr-FR"],
        fallbackLocale: "pt-BR",
      })?.fields.title,
    ).toBe("Segunda Praia");
  });
});

describe("offline content snapshot", () => {
  it("contains only published, offline-safe content kinds", () => {
    const documents = [
      published({ id: "destination-1", kind: "destination", locale: "pt-BR" }),
      published({ id: "place-1", kind: "place", locale: "pt-BR" }),
      published({ id: "tour-1", kind: "tour", locale: "pt-BR" }),
      published({ id: "event-1", kind: "event", locale: "pt-BR" }),
      published({
        id: "offer-1",
        kind: "offer_reference",
        locale: "pt-BR",
        sourceReference: "offer:tour-001",
        fields: { label: "Reservar" },
      }),
    ];

    const snapshot = createOfflineContentSnapshot(documents, {
      destinationId: "morro-de-sao-paulo",
      generatedAt: "2026-09-20T10:00:00.000Z",
      expiresAt: "2026-09-21T10:00:00.000Z",
    });

    expect(snapshot?.documents.map((document) => document.kind)).toEqual([
      "destination",
      "place",
      "tour",
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("offer:tour-001");
  });

  it("requires a bounded freshness window", () => {
    const snapshot = createOfflineContentSnapshot(
      [published({ id: "place-1", locale: "pt-BR" })],
      {
        destinationId: "morro-de-sao-paulo",
        generatedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-20T12:00:00.000Z",
      },
    );
    if (!snapshot) throw new Error("Expected valid snapshot.");

    expect(
      isOfflineContentSnapshotFresh(
        snapshot,
        "2026-09-20T11:59:59.000Z",
      ),
    ).toBe(true);
    expect(
      isOfflineContentSnapshotFresh(
        snapshot,
        "2026-09-20T12:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("validates cached JSON before it can become an offline snapshot", () => {
    const snapshot = createOfflineContentSnapshot(
      [published({ id: "place-1", locale: "pt-BR" })],
      {
        destinationId: "morro-de-sao-paulo",
        generatedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-20T12:00:00.000Z",
      },
    );
    if (!snapshot) throw new Error("Expected valid snapshot.");

    expect(
      parseOfflineContentSnapshot(JSON.parse(JSON.stringify(snapshot))),
    ).toEqual(snapshot);

    expect(
      parseOfflineContentSnapshot({
        ...snapshot,
        documents: [
          ...snapshot.documents,
          {
            ...snapshot.documents[0],
            id: "offer-unsafe",
            kind: "offer_reference",
          },
        ],
      }),
    ).toBeNull();

    expect(
      parseOfflineContentSnapshot({
        ...snapshot,
        documents: [
          {
            ...snapshot.documents[0],
            fields: { unsafe: { nested: true } },
          },
        ],
      }),
    ).toBeNull();
  });
});
