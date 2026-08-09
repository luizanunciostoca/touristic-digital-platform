# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1                           | Evidência V1               | Destino V2                                                                                                      | Estado M24 | Critério de PASS                                                                                                    |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| 10 opções canônicas                   | `assistant-messages.js`    | `src/menu.ts`                                                                                                   | PASS       | ordem, valores e labels PT/EN/ES/HE idênticos                                                                       |
| Normalização de texto                 | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | acentos latinos normalizados e HE preservado                                                                        |
| NLP local-first                       | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | padrões, complex intents, sinônimos, contexto, entidades e place search                                             |
| Intents complexas / always-LLM        | `intent-engine.js`         | `src/complex-intents.ts`                                                                                        | PASS       | cultural_history, practical_tips, transport e accessibility + ordem V1                                              |
| Threshold LLM 0.5                     | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | constante e decisão por confiança preservadas                                                                       |
| Threshold de entrada longa 90         | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | fallback apenas acima de 90 caracteres, como na V1                                                                  |
| Política `requiresLLM`                | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | intents obrigatórias, confiança, flag, dimensões e padrões complexos                                                |
| Modificadores compostos               | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | vocabulário V1 de modifiers coberto e testado                                                                       |
| `navigate`                            | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                                                           | PASS       | classificação, resolução por porta, fallback contextual e início da rota                                            |
| `cancel_navigation`                   | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                                                           | PASS       | classificação e cancelamento via porta pública                                                                      |
| `open_now`                            | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | PT/EN/ES/HE cobertos                                                                                                |
| weather/location/photos/price/hours   | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PARTIAL    | weather, geolocalização e hours conectados; photos/price e paridade completa de weather ainda pendentes             |
| nearby/favorites/help                 | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PARTIAL    | adapters browser conectados; nearby usa catálogo V1 + geolocalização; i18n/paridade observável ainda parcial        |
| confirm/deny/greeting/thanks          | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | classificação local equivalente                                                                                     |
| Extração de entidades                 | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | place, area, meal, price, distance, time, group size, category e lang                                               |
| Match por sinônimos                   | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | categorias e intents expandidos PT/EN/ES/HE equivalentes                                                            |
| Match contextual / `awaiting`         | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | prioridade contextual, filtros, detalhe e seleção numérica cobertos                                                 |
| Detecção de place name                | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | `place_search` e confiança V1 cobertos                                                                              |
| Resolução de place name               | `assistant-dialog.js`      | `assistant-v1-place-resolver.ts` + `assistant-v1-destination-catalog.ts`                                        | PASS       | catálogo integral, ordem, aliases, coordenadas, boundary 12 km, precedência e fuzzy 0.55 equivalentes               |
| Controller de diálogo — orchestration | `assistant-dialog.js`      | `src/dialog-controller.ts`                                                                                      | PASS       | input → contexto → intent → handler local → LLM → contexto/histórico                                                |
| Handlers de domínio do diálogo        | `assistant-dialog.js`      | `src/domain-handlers.ts` + portas do `src/dialog-controller.ts`                                                 | PARTIAL    | weather/location/nearby/favorites/help/hours/more_info conectados; photos/price e paridades restantes ainda faltam |
| Context manager                       | `context-manager.js`       | `src/context-manager.ts`                                                                                        | PASS       | schema v2, TTL 4h, debounce, histórico, preferências e pub/sub                                                      |
| Perfil do usuário                     | `user-profile.js`          | `src/user-profile.ts`                                                                                           | PASS       | persistência, inferências, interesses, favoritos e sugestões equivalentes                                           |
| Contexto conversacional               | `assistant-context/**`     | `src/context-manager.ts` + `src/user-profile.ts`                                                                | PASS       | context manager e user profile portados com contratos testáveis                                                     |
| Mensagens — lifecycle                 | `assistant-messages.js`    | `src/message-pipeline.ts`                                                                                       | PASS       | áreas, prioridade, dedupe 2s, clear e supressão durante Navigation                                                  |
| Mensagens — sanitização               | `assistant-messages.js`    | porta `sanitize` do message pipeline                                                                            | PASS       | toda entrada passa obrigatoriamente por sanitização antes do estado                                                 |
| Mensagens — DOM/UI                    | `assistant-messages.js`    | app V2                                                                                                          | PARTIAL    | wiring básico de input/mensagens existe; lifecycle visual completo da V1 ainda falta                                |
| Sugestões proativas — decisão         | `proactive-suggestions.js` | `src/proactive-suggestions.ts`                                                                                  | PASS       | cooldown, thresholds, prioridades e ordem V1 preservados                                                            |
| Sugestões proativas — conteúdo/menu   | `proactive-suggestions.js` | `src/proactive-copy.ts` + `src/proactive-content.ts`                                                            | PASS       | copy PT/EN/ES/HE, contextual menu e smart recommendations equivalentes                                              |
| Fallback LLM — decisão                | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | decidir local vs LLM conforme política V1                                                                           |
| Fallback LLM — execução               | `llm-fallback.js`          | porta `llm` do controller                                                                                       | PARTIAL    | orquestração pronta; provider same-origin real ainda pendente                                                       |
| Boundary `/api/ai/*`                  | legado + registry          | API same-origin V2                                                                                              | GAP        | nenhum segredo no cliente; provider server-side                                                                     |
| Voz                                   | `voice/**`                 | a implementar                                                                                                   | GAP        | síntese, preferência e idiomas PT/EN/ES/HE                                                                          |
| Integração Navigation                 | diálogo/mensagens V1       | `src/navigation-handlers.ts` → resolver/app controller → `NavigationSessionBootstrap` → `@touristic/navigation` | PASS       | universo curado integral, matcher, boundary e início/cancelamento de rota cobertos                                  |
| UI shell do assistente                | shell V1                   | app V2                                                                                                          | PARTIAL    | abertura, fechamento, menu, mensagens e estados visuais equivalentes                                                |

