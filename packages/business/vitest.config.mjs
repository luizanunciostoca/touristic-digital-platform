import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@touristic/auth",
        replacement: new URL("../auth/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
});
