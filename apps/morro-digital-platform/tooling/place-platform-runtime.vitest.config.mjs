import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [\n      "tooling/place-platform-runtime.vitest.mjs",\n      "tooling/media-storage-runtime.vitest.mjs",\n    ],
  },
});
