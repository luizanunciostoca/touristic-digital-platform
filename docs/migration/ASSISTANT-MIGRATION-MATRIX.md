# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1 | Evidência V1 | Destino V2 | Estado M1 | Critério de PASS |
| --- | --- | --- | --- | --- |
| 10 opções canônicas | `assistant-messages.js` | `src/menu.ts` | PASS | ordem, valores e labels PT/EN/ES/HE idênticos |
| Normalização de texto | `intent-engine.js` | `src/intent-engine.ts` | PASS | acentos latinos normalizados e HE preservado |
| NLP local-first | `intent-engine.js` | `src/intent-engine.ts` | PARTIAL | padrões, sinônimos, contexto, entidades e place search equivalentes |
| Threshold LLM 0.5 | `intent-engine.js` | `src/intent-engine.ts` | PASS | constante e decisão de fallback preservadas |
| Threshold de entrada longa 90 | `intent-engine.js` | `src/intent-engine.ts` | PASS | constante preservada; heurística completa ainda depende do item NLP |
| Modificadores compostos | `intent-engine.js` | `src/intent-engine.ts` | PARTIAL | todos os modificadores V1 e contexto combinável cobertos |
| `navigate` | `intent-engine.js` | `src/intent-engine.ts` | PARTIAL | todos os padrões e entidades de destino V1 cobertos |
| `cancel_navigation` | `intent-engine.js` | `src/intent-engine.ts` | PASS | comandos V1 equivalentes |
| `open_now` | `intent-engine.js` | `src/intent-engine.ts` | PASS | PT/EN/ES/HE cobertos |
| weather/location/photos/price/hours | `intent-engine.js` | `src/intent-engine.ts` | PARTIAL | padrões e respostas contextuais completas |
| nearby/favorites/help | `intent-engine.js` | `src/intent-engine.ts` | PARTIAL | padrões + handlers de domínio completos |
| confirm/deny/greeting/thanks | `intent-engine.js` | `src/intent-engine.ts` | PASS | classificação local equivalente |
| Extração de entidades | `intent-engine.js` | a implementar | GAP | place, area, meal, price, distance, time, group size e category |
| Match por sinônimos | `intent-engine.js` | a implementar | GAP | categorias PT/EN/ES/HE equivalentes |
| Match contextual / `awaiting` | `intent-engine.js` | a implementar | GAP | prioridade contextual V1 preservada |
| Detecção de place name | `intent-engine.js` | a implementar | GAP | `place_search` com confiança equivalente |
| Controller de diálogo | `assistant-dialog.js` | a implementar | GAP | fluxo de menus, handlers e respostas equivalentes |
| Contexto conversacional | `assistant-context/**` | a implementar | GAP | estado e refinamentos equivalentes |
| Mensagens e sanitização | `assistant-messages/**` | a implementar | GAP | render seguro, deduplicação e tipos de mensagem |
| Sugestões proativas | `proactive-suggestions.js` | a implementar | GAP | gatilhos V1 equivalentes |
| Fallback LLM | `llm-fallback.js` | a implementar | GAP | fallback somente quando necessário, com resposta equivalente |
| Boundary `/api/ai/*` | legado + registry | API same-origin V2 | GAP | nenhum segredo no cliente; provider server-side |
| Voz | `voice/**` | a implementar | GAP | síntese, preferência e idiomas PT/EN/ES/HE |
| Integração Navigation | diálogo/mensagens V1 | `@touristic/navigation` | GAP | rota iniciada/cancelada via contrato público V2 |
| UI shell do assistente | shell V1 | app V2 | PARTIAL | abertura, fechamento, menu, mensagens e estados visuais equivalentes |

## Estado do milestone M1

O M1 inicia o package real `@touristic/assistant` e porta o núcleo determinístico de menu + classificação local de intents de alto valor. Ele **não** declara a FEATURE-0004 equivalente.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.
