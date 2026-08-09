import { readFile, writeFile } from "node:fs/promises";

const serverPath = "apps/morro-digital-platform/tooling/dev-server.mjs";
let server = await readFile(serverPath, "utf8");

const assistantImport = 'import { createAssistantApi } from "./assistant-api.mjs";\n';
if (!server.includes(assistantImport)) {
  const marker = 'import { fileURLToPath } from "node:url";\n';
  if (!server.includes(marker)) throw new Error("server import anchor not found");
  server = server.replace(marker, marker + assistantImport);
}

if (!server.includes("const assistantApi = createAssistantApi")) {
  const marker = "const localEnvironment = await loadLocalEnvironment();\n";
  if (!server.includes(marker)) throw new Error("server env anchor not found");
  server = server.replace(
    marker,
    `${marker}\nconst assistantApi = createAssistantApi({\n  getEnvironmentValue: (key) =>\n    process.env[key] ?? localEnvironment[key] ?? "",\n});\n`,
  );
}

if (!server.includes("assistantApi.matches(requestUrl.pathname)")) {
  const marker = `    if (requestUrl.pathname === "/api/weather") {\n      await serveWeather(response);\n      return;\n    }\n`;
  if (!server.includes(marker)) throw new Error("server weather route anchor not found");
  server = server.replace(
    marker,
    `${marker}    if (assistantApi.matches(requestUrl.pathname)) {\n      await assistantApi.handle(request, response);\n      return;\n    }\n`,
  );
}
await writeFile(serverPath, server);

const matrixPath = "docs/migration/ASSISTANT-MIGRATION-MATRIX.md";
let matrix = await readFile(matrixPath, "utf8");
matrix = matrix.replace("Estado M26", "Estado M27");
const lines = matrix.split("\n");
let foundLlm = false;
let foundBoundary = false;
for (let index = 0; index < lines.length; index += 1) {
  if (lines[index].startsWith("| Fallback LLM — execução")) {
    lines[index] = "| Fallback LLM — execução               | `llm-fallback.js`          | porta `llm` do controller + `assistant-llm-adapter.ts`                                                          | PASS       | client same-origin, timeout/fail-closed, resposta normalizada e provider server-side conectados                                           |";
    foundLlm = true;
  }
  if (lines[index].startsWith("| Boundary `/api/ai/*`")) {
    lines[index] = "| Boundary `/api/ai/*`                  | legado + registry          | `/api/ai/assistant/respond` + alias legado `/api/assistant/respond`                                             | PASS       | nenhum segredo no cliente; provider server-side, validação, rate limit e timeout                                                         |";
    foundBoundary = true;
  }
}
if (!foundLlm || !foundBoundary) throw new Error("MIG-0006 target rows not found");
matrix = lines.join("\n");
if (!matrix.includes("## Estado do milestone M27")) {
  matrix += `\n\n## Estado do milestone M27\n\nO M27 fecha a execução do fallback LLM e o boundary server-side do Assistente. \`assistant-llm-adapter.ts\` conecta a porta \`llm\` do controller ao endpoint same-origin \`/api/ai/assistant/respond\`, preservando timeout de 12 segundos, histórico limitado, contexto sanitizado, normalização de action/options/confidence e falha fechada para que indisponibilidade do provider nunca quebre o diálogo local-first.\n\n\`assistant-api.mjs\` hospeda a fronteira server-side: valida método e payload, limita 30 chamadas por minuto por origem, mantém \`OPENAI_API_KEY\` e \`OPENAI_MODEL\` exclusivamente no processo do servidor, normaliza a resposta do provider e expõe também \`/api/assistant/respond\` como alias de compatibilidade com a baseline V1. Nenhum segredo é serializado em \`runtime-config.js\` ou entregue ao browser.\n\nCom isso, \`Fallback LLM — execução\` e \`Boundary /api/ai/*\` passam a \`PASS\`. A FEATURE-0004 / MIG-0006 **ainda não está equivalente**: permanecem delivery físico dos assets de \`photos\`, paridade completa de weather e copy/i18n dos handlers, voz e lifecycle/UI completa do assistente.\n`;
}
await writeFile(matrixPath, matrix);
