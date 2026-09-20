import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

const repositoryRoot = resolve(process.cwd(), "../..");
const path = "apps/morro-digital-platform/src/runtime/commerce-preview-sheet.ts";
const source = await readFile(resolve(repositoryRoot, path), "utf8");
const formatted = await format(source, { filepath: path });

process.stdout.write(
  "PRETTIER_SHEET_BEGIN:" +
    path +
    ":" +
    Buffer.from(formatted).toString("base64") +
    ":PRETTIER_SHEET_END\n",
);
