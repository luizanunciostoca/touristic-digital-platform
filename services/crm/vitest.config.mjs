import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@touristic/auth",
        replacement: new URL(
          "../../packages/auth/src/index.ts",
          import.meta.url,
        ).pathname,
      },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
