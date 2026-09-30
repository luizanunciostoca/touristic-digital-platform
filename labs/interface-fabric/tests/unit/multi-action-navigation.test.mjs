import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const app = await readFile(
  new URL("../../src/app.js", import.meta.url),
  "utf8",
);
test("all route and commerce actions receive navigation handlers", () => {
  assert.match(app, /querySelectorAll\('\[data-action="nav-route"\]'\)/);
  assert.match(app, /querySelectorAll\('\[data-action="nav-commerce"\]'\)/);
});
