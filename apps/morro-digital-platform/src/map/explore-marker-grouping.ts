export interface ProjectedMarkerMember {
  readonly key: string;
  readonly longitude: number;
  readonly latitude: number;
}

export interface MarkerProjection {
  readonly x: number;
  readonly y: number;
}

export interface ProjectedMarkerGroup<T extends ProjectedMarkerMember> {
  readonly members: readonly T[];
  readonly anchor: T;
}

/** 44px centered button hit boxes plus a 4px gap, at the current camera. */
export function groupProjectedMarkers<T extends ProjectedMarkerMember>(
  members: readonly T[],
  project: (coordinates: [number, number]) => MarkerProjection,
): readonly ProjectedMarkerGroup<T>[] {
  const sorted = [...members].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  if (
    sorted.some(
      (member) =>
        !member.key.trim() ||
        !Number.isFinite(member.longitude) ||
        !Number.isFinite(member.latitude),
    ) ||
    new Set(sorted.map((member) => member.key)).size !== sorted.length
  ) {
    throw new Error("Invalid marker membership");
  }
  const pixels = sorted.map((member) =>
    project([member.longitude, member.latitude]),
  );
  if (
    pixels.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    throw new Error("Marker projection unavailable");
  }
  const parents = sorted.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root]!;
    while (parents[index] !== index) {
      const next = parents[index]!;
      parents[index] = root;
      index = next;
    }
    return root;
  };
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const a = pixels[left]!;
      const b = pixels[right]!;
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 48) {
        parents[find(right)] = find(left);
      }
    }
  }
  const components = new Map<number, number[]>();
  for (let index = 0; index < sorted.length; index += 1) {
    const root = find(index);
    const component = components.get(root) ?? [];
    component.push(index);
    components.set(root, component);
  }
  return Object.freeze(
    [...components.values()].map((indices) => {
      const score = (index: number): number =>
        indices.reduce((sum, other) => {
          const a = pixels[index]!;
          const b = pixels[other]!;
          return sum + (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        }, 0);
      // Equal scores keep lexical order. A real member anchor avoids collisions
      // introduced by centroids and needs no inverse/nonlinear projection.
      const anchor = indices.reduce((best, index) =>
        score(index) < score(best) ? index : best,
      );
      return Object.freeze({
        members: Object.freeze(indices.map((index) => sorted[index]!)),
        anchor: sorted[anchor]!,
      });
    }),
  );
}
