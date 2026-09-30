import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCanonicalCoverage, mapCameraQuery } from '../src/canonical-places.mjs';

const query = mapCameraQuery({
  destinationId: 'morro-de-sao-paulo',
  bbox: [-39.05, -13.5, -38.89, -13.35],
  zoom: 13
});

test('P02 bounded pagination reports pages actually fetched and does not imply completeness', async () => {
  let count = 0;
  const client = { async listMap() {
    count += 1;
    return {
      items: [{ id: 'test-' + count, name: 'Local ' + count,
        category: 'beaches', lat: -13.4, lng: -38.9 }],
      nextCursor: 'cursor-' + count
    };
  }};
  const got = await fetchCanonicalCoverage(client, query, { maxPages: 2 });
  assert.equal(got.pages, 2);
  assert.equal(got.items.length, 2);
  assert.equal(got.complete, false);
  assert.equal(count, 2);
});

test('P02 complete query counts its single terminal page exactly', async () => {
  const got = await fetchCanonicalCoverage({
    async listMap() { return { items: [], nextCursor: null }; }
  }, query, { maxPages: 20 });
  assert.equal(got.pages, 1);
  assert.equal(got.complete, true);
  assert.equal(got.queried, true);
});
