import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const base = process.argv[2];
if (!base) throw new Error("base SHA required");
const ownership = JSON.parse(await readFile(".morro/ownership.json", "utf8"));
const graph = JSON.parse(await readFile(".morro/contract-graph.json", "utf8"));

const raw = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
  encoding: "utf8",
}).trim();
const files = raw ? raw.split("\n") : [];

const domains = new Set();
for (const domain of ownership.domains) {
  for (const file of files) {
    if (domain.pathPrefixes?.some((prefix) => file.startsWith(prefix)))
      domains.add(domain.id);
  }
}

const contracts = new Set();
for (const [name, contract] of Object.entries(graph.contracts)) {
  if (contract.owners.some((owner) => domains.has(owner))) contracts.add(name);
}

const impactedDomains = new Set(domains);
for (const name of contracts) {
  for (const consumer of graph.contracts[name].consumers)
    impactedDomains.add(consumer);
}

console.log(
  JSON.stringify(
    {
      files,
      ownedDomains: [...domains].sort(),
      touchedContracts: [...contracts].sort(),
      impactedDomains: [...impactedDomains].sort(),
    },
    null,
    2,
  ),
);
