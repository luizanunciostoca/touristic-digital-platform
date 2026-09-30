import { readFile } from "node:fs/promises";
import { MockReasoningProvider } from "../dist/index.js";

const dataset = JSON.parse(
  await readFile(new URL("../evals/critical-dataset.json", import.meta.url), "utf8"),
);
const provider = new MockReasoningProvider();
const results = [];
for (const item of dataset) {
  const result = await provider.understand({ text: item.input, locale: item.locale }, {});
  const actual = result.ok ? result.value.intent : "ERROR:" + result.error.code;
  results.push({
    id: item.id,
    category: item.category,
    expected: item.expectedIntent,
    actual,
    pass: actual === item.expectedIntent,
  });
}
const passed = results.filter((item) => item.pass).length;
const summary = {
  total: results.length,
  passed,
  failed: results.length - passed,
  passRate: results.length === 0 ? 1 : passed / results.length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exit(1);
