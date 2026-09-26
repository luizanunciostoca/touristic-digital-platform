import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const devServerUrl = new URL("./dev-server.mjs", import.meta.url);

describe("affiliate commercial portal runtime wiring", () => {
  it("composes the Affiliates API into startup, readiness and request routing", async () => {
    const source = await readFile(devServerUrl, "utf8");

    expect(source).toContain(
      'import { createAffiliatesApi } from "./affiliates-api.mjs";',
    );
    expect(source).toContain(
      "const affiliatesApi = createAffiliatesApi({ authApi, getEnvironmentValue });",
    );
    expect(source).toContain(
      "affiliatesRuntimeReady = await affiliatesApi.start();",
    );
    expect(source).toContain('name: "affiliates-commercial-runtime"');
    expect(source).toContain("if (affiliatesApi.matches(requestUrl.pathname))");
    expect(source).toContain(
      "await affiliatesApi.handle(request, response, requestUrl);",
    );
  });
});