## Estado do milestone M19

O M19 substitui o catálogo transitório de 34 destinos pelo projection congelado completo de `js/map/locations/locations.js` da baseline V1. São 131 entradas preservadas na ordem original das categorias: 8 praias, 45 restaurantes, 35 hotéis, 12 lojas, 8 transportes, 8 atrações, 5 pontos de vida noturna, 4 emergências e 6 passeios.

`assistant-v1-destination-catalog.ts` preserva os nomes canônicos, coordenadas e aliases realmente existentes na V1, sem manter aliases sintéticos introduzidos durante os checkpoints M14–M16. A ordem também é parte do contrato: como `findPlace` retorna o primeiro candidato compatível, duplicatas da fonte continuam com a mesma precedência observável. Por exemplo, `Toca do Morcego` resolve primeiro pela entrada de `attractions`, e `Farmácia Morro de São Paulo` primeiro pela entrada de `shops`.

O catálogo congelado mantém inclusive registros de origem fora do raio, enquanto `assistant-v1-place-resolver.ts` aplica o boundary V1 de 12 km antes de qualquer estratégia de match. Isso reproduz a forma como `allPlaces` era construído na V1. Uma consulta cujo candidato exato foi eliminado pelo boundary ainda pode, legitimamente, cair no Dice fuzzy e encontrar outro destino válido; por isso as regressões verificam que a identidade fora do raio é excluída, sem alterar o fallback fuzzy original apenas para forçar `null`.

Com catálogo integral, ordem da fonte, aliases, coordenadas, boundary de 12 km e precedência exact → alias → partial → Dice fuzzy `>= 0.55` cobertos por testes, `Resolução de place name` passa a `PASS`. Como o browser runtime já conecta esse resolver aos handlers de Navigation, ao `NavigationSessionBootstrap` e a `@touristic/navigation`, `Integração Navigation` também passa a `PASS` neste checkpoint.

A FEATURE-0004 / MIG-0006 **ainda não está equivalente**. Permanecem gaps em handlers de domínio do diálogo, provider LLM same-origin, boundary `/api/ai/*`, voz e lifecycle/UI completa do assistente.

## Estado do milestone M20

O M20 introduz em `@touristic/assistant` uma fronteira explícita para os handlers de domínio que já possuíam classificação de intent, mas ainda não tinham contrato executável no controller. `domain-handlers.ts` cobre `weather`, `my_location`, `photos`, `price`, `hours`, `more_info`, `nearby`, `favorites` e `help` por portas tipadas, sem acoplar o pacote de domínio ao DOM, geolocalização do browser ou providers externos.

Para intents relacionadas a um local, a resolução contextual segue `intent.entities.place` antes de `context.lastPlace`. Quando nenhum local existe, o handler não inventa um destino nem chama um provider incompleto: retorna um estado explícito `awaiting_place` com pergunta adequada. As regressões cobrem delegação das nove intents, precedência do local explícito, fallback conversacional e ausência segura de contexto.

