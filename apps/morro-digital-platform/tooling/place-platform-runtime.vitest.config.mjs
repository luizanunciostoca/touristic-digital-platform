import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tooling/place-platform-runtime.vitest.mjs",
      "tooling/media-storage-runtime.vitest.mjs",
    ],
  },
});
