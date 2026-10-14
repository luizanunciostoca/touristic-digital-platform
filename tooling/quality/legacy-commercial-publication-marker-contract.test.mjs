import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Recurring CI executes this source-level contract via the impact suite.
// The application's Vitest suite independently tests behavioral lifecycle
// transitions; quality tooling never imports apps as a direct dependency.
test("legacy publication marker provenance and safety invariants", () => {
  const source = readFileSync(
    "apps/morro-digital-platform/tooling/legacy-commercial-draft-verify-core.mjs",
    "utf8",
  );
  const start = source.indexOf(
    "async function loadPublicationMarkerSummary(pool)",
  );
  const end = source.indexOf(
    "\nexport async function verifyLegacyCommercialDraftBackfill",
    start,
  );
  assert.ok(start >= 0 && end > start, "PUBLICATION_VERIFIER_SOURCE_MISSING");
  const marker = source.slice(start, end);

  assert.match(
    marker,
    /p\.published_revision IS NOT NULL AND\s+pm\.editable_revision <= p\.published_revision/u,
    "historical marker may predate a valid later publication",
  );
  assert.match(
    marker,
    /p\.published_revision IS NOT NULL AND\s+pm\.editable_revision > p\.published_revision/u,
    "future marker must fail closed",
  );
  assert.doesNotMatch(
    marker,
    /pm\.editable_revision = p\.published_revision/u,
    "historical marker must not lock the current published revision",
  );
  assert.match(
    marker,
    /p\.published_revision IS NULL AND\s+p\.publication_state IN \('draft','review'\) AND\s+pm\.editable_revision = p\.editable_revision/u,
    "unpublished draft/review marker requires exact editable revision",
  );
  assert.match(
    marker,
    /pm\.editable_revision <> p\.editable_revision/u,
    "unpublished marker revision drift must be rejected",
  );
  for (const guard of [
    /m\.source_key IS NULL OR/u,
    /p\.place_id IS NULL OR/u,
    /pm\.business_id <> m\.business_id/u,
    /pm\.place_id <> m\.place_id/u,
    /WHERE pm\.source_system = \?/u,
  ]) {
    assert.match(marker, guard, "mapped identity/source guard missing");
  }
  for (const invariant of [
    /c\.place_revision = p\.published_revision/u,
    /s\.place_revision = p\.published_revision/u,
    /summary\.publishedCatalogSnapshotCount !== summary\.publishedRevisionCount/u,
    /summary\.publishedMediaSnapshotCount !== summary\.publishedRevisionCount/u,
    /summary\.publicationMarkerDriftCount !== 0/u,
    /summary\.publicationMarkerCount > EXPECTED_TOTAL/u,
    /LEGACY_COMMERCIAL_DRAFT_VERIFY_PUBLICATION_MARKER_INVARIANT/u,
    /const EXPECTED_TOTAL = 72;/u,
  ]) {
    assert.match(source, invariant, "snapshot or 72-item cohort check missing");
  }
  const batch = readFileSync(
    "apps/morro-digital-platform/tooling/legacy-commercial-publication-batch.mjs",
    "utf8",
  );
  assert.match(
    batch,
    /reviewRevision <= editableRevision/u,
    "review provenance may predate later edits or publications",
  );
  assert.match(
    batch,
    /markerRevision <= publishedRevision/u,
    "publication migration marker must be bounded by current published revision",
  );
  assert.match(
    batch,
    /markerRevision === editableRevision/u,
    "unpublished marker must be bound to exact editable revision",
  );
  assert.match(
    batch,
    /!markerRevisionMatches/u,
    "marker drift remains fail closed",
  );
  assert.doesNotMatch(
    batch,
    /Number\(marker\.editable_revision\) !== markerRevision/u,
    "migration marker must not require equality with a later published revision",
  );
});
