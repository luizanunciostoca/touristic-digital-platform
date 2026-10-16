import { describe, expect, it } from "vitest";
import { groupProjectedMarkers } from "./explore-marker-grouping.js";

const project = ([x, y]: [number, number]) => ({ x, y });
const member = (key: string, longitude: number, latitude: number) => ({
  key,
  longitude,
  latitude,
});

describe("projection-based discovery membership", () => {
  it("groups overlapping square hit targets, including diagonal overlaps", () => {
    const a = member("canonical:a", 0, 0);
    const b = member("local:b", 40, 40);
    expect(groupProjectedMarkers([b, a], project)[0]?.members).toEqual([a, b]);
    expect(
      groupProjectedMarkers([a, b], ([x, y]) => ({ x: x * 2, y: y * 2 })),
    ).toHaveLength(2);
  });

  it("keeps all coincident categories and same-name source identities", () => {
    const sources = [
      "canonical:a",
      "canonical:b",
      "local:0",
      "mapbox:0",
      "catalog:0",
    ];
    const members = sources.map((key) => member(key, 1, 1));
    const groups = groupProjectedMarkers(members, project);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.members.map(({ key }) => key)).toEqual(
      [...sources].sort(),
    );
  });

  it("uses a real member medoid and deterministic ordering rather than an invented centroid", () => {
    const members = Array.from({ length: 16 }, (_, index) =>
      member(
        `ring${index}`,
        70 * Math.cos((index * Math.PI) / 8),
        70 * Math.sin((index * Math.PI) / 8),
      ),
    );
    members.push(member("center", 0, 0));
    const groups = groupProjectedMarkers(members, project);
    expect(groups.flatMap(({ members }) => members)).toHaveLength(17);
    expect(groups).toHaveLength(2);
    for (const group of groups) expect(group.members).toContain(group.anchor);
    expect(groupProjectedMarkers([...members].reverse(), project)).toEqual(
      groups,
    );
  });

  it("keeps anchors of distinct components separated at the same nonlinear projection", () => {
    const members = [
      member("a", 0, 0),
      member("b", 2, 0),
      member("c", 30, 30),
      member("d", 31, 30),
    ];
    const nonlinear = ([x, y]: [number, number]) => ({ x: x * x, y: y * y });
    const groups = groupProjectedMarkers(members, nonlinear);
    for (let left = 0; left < groups.length; left += 1) {
      for (let right = left + 1; right < groups.length; right += 1) {
        const a = groups[left]!.anchor;
        const b = groups[right]!.anchor;
        const pa = nonlinear([a.longitude, a.latitude]);
        const pb = nonlinear([b.longitude, b.latitude]);
        expect(
          Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y)),
        ).toBeGreaterThan(48);
      }
    }
  });

  it("rejects unavailable projection and ambiguous membership without a degree-distance substitute", () => {
    expect(() =>
      groupProjectedMarkers([member("a", 0, 0)], () => ({ x: NaN, y: 0 })),
    ).toThrow("projection unavailable");
    expect(() =>
      groupProjectedMarkers([member("a", 0, 0), member("a", 2, 2)], project),
    ).toThrow("membership");
    expect(() =>
      groupProjectedMarkers([member("a", Infinity, 0)], project),
    ).toThrow("membership");
    expect(groupProjectedMarkers([], project)).toEqual([]);
  });
});
