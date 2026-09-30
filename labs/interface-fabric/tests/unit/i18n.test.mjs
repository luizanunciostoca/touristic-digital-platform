import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from "../../src/i18n.js";
test("supports current product locales", () =>
  assert.deepEqual(SUPPORTED_LOCALES, ["pt-BR", "en", "es", "he"]));
test("locale precedence is manual -> browser -> destination -> safe", () => {
  assert.equal(
    resolveLocale({
      manualOverride: "es-ES",
      browserLocale: "en-US",
      destinationFallback: "pt-BR",
    }),
    "es",
  );
  assert.equal(
    resolveLocale({ browserLocale: "en-US", destinationFallback: "pt-BR" }),
    "en",
  );
  assert.equal(
    resolveLocale({ browserLocale: "xx", destinationFallback: "pt-BR" }),
    "pt-BR",
  );
  assert.equal(
    resolveLocale({
      browserLocale: "xx",
      destinationFallback: "yy",
      safeFallback: "he",
    }),
    "he",
  );
});
test("legacy Hebrew locale code iw normalizes to he", () =>
  assert.equal(normalizeLocale("iw-IL"), "he"));
