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
      {
        find: "@touristic/auth-server",
        replacement: new URL("../auth/src/index.ts", import.meta.url).pathname,
      },
      {
        find: "@touristic/crm-server",
        replacement: new URL("./src/index.ts", import.meta.url).pathname,
      },
      {
        find: /^@touristic\/crm\/(.+)$/u,
        replacement: new URL("../../packages/crm/src/$1.ts", import.meta.url)
          .pathname,
      },
      {
        find: "@touristic/crm",
        replacement: new URL("../../packages/crm/src/index.ts", import.meta.url)
          .pathname,
      },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
