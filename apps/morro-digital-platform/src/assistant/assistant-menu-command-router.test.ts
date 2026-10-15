import { describe, expect, it } from "vitest";
import { readAssistantExploreState } from "./assistant-menu-command-router.js";

function documentWithCounts(markers: string, members?: string): Document {
  const attributes: Record<string, string> = {
    "data-map-marker-count": markers,
    ...(members !== undefined
      ? { "data-explore-location-count": members }
      : {}),
  };
  return {
    getElementById: () => ({
      getAttribute: (key: string) => attributes[key] ?? null,
    }),
  } as unknown as Document;
}

describe("Explore semantic count DOM contract", () => {
  it("preserves the exact legacy shape when semantic capability is absent", () => {
    const snapshot = readAssistantExploreState(documentWithCounts("3"));
    expect(Object.hasOwn(snapshot, "locationCount")).toBe(false);
    expect(snapshot.markerCount).toBe(3);
  });
  it("keeps physical symbols separate from canonical locations", () => {
    const snapshot = readAssistantExploreState(documentWithCounts("2", "9"));
    expect(snapshot.markerCount).toBe(2);
    expect(snapshot.locationCount).toBe(9);
  });
  it("preserves explicit zero instead of treating it as unknown", () => {
    expect(
      readAssistantExploreState(documentWithCounts("7", "0")).locationCount,
    ).toBe(0);
  });
  it.each(["", "  ", "NaN", "Infinity", "-1", "1.5", "undefined"])(
    "fails closed for present invalid semantic count %s",
    (members) => {
      const snapshot = readAssistantExploreState(
        documentWithCounts("3", members),
      );
      expect(snapshot.locationCount).toBeNull();
      expect(snapshot.markerCount).toBe(3);
    },
  );
});
