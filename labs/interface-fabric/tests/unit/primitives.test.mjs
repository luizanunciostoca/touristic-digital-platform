import assert from "node:assert/strict";
import test from "node:test";
import { ui } from "../../src/primitives.js";
test("reusable primitives cover semantic controls", () => {
  for (const name of [
    "button",
    "input",
    "select",
    "textarea",
    "checkbox",
    "radio",
    "switchControl",
    "badge",
    "chip",
    "alert",
    "card",
    "tabs",
    "accordion",
    "tooltip",
    "pagination",
    "loader",
    "skeleton",
    "transactionState",
  ])
    assert.equal(typeof ui[name], "function", name);
});
test("primitive labels are escaped", () =>
  assert.ok(!ui.button("<script>").includes("<script>")));
