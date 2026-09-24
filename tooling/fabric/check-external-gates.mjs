import { readFile } from "node:fs/promises";

const gates = JSON.parse(await readFile(".morro/external-gates.json", "utf8"));
const allowed = new Set(gates.allowedStates);
for (const gate of gates.gates) {
  if (!allowed.has(gate.state))
    throw new Error(`invalid external gate state: ${gate.id}`);
  if (gate.state === "VERIFIED" && !gate.evidence) {
    throw new Error(`VERIFIED external gate requires evidence: ${gate.id}`);
  }
}
console.log(`External gates valid: ${gates.gates.length}`);