Este checkpoint fecha a lacuna de **contrato/dispatch**, mas não a equivalência observável dos handlers. O `browser-assistant-runtime.ts` ainda precisa compor adapters reais para clima, geolocalização, fotos, preço, horário, detalhes, nearby, favoritos e help, preservando os efeitos e copy da V1. Por isso as linhas correspondentes continuam `PARTIAL` e a FEATURE-0004 / MIG-0006 permanece não equivalente.

## Estado do milestone M21

O M21 conecta o runtime de browser aos contratos de domínio introduzidos no M20. `assistant-domain-adapter.ts` passa a fornecer adapters observáveis para `my_location`, `favorites` e `help`, mantendo `photos`, `price`, `hours` e `more_info` em estados explícitos de provider pendente em vez de inventar dados.

A geolocalização permanece isolada atrás de uma porta de browser; favoritos são lidos do perfil V2 persistido; e o help retorna menu determinístico. As regressões cobrem estado vazio de favoritos, favoritos persistidos, sucesso de geolocalização e help.

## Estado do milestone M22

O M22 conecta `weather` ao provider same-origin já existente em `/api/weather`, reutilizando `fetchMorroWeather`. O servidor preserva o boundary de credenciais e a estratégia Visual Crossing → Open-Meteo, enquanto o Assistente recebe apenas o payload sanitizado de clima atual.

O comportamento cobre temperatura e condição atuais, opções auditadas e fallback climático explícito. `weather` permanece `PARTIAL` porque a V1 também expõe máxima/mínima, umidade, vento, probabilidade de chuva e copy localizada PT/EN/ES/HE que ainda não foram integralmente reproduzidos.

## Estado do milestone M23

O M23 conecta `nearby` à geolocalização do browser e ao catálogo curado da baseline V1. Sem categoria, o Assistente preserva a pergunta auditada antes de solicitar localização. Com categoria definida, a localização é obtida de forma transitória, sem persistência, e o catálogo é filtrado pela categoria e pelo boundary V1 de 12 km.

Os candidatos elegíveis são ordenados por distância Haversine até a posição atual e os cinco mais próximos são retornados como opções do diálogo. As regressões cobrem solicitação de categoria sem acesso prematuro à localização, ranking determinístico a partir da Segunda Praia e falha de permissão sem fabricação de resultados.

`nearby`, `favorites` e `help` possuem agora wiring real de browser, mas a linha permanece `PARTIAL` até que copy, opções e comportamento observável PT/EN/ES/HE estejam integralmente equivalentes à V1.

## Estado do milestone M24

O M24 conecta `hours` e `more_info` ao comportamento de detalhes de local observado na baseline V1. `assistant-place-details-adapter.ts` resolve primeiro o destino pelo catálogo curado e pelo matcher V1, garantindo que a consulta ao provider use o nome canônico e as coordenadas já validadas pelo boundary de 12 km.

A consulta reutiliza a Mapbox Search Box Forward API da V1 com `q`, `language`, `limit=3`, tipos `poi,place,address` e `proximity` nas coordenadas do destino. Entre os candidatos retornados, o adapter seleciona o feature mais próximo e normaliza apenas campos observáveis disponíveis: endereço, categoria, `open_now`, telefone, website e `mapbox_id`. O token utilizado é o token público de Mapbox já exposto ao runtime (`VITE_MAPBOX_ACCESS_TOKEN`); nenhum segredo novo é introduzido no cliente.

`hours` passa a responder o estado aberto/fechado quando `open_now` existe e retorna indisponibilidade explícita quando o provider não fornece esse dado. `more_info` passa a enriquecer a resposta com os campos disponíveis sem fabricar valores ausentes. Falta de token, destino desconhecido, erro HTTP, payload sem candidatos ou campos ausentes resultam em fallback seguro, e as regressões cobrem consulta canônica, proximity, seleção do candidato mais próximo, ausência de token e destino inexistente.

O M24 não promove a linha de handlers de domínio a `PASS`: `photos` e `price` ainda permanecem sem provider V2 real, e a equivalência observável multilíngue dos demais handlers ainda precisa ser concluída.

A FEATURE-0004 / MIG-0006 **ainda não está equivalente**. Permanecem gaps em `photos`, `price`, provider LLM same-origin, boundary `/api/ai/*`, voz, paridade completa de weather e lifecycle/UI completa do assistente, além das paridades de copy/i18n ainda marcadas como `PARTIAL`.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.
