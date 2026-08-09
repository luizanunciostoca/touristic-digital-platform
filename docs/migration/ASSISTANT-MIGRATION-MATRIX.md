# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1                           | Evidência V1               | Destino V2                                                              | Estado M12 | Critério de PASS                                                              |
| ------------------------------------- | -------------------------- | ----------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| 10 opções canônicas                   | `assistant-messages.js`    | `src/menu.ts`                                                           | PASS       | ordem, valores e labels PT/EN/ES/HE idênticos                                 |
| Normalização de texto                 | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | acentos latinos normalizados e HE preservado                                  |
| NLP local-first                       | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | padrões, complex intents, sinônimos, contexto, entidades e place search       |
| Intents complexas / always-LLM        | `intent-engine.js`         | `src/complex-intents.ts`                                                | PASS       | cultural_history, practical_tips, transport e accessibility + ordem V1        |
| Threshold LLM 0.5                     | `intent-engine.js`         | `src/llm-policy.ts`                                                     | PASS       | constante e decisão por confiança preservadas                                 |
| Threshold de entrada longa 90         | `intent-engine.js`         | `src/llm-policy.ts`                                                     | PASS       | fallback apenas acima de 90 caracteres, como na V1                            |
| Política `requiresLLM`                | `intent-engine.js`         | `src/llm-policy.ts`                                                     | PASS       | intents obrigatórias, confiança, flag, dimensões e padrões complexos          |
| Modificadores compostos               | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | vocabulário V1 de modifiers coberto e testado                                 |
| `navigate`                            | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                   | PASS       | classificação, resolução por porta, fallback contextual e início da rota      |
| `cancel_navigation`                   | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                   | PASS       | classificação e cancelamento via porta pública                                |
| `open_now`                            | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | PT/EN/ES/HE cobertos                                                          |
| weather/location/photos/price/hours   | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PARTIAL    | classificação pronta; handlers de domínio ainda pendentes                     |
| nearby/favorites/help                 | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PARTIAL    | classificação pronta; handlers de domínio ainda pendentes                     |
| confirm/deny/greeting/thanks          | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | classificação local equivalente                                               |
| Extração de entidades                 | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | place, area, meal, price, distance, time, group size, category e lang         |
| Match por sinônimos                   | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | categorias e intents expandidos PT/EN/ES/HE equivalentes                      |
| Match contextual / `awaiting`         | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | prioridade contextual, filtros, detalhe e seleção numérica cobertos           |
| Detecção de place name                | `intent-engine.js`         | `src/intent-engine.ts`                                                  | PASS       | `place_search` e confiança V1 cobertos                                        |
| Controller de diálogo — orchestration | `assistant-dialog.js`      | `src/dialog-controller.ts`                                              | PASS       | input → contexto → intent → handler local → LLM → contexto/histórico          |
| Handlers de domínio do diálogo        | `assistant-dialog.js`      | portas do `src/dialog-controller.ts`                                    | PARTIAL    | Navigation coberta; menus, busca, clima, detalhes, favoritos e mapa pendentes |
| Context manager                       | `context-manager.js`       | `src/context-manager.ts`                                                | PASS       | schema v2, TTL 4h, debounce, histórico, preferências e pub/sub                |
| Perfil do usuário                     | `user-profile.js`          | `src/user-profile.ts`                                                   | PASS       | persistência, inferências, interesses, favoritos e sugestões equivalentes     |
| Contexto conversacional               | `assistant-context/**`     | `src/context-manager.ts` + `src/user-profile.ts`                        | PASS       | context manager e user profile portados com contratos testáveis               |
| Mensagens — lifecycle                 | `assistant-messages.js`    | `src/message-pipeline.ts`                                               | PASS       | áreas, prioridade, dedupe 2s, clear e supressão durante Navigation            |
| Mensagens — sanitização               | `assistant-messages.js`    | porta `sanitize` do message pipeline                                    | PASS       | toda entrada passa obrigatoriamente por sanitização antes do estado           |
| Mensagens — DOM/UI                    | `assistant-messages.js`    | app V2                                                                  | PARTIAL    | render visual, containers, scroll e classes ainda dependem do wiring UI       |
| Sugestões proativas — decisão         | `proactive-suggestions.js` | `src/proactive-suggestions.ts`                                          | PASS       | cooldown, thresholds, prioridades e ordem V1 preservados                      |
| Sugestões proativas — conteúdo/menu   | `proactive-suggestions.js` | `src/proactive-copy.ts` + `src/proactive-content.ts`                    | PASS       | copy PT/EN/ES/HE, contextual menu e smart recommendations equivalentes        |
| Fallback LLM — decisão                | `intent-engine.js`         | `src/llm-policy.ts`                                                     | PASS       | decidir local vs LLM conforme política V1                                     |
| Fallback LLM — execução               | `llm-fallback.js`          | porta `llm` do controller                                               | PARTIAL    | orquestração pronta; provider same-origin real ainda pendente                 |
| Boundary `/api/ai/*`                  | legado + registry          | API same-origin V2                                                      | GAP        | nenhum segredo no cliente; provider server-side                               |
| Voz                                   | `voice/**`                 | a implementar                                                           | GAP        | síntese, preferência e idiomas PT/EN/ES/HE                                    |
| Integração Navigation                 | diálogo/mensagens V1       | `src/navigation-handlers.ts` → adapter do app → `@touristic/navigation` | PARTIAL    | handler público pronto; adapter do app e resolver real de destinos pendentes  |
| UI shell do assistente                | shell V1                   | app V2                                                                  | PARTIAL    | abertura, fechamento, menu, mensagens e estados visuais equivalentes          |

## Estado do milestone M12

O M12 extrai a resolução e o lifecycle de Navigation do monólito V1 para `src/navigation-handlers.ts`. O handler `navigate` usa primeiro `intent.entities.place`, cai para `context.lastPlace` quando a conversa já estabeleceu um destino e, na ausência de ambos, retorna estado observável de `awaiting_destination`. O destino é resolvido por uma porta explícita e somente uma resolução válida pode iniciar a rota.

O mesmo contrato cobre destino inexistente sem efeito colateral e `cancel_navigation` por uma porta pública independente de DOM ou Mapbox. Testes verificam destino explícito, fallback contextual, destino ausente, falha de resolução, início e cancelamento. Com isso, o contrato lógico de `navigate` deixa de ser `PARTIAL` e passa a `PASS`, enquanto os handlers de domínio como conjunto avançam de `GAP` para `PARTIAL`.

A integração com o runtime real ainda permanece `PARTIAL`: o próximo passo é conectar essas portas ao resolver de locais do app e ao `NavigationSessionBootstrap`, que já consome `@touristic/navigation`. Essa separação evita importar browser/Mapbox para dentro de `packages/assistant`.

A FEATURE-0004 / MIG-0006 **não** está equivalente neste checkpoint. Permanecem gaps em handlers de domínio, provider LLM same-origin, voz, wiring do Navigation no app e UI final.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.
