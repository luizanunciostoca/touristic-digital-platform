import { readFile, writeFile } from "node:fs/promises";

const matrixPath = "docs/migration/ASSISTANT-MIGRATION-MATRIX.md";
let matrix = await readFile(matrixPath, "utf8");
matrix = matrix.replace("| Estado M27 |", "| Estado M28 |");
matrix = matrix.replace(
  /\| Voz\s+\| `voice\/\*\*`\s+\| a implementar\s+\| GAP\s+\| síntese, preferência e idiomas PT\/EN\/ES\/HE\s+\|/u,
  "| Voz                                   | `voice/**`                 | `src/voice-synthesis.ts` + `assistant-voice-adapter.ts`                                                   | PARTIAL    | síntese e preferências PT/EN/ES/HE conectadas; seletor visual e entrada por voz ainda pendentes                                             |",
);
if (!matrix.includes("## Estado do milestone M28")) {
  matrix += `\n\n## Estado do milestone M28\n\nO M28 porta a base de síntese de voz observável da V1 para contratos testáveis em \`@touristic/assistant\` e conecta o runtime do browser à Web Speech API sem acoplar o domínio ao DOM. O contrato preserva as chaves de compatibilidade \`voiceAssistant\`, \`voice-enabled\`, \`voice-speed\`, \`assistant-voice\` e \`voice-language\`, normaliza os quatro idiomas PT/EN/ES/HE para \`pt-BR\`, \`en-US\`, \`es-ES\` e \`he-IL\`, seleciona a voz salva ou a melhor voz por locale e limpa HTML/emojis antes da síntese.\n\nO adapter de browser aplica volume, velocidade, pitch e preferência de voz, cancela fala anterior antes de sintetizar uma nova resposta e reage ao carregamento tardio de vozes via \`voiceschanged\`. Quando a Web Speech API não está disponível, o Assistente continua funcional sem falhar. As respostas do diálogo passam a ser sintetizadas automaticamente quando a preferência de voz está habilitada.\n\nA linha de voz permanece \`PARTIAL\`: a síntese, persistência e idiomas estão conectados, mas a equivalência integral da UI de seleção de voz e da entrada por voz/microfone da V1 ainda precisa ser portada e validada antes de promover para \`PASS\`. A FEATURE-0004 / MIG-0006 permanece não equivalente.\n`;
}
await writeFile(matrixPath, matrix);
