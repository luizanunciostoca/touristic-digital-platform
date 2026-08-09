# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1                           | Evidência V1               | Destino V2                                       | Estado M9 | Critério de PASS                                                          |
| ------------------------------------- | -------------------------- | ------------------------------------------------ | --------- | ------------------------------------------------------------------------- |
| 10 opções canônicas                   | `assistant-messages.js`    | `src/menu.ts`                                    | PASS      | ordem, valores e labels PT/EN/ES/HE idênticos                             |
| Normalização de texto                 | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | acentos latinos normalizados e HE preservado                              |
| NLP local-first                       | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | padrões, complex intents, sinônimos, contexto, entidades e place search   |
| Intents complexas / always-LLM        | `intent-engine.js`         | `src/complex-intents.ts`                         | PASS      | cultural_history, practical_tips, transport e accessibility + ordem V1    |
| Threshold LLM 0.5                     | `intent-engine.js`         | `src/llm-policy.ts`                              | PASS      | constante e decisão por confiança preservadas                             |
| Threshold de entrada longa 90         | `intent-engine.js`         | `src/llm-policy.ts`                              | PASS      | fallback apenas acima de 90 caracteres, como na V1                        |
| Política `requiresLLM`                | `intent-engine.js`         | `src/llm-policy.ts`                              | PASS      | intents obrigatórias, confiança, flag, dimensões e padrões complexos      |
| Modificadores compostos               | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | vocabulário V1 de modifiers coberto e testado                             |
| `navigate`                            | `intent-engine.js`         | `src/intent-engine.ts`                           | PARTIAL   | classificação pronta; resolução/handler de destino ainda pendente         |
| `cancel_navigation`                   | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | comandos V1 equivalentes                                                  |
| `open_now`                            | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | PT/EN/ES/HE cobertos                                                      |
| weather/location/photos/price/hours   | `intent-engine.js`         | `src/intent-engine.ts`                           | PARTIAL   | classificação pronta; handlers de domínio ainda pendentes                 |
| nearby/favorites/help                 | `intent-engine.js`         | `src/intent-engine.ts`                           | PARTIAL   | classificação pronta; handlers de domínio ainda pendentes                 |
| confirm/deny/greeting/thanks          | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | classificação local equivalente                                           |
| Extração de entidades                 | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | place, area, meal, price, distance, time, group size, category e lang     |
| Match por sinônimos                   | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | categorias e intents expandidos PT/EN/ES/HE equivalentes                  |
| Match contextual / `awaiting`         | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | prioridade contextual, filtros, detalhe e seleção numérica cobertos       |
| Detecção de place name                | `intent-engine.js`         | `src/intent-engine.ts`                           | PASS      | `place_search` e confiança V1 cobertos                                    |
| Controller de diálogo — orchestration | `assistant-dialog.js`      | `src/dialog-controller.ts`                       | PASS      | input → contexto → intent → handler local → LLM → contexto/histórico      |
| Handlers de domínio do diálogo        | `assistant-dialog.js`      | portas do `src/dialog-controller.ts`             | GAP       | menus, busca, clima, detalhes, favoritos, mapa e respostas observáveis    |
| Context manager                       | `context-manager.js`       | `src/context-manager.ts`                         | PASS      | schema v2, TTL 4h, debounce, histórico, preferências e pub/sub            |
| Perfil do usuário                     | `user-profile.js`          | `src/user-profile.ts`                            | PASS      | persistência, inferências, interesses, favoritos e sugestões equivalentes |
| Contexto conversacional               | `assistant-context/**`     | `src/context-manager.ts` + `src/user-profile.ts` | PASS      | context manager e user profile portados com contratos testáveis           |
| Mensagens — lifecycle                 | `assistant-messages.js`    | `src/message-pipeline.ts`                        | PASS      | áreas, prioridade, dedupe 2s, clear e supressão durante Navigation        |
| Mensagens — sanitização               | `assistant-messages.js`    | porta `sanitize` do message pipeline             | PASS      | toda entrada passa obrigatoriamente por sanitização antes do estado       |
| Mensagens — DOM/UI                    | `assistant-messages.js`    | app V2                                           | PARTIAL   | render visual, containers, scroll e classes ainda dependem do wiring UI   |
| Sugestões proativas — decisão         | `proactive-suggestions.js` | `src/proactive-suggestions.ts`                   | PASS      | cooldown, thresholds, prioridades e ordem V1 preservados                  |
| Sugestões proativas — conteúdo/menu   | `proactive-suggestions.js` | a implementar                                    | GAP       | cópias PT/EN/ES/HE, contextual menu e smart recommendations               |
| Fallback LLM — decisão                | `intent-engine.js`         | `src/llm-policy.ts`                              | PASS      | decidir local vs LLM conforme política V1                                 |
| Fallback LLM — execução               | `llm-fallback.js`          | porta `llm` do controller                        | PARTIAL   | orquestração pronta; provider same-origin real ainda pendente             |
| Boundary `/api/ai/*`                  | legado + registry          | API same-origin V2                               | GAP       | nenhum segredo no cliente; provider server-side                           |
| Voz                                   | `voice/**`                 | a implementar                                    | GAP       | síntese, preferência e idiomas PT/EN/ES/HE                                |
| Integração Navigation                 | diálogo/mensagens V1       | `@touristic/navigation`                          | GAP       | rota iniciada/cancelada via contrato público V2                           |
| UI shell do assistente                | shell V1                   | app V2                                           | PARTIAL   | abertura, fechamento, menu, mensagens e estados visuais equivalentes      |

## Estado do milestone M9

O M9 extrai o motor de decisão de `proactive-suggestions.js` sem transportar conteúdo localizado nem dependências de browser para o package. Foram preservados como contratos executáveis o cooldown de 5 minutos, o limiar mínimo de prioridade `0.6`, a janela crítica de pôr do sol `16–17h` com prioridade `0.95`, chuva acima de `60%`, calor acima de `32°C`, primeira visita com até 3 interações, perfis de retorno/aventura/romântico/família e a sugestão pós-praia em horário de almoço quando a consulta ocorreu há menos de 60 minutos.

A ordem de composição também permanece equivalente: hora → clima → perfil → histórico, seguida por ordenação de prioridade. Isso garante que, por exemplo, chuva de prioridade `0.85` supere uma recomendação romântica de `0.65` e que a condição de usuário retornando (`visitCount === 2`) preserve a precedência da V1 sobre `first_timer`.

Este milestone não porta ainda as cópias PT/EN/ES/HE, `getContextualMenu` nem `getSmartRecommendation`; portanto o domínio de sugestões proativas como um todo permanece incompleto apesar do motor de decisão estar em PASS.

A FEATURE-0004 / MIG-0006 **não** está equivalente neste checkpoint.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.
