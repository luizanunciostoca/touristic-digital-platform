# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1                         | Evidência V1               | Destino V2              | Estado M2 | Critério de PASS                                                     |
| ----------------------------------- | -------------------------- | ----------------------- | --------- | -------------------------------------------------------------------- |
| 10 opções canônicas                 | `assistant-messages.js`    | `src/menu.ts`           | PASS      | ordem, valores e labels PT/EN/ES/HE idênticos                        |
| Normalização de texto               | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | acentos latinos normalizados e HE preservado                         |
| NLP local-first                     | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | padrões diretos restantes e política `requiresLLM` completa           |
| Threshold LLM 0.5                   | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | constante preservada; dispatcher `requiresLLM` ainda pendente         |
| Threshold de entrada longa 90       | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | constante preservada; heurística de complexidade ainda pendente       |
| Modificadores compostos             | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | vocabulário V1 de modifiers coberto e testado                         |
| `navigate`                          | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | padrões V1 portados; resolução/handler de destino ainda pendente      |
| `cancel_navigation`                 | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | comandos V1 equivalentes                                             |
| `open_now`                          | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | PT/EN/ES/HE cobertos                                                 |
| weather/location/photos/price/hours | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | classificação pronta; handlers de domínio ainda pendentes             |
| nearby/favorites/help               | `intent-engine.js`         | `src/intent-engine.ts`  | PARTIAL   | classificação pronta; handlers de domínio ainda pendentes             |
| confirm/deny/greeting/thanks        | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | classificação local equivalente                                      |
| Extração de entidades               | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | place, area, meal, price, distance, time, group size, category e lang |
| Match por sinônimos                 | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | categorias e intents expandidos PT/EN/ES/HE equivalentes              |
| Match contextual / `awaiting`       | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | prioridade contextual, filtros, detalhe e seleção numérica cobertos   |
| Detecção de place name              | `intent-engine.js`         | `src/intent-engine.ts`  | PASS      | `place_search` e confiança V1 cobertos                                |
| Controller de diálogo               | `assistant-dialog.js`      | a implementar           | GAP       | fluxo de menus, handlers e respostas equivalentes                    |
| Contexto conversacional             | `assistant-context/**`     | a implementar           | GAP       | estado e refinamentos equivalentes                                   |
| Mensagens e sanitização             | `assistant-messages/**`    | a implementar           | GAP       | render seguro, deduplicação e tipos de mensagem                      |
| Sugestões proativas                 | `proactive-suggestions.js` | a implementar           | GAP       | gatilhos V1 equivalentes                                             |
| Fallback LLM                        | `llm-fallback.js`          | a implementar           | GAP       | fallback somente quando necessário, com resposta equivalente         |
| Boundary `/api/ai/*`                | legado + registry          | API same-origin V2      | GAP       | nenhum segredo no cliente; provider server-side                      |
| Voz                                 | `voice/**`                 | a implementar           | GAP       | síntese, preferência e idiomas PT/EN/ES/HE                           |
| Integração Navigation               | diálogo/mensagens V1       | `@touristic/navigation` | GAP       | rota iniciada/cancelada via contrato público V2                      |
| UI shell do assistente              | shell V1                   | app V2                  | PARTIAL   | abertura, fechamento, menu, mensagens e estados visuais equivalentes |

## Estado do milestone M2

O M2 completa a segunda camada determinística do motor V1: extração de entidades, modifiers, expansão por sinônimos, prioridade de `awaiting`, refinamentos por contexto e heurística de `place_search`. O pipeline continua local-first e mantém o LLM apenas como boundary sinalizado, mas a política completa `requiresLLM`, o controller de diálogo e os handlers de domínio permanecem fora deste milestone.

A FEATURE-0004 / MIG-0006 **não** está equivalente neste checkpoint.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.
