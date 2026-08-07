import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const V1_SOURCE_COMMIT = "60746fd7fed97b805758b37adfdbe3bad2582bfe";

// prettier-ignore
const V1_STYLE_BLOBS = Object.freeze({
  "css/base/variables.css": "8686e390ef14db5de3dd84f6394f0c896160ff42",
  "css/base/reset.css": "b9f10017ccdb2b4e6690badcc92c746fde9cb5a6",
  "css/base/typography.css": "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
  "css/base/animations.css": "ade5ec27700719e43d7fc57885964a2b1f9dd8ec",
  "css/layout/app-shell.css": "3db603bc3926909c2cd97e809f098ab087aa1f44",
  "css/layout/map.css": "78a463817403e52c065b15d1d5aaa955f1f288eb",
  "css/layout/controls.css": "e1a7ee53a59b34533e58ca445565f04e57b1da99",
  "css/components/buttons/buttons.css": "738938e5baf4b4c707f84baf71903b6adc942225",
  "css/components/buttons/end-navigation-btn.css": "df0a8b39578ae26ed54c416d02dbb02b42b9fde7",
  "css/components/map/map-indicators.css": "b028ea18228b0d2c862cfcf9aa0a82815cdedef2",
  "css/components/map/map-rotation.css": "9748a061f6562a6622e1fec9a4d607eb2ed90116",
  "css/components/map/map-3d-fixes.css": "f86fdf9e3d1b7f5a8dd122fc1a3667799a6b28b2",
  "css/components/map/map3d-loading.css": "ab0cc2a409218657b9c45bf6806d56f27373a7d6",
  "css/components/map/map-controls.css": "9efa5e12616bd3c9dc137e22d97d5954ee98ace7",
  "css/components/map/map3d.css": "ae4156a081b699b4c95dc1c29b08de6fbe4ea42f",
  "css/components/map/mapbox-osm-3d.css": "bef2a48bef9f25243c11e3dd91c7df70309ac1ef",
  "css/components/navigation/navigation-banner.css": "8479b004fea2120ac79cd6b72e7ecf5425bf63e1",
  "css/components/assistant/assistant-mood.css": "3858c89e4eb50cf0b770b52b5f34da0582248091",
  "css/components/assistant/carouselModal.css": "0d54235be69ca4ff1ba7665597c8eb432ab8055d",
  "css/components/assistant/assistant-voice-selector.css": "9ebbb49c1585a88ae6aaec90a74c23b04216b5b5",
  "css/components/tour/tour.css": "d00aedf8e203efb9f1b0741af51187f3df5e75eb",
  "css/components/popups.css": "e1b2c2fb8c3eff36eae67ba8a591481cfbb4b3b5",
  "css/components/inputs/inputs.css": "01e4db77b833a17539003e33f8852de2908ed68b",
  "css/components/weather.css": "e97d5943745dd8fec90de1cd27310574c2faa9a5",
  "css/components/markers.css": "5174e01aaf07191ac8bc24ff27408c05937f65c2",
  "css/components/location-indicator.css": "f96410d39fd3fd667a49050f2af845ed303ea9e6",
  "css/components/accessibility.css": "353bd093f10b130a9013eb728899ce82c3f62894",
  "css/navigation/user-marker.css": "afc71664532225c4b0261cf7c8b5e9823bebcc0a",
  "css/vendor/leaflet-custom.css": "31a3aff72b6ae836fea8b45430e20d3fa578922c",
  "css/vendor-fixes.css": "dc95a6e22ebf43bb30303f50bd129a700be1b784",
  "css/base/responsive.css": "1d20db0784a63c55d764045797617e25f8a04695",
  "css/z-index-standards.css": "d092ad3f5ab49716eaa36eaae08ff4eb72d0d370",
});

const legacyRoot = fileURLToPath(
  new URL("../../public/legacy/", import.meta.url),
);

function gitBlobSha(content: Buffer): string {
  const header = Buffer.from(`blob ${content.byteLength}\0`, "utf8");
  return createHash("sha1").update(header).update(content).digest("hex");
}

describe("V1 legacy style snapshot", () => {
  it("is pinned to the audited V1 source commit", () => {
    expect(V1_SOURCE_COMMIT).toBe("60746fd7fed97b805758b37adfdbe3bad2582bfe");
  });

  for (const [relativePath, expectedSha] of Object.entries(V1_STYLE_BLOBS)) {
    it(`preserves ${relativePath} byte for byte`, async () => {
      const content = await readFile(`${legacyRoot}${relativePath}`);
      expect(gitBlobSha(content)).toBe(expectedSha);
    });
  }
});
