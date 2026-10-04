import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "node:test";
import { fileURLToPath } from "node:url";

export async function certifyFiles(files) {
  if (!files.length) throw new Error("LEARNING_TEST_FILES_REQUIRED");
  const provenFiles = new Set();
  let summary;
  for await (const event of run({ files })) {
    if (event.type === "test:fail") console.error(event.data.name);
    if (event.type === "test:summary") {
      summary = event.data;
      if (summary.file && summary.counts.tests > 0)
        provenFiles.add(resolve(summary.file));
    }
  }
  const counts = summary?.counts;
  if (
    !summary?.success ||
    !counts?.tests ||
    files.some((file) => !provenFiles.has(resolve(file))) ||
    counts.passed !== counts.tests ||
    ["failed", "cancelled", "skipped", "todo"].some((key) => counts[key] !== 0)
  )
    throw new Error("LEARNING_PROOF_INCOMPLETE:" + JSON.stringify(counts));
  return counts;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => resolve(directory, name));
  certifyFiles(files).then(
    (counts) =>
      console.log(
        JSON.stringify({ contract: "FAILURE_LEARNING_SUITE", counts }),
      ),
    (error) => {
      console.error(error.message);
      process.exitCode = 1;
    },
  );
}
