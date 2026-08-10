# MIG-0006 — Matriz de equivalência do Assistente Digital

Baseline V1: `60746fd7fed97b805758b37adfdbe3bad2582bfe`  
Baseline formal: `docs/qa/ASSISTANT-V1-BASELINE.md`  
Destino: `packages/assistant`

Esta matriz controla a migração de FEATURE-0004. `PASS` só pode ser usado quando o comportamento observável estiver implementado e coberto por evidência executável. `PARTIAL` significa que existe implementação V2, porém o contrato ainda não está completo. `GAP` significa ausência de implementação equivalente.

| Contrato V1                           | Evidência V1               | Destino V2                                                                                                      | Estado M29 | Critério de PASS                                                                                                                        |
| ------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 10 opções canônicas                   | `assistant-messages.js`    | `src/menu.ts`                                                                                                   | PASS       | ordem, valores e labels PT/EN/ES/HE idênticos                                                                                           |
| Normalização de texto                 | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | acentos latinos normalizados e HE preservado                                                                                            |
| NLP local-first                       | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | padrões, complex intents, sinônimos, contexto, entidades e place search                                                                 |
| Intents complexas / always-LLM        | `intent-engine.js`         | `src/complex-intents.ts`                                                                                        | PASS       | cultural_history, practical_tips, transport e accessibility + ordem V1                                                                  |
| Threshold LLM 0.5                     | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | constante e decisão por confiança preservadas                                                                                           |
| Threshold de entrada longa 90         | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | fallback apenas acima de 90 caracteres, como na V1                                                                                      |
| Política `requiresLLM`                | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | intents obrigatórias, confiança, flag, dimensões e padrões complexos                                                                    |
| Modificadores compostos               | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | vocabulário V1 de modifiers coberto e testado                                                                                           |
| `navigate`                            | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                                                           | PASS       | classificação, resolução por porta, fallback contextual e início da rota                                                                |
| `cancel_navigation`                   | `intent-engine.js`         | `src/intent-engine.ts` + `src/navigation-handlers.ts`                                                           | PASS       | classificação e cancelamento via porta pública                                                                                          |
| `open_now`                            | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | PT/EN/ES/HE cobertos                                                                                                                    |
| weather                               | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts` + `assistant-weather-copy.ts`                                 | PASS       | atual + máxima/mínima + umidade + vento + chance de chuva; Visual Crossing/Open-Meteo; copy PT/EN/ES/HE e fallback cobertos por testes  |
| location/photos/price/hours           | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PASS       | geolocalização, fotos físicas, preço, hours e copy PT/EN/ES/HE conectados; bytes/MIME/carrossel validados em browser |
| nearby/favorites/help                 | `intent-engine.js`         | `src/intent-engine.ts` + `src/domain-handlers.ts`                                                               | PASS       | browser adapters, catálogo V1 + geolocalização e copy/opções PT/EN/ES/HE cobertos por testes unitários e de integração                  |
| confirm/deny/greeting/thanks          | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | classificação local equivalente                                                                                                         |
| Extração de entidades                 | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | place, area, meal, price, distance, time, group size, category e lang                                                                   |
| Match por sinônimos                   | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | categorias e intents expandidos PT/EN/ES/HE equivalentes                                                                                |
| Match contextual / `awaiting`         | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | prioridade contextual, filtros, detalhe e seleção numérica cobertos                                                                     |
| Detecção de place name                | `intent-engine.js`         | `src/intent-engine.ts`                                                                                          | PASS       | `place_search` e confiança V1 cobertos                                                                                                  |
| Resolução de place name               | `assistant-dialog.js`      | `assistant-v1-place-resolver.ts` + `assistant-v1-destination-catalog.ts`                                        | PASS       | catálogo integral, ordem, aliases, coordenadas, boundary 12 km, precedência e fuzzy 0.55 equivalentes                                   |
| Controller de diálogo — orchestration | `assistant-dialog.js`      | `src/dialog-controller.ts`                                                                                      | PASS       | input → contexto → intent → handler local → LLM → contexto/histórico                                                                    |
| Handlers de domínio do diálogo        | `assistant-dialog.js`      | `src/domain-handlers.ts` + portas do `src/dialog-controller.ts`                                                 | PASS       | handlers e i18n PT/EN/ES/HE conectados sem drift; domínio photos validado com assets físicos e apresentação browser |
| Context manager                       | `context-manager.js`       | `src/context-manager.ts`                                                                                        | PASS       | schema v2, TTL 4h, debounce, histórico, preferências e pub/sub                                                                          |
| Perfil do usuário                     | `user-profile.js`          | `src/user-profile.ts`                                                                                           | PASS       | persistência, inferências, interesses, favoritos e sugestões equivalentes                                                               |
| Contexto conversacional               | `assistant-context/**`     | `src/context-manager.ts` + `src/user-profile.ts`                                                                | PASS       | context manager e user profile portados com contratos testáveis                                                                         |
| Mensagens — lifecycle                 | `assistant-messages.js`    | `src/message-pipeline.ts`                                                                                       | PASS       | áreas, prioridade, dedupe 2s, clear e supressão durante Navigation                                                                      |
| Mensagens — sanitização               | `assistant-messages.js`    | porta `sanitize` do message pipeline                                                                            | PASS       | toda entrada passa obrigatoriamente por sanitização antes do estado                                                                     |
| Mensagens — DOM/UI                    | `assistant-messages.js`    | app V2                                                                                                          | PASS       | pipeline conectado ao DOM; áreas, clear, dedupe, sanitização, scroll, classes/metadata e opções dinâmicas cobertos por testes           |
| Sugestões proativas — decisão         | `proactive-suggestions.js` | `src/proactive-suggestions.ts`                                                                                  | PASS       | cooldown, thresholds, prioridades e ordem V1 preservados                                                                                |
| Sugestões proativas — conteúdo/menu   | `proactive-suggestions.js` | `src/proactive-copy.ts` + `src/proactive-content.ts`                                                            | PASS       | copy PT/EN/ES/HE, contextual menu e smart recommendations equivalentes                                                                  |
| Fallback LLM — decisão                | `intent-engine.js`         | `src/llm-policy.ts`                                                                                             | PASS       | decidir local vs LLM conforme política V1                                                                                               |
| Fallback LLM — execução               | `llm-fallback.js`          | porta `llm` do controller + `assistant-llm-adapter.ts`                                                          | PASS       | client same-origin, timeout/fail-closed, resposta normalizada e provider server-side conectados                                         |
| Boundary `/api/ai/*`                  | legado + registry          | `/api/ai/assistant/respond` + alias legado `/api/assistant/respond`                                             | PASS       | nenhum segredo no cliente; provider server-side, validação, rate limit e timeout                                                        |
| Voz                                   | `voice/**`                 | `src/voice-synthesis.ts` + `assistant-voice-adapter.ts` + `assistant-voice-input-adapter.ts`                    | PASS       | síntese, microfone one-shot, configuração visual, persistência V1, PT/EN/ES/HE e fallback sem Web Speech cobertos por evidência browser |
| Integração Navigation                 | diálogo/mensagens V1       | `src/navigation-handlers.ts` → resolver/app controller → `NavigationSessionBootstrap` → `@touristic/navigation` | PASS       | universo curado integral, matcher, boundary e início/cancelamento de rota cobertos                                                      |
| UI shell do assistente                | shell V1                   | `assistant-shell-ui.ts` + app V2                                                                                | PASS       | inicia oculto; show/hide/toggle, minimizar, Escape, tutorial guard, ARIA, foco e conteúdo associado cobertos por regressões browser     |

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

## Estado do milestone M25

O M25 porta integralmente a estratégia de resolução de fotos observada em `js/utils/carousel.js` da baseline V1. `assistant-v1-photo-catalog.ts` preserva as 118 entradas catalogadas, os três arquivos JPG associados a cada entrada e a precedência de resolução exact → inclusão parcial → aliases → prefixo → similaridade por palavra, com a mesma normalização de acentos, pontuação e espaços da V1.

O browser runtime passa a reconhecer o contrato de apresentação `carousel` e renderiza uma galeria horizontal responsiva, com scroll snap, texto alternativo, carregamento lazy após a primeira imagem e sem dependência de Swiper. O adapter de domínio faz uma verificação `HEAD` do primeiro asset antes de expor o carrossel: enquanto os binários legados não estiverem presentes no runtime V2, responde com `asset_source_pending` em vez de produzir imagens quebradas. As regressões cobrem resolução exata, normalização, aliases, match parcial, categorias representativas, ausência segura e os estados de assets disponíveis/ausentes.

O catálogo e o wiring visual estão implementados, porém os arquivos binários de `images/fotos/**` continuam armazenados apenas no repositório legado privado. A integração GitHub disponível para este checkpoint permite ler os blobs da origem, mas não oferece uma operação binária bulk entre repositórios; referências de blob não podem ser reutilizadas entre repositories. Por isso `photos` permanece `PARTIAL` até a migração física desses assets (ou definição de um asset origin público controlado) e a validação visual correspondente.

A FEATURE-0004 / MIG-0006 **ainda não está equivalente**. Além do asset delivery de `photos`, permanecem pendentes `price`, provider LLM same-origin, boundary `/api/ai/*`, voz, paridade completa de weather, lifecycle/UI completa do assistente e as paridades de copy/i18n já marcadas como `PARTIAL`.

## Estado do milestone M26

O M26 remove o estado `provider_pending` do intent `price` reproduzindo a orientação observável da baseline V1 quando existe um local em contexto. A V1 não consultava um provider de preços em tempo real nesse fluxo: informava que valores podem variar, recomendava confirmação direta com o estabelecimento e apresentava as faixas gerais auditadas — praias gratuitas, passeios de barco em torno de R$ 80–150 por pessoa e restaurantes entre R$ 30–150 por pessoa.

A V2 preserva esse comportamento sem fabricar um preço específico para o estabelecimento e mantém o local no metadata do diálogo. A ausência de local continua coberta pelo contrato `awaiting_place` da camada de domínio. Com isso `price` deixa de ser um provider ausente; a linha agregada permanece `PARTIAL` apenas pelos assets físicos de `photos` e pelas paridades multilíngues/weather ainda abertas.

A FEATURE-0004 / MIG-0006 **ainda não está equivalente**. Permanecem o delivery de assets de `photos`, provider LLM same-origin, boundary `/api/ai/*`, voz, paridade completa de weather, lifecycle/UI completa e paridades de copy/i18n marcadas como `PARTIAL`.

Para promover MIG-0006 a `equivalent`, todos os itens acima precisam estar em PASS e o Quality Gate do head final deve estar integralmente verde.

## Estado do milestone M27

O M27 fecha a execução do fallback LLM e o boundary server-side do Assistente. `assistant-llm-adapter.ts` conecta a porta `llm` do controller ao endpoint same-origin `/api/ai/assistant/respond`, preservando timeout de 12 segundos, histórico limitado, contexto sanitizado, normalização de action/options/confidence e falha fechada para que indisponibilidade do provider nunca quebre o diálogo local-first.

`assistant-api.mjs` hospeda a fronteira server-side: valida método e payload, limita 30 chamadas por minuto por origem, mantém `OPENAI_API_KEY` e `OPENAI_MODEL` exclusivamente no processo do servidor, normaliza a resposta do provider e expõe também `/api/assistant/respond` como alias de compatibilidade com a baseline V1. Nenhum segredo é serializado em `runtime-config.js` ou entregue ao browser.

Com isso, `Fallback LLM — execução` e `Boundary /api/ai/*` passam a `PASS`. A FEATURE-0004 / MIG-0006 **ainda não está equivalente**: permanecem delivery físico dos assets de `photos`, paridade completa de weather e copy/i18n dos handlers, voz e lifecycle/UI completa do assistente.

## Estado do milestone M28

O M28 porta a base de síntese de voz observável da V1 para contratos testáveis em `@touristic/assistant` e conecta o runtime do browser à Web Speech API sem acoplar o domínio ao DOM. O contrato preserva as chaves de compatibilidade `voiceAssistant`, `voice-enabled`, `voice-speed`, `assistant-voice` e `voice-language`, normaliza os quatro idiomas PT/EN/ES/HE para `pt-BR`, `en-US`, `es-ES` e `he-IL`, seleciona a voz salva ou a melhor voz por locale e limpa HTML/emojis antes da síntese.

O adapter de browser aplica volume, velocidade, pitch e preferência de voz, cancela fala anterior antes de sintetizar uma nova resposta e reage ao carregamento tardio de vozes via `voiceschanged`. Quando a Web Speech API não está disponível, o Assistente continua funcional sem falhar. As respostas do diálogo passam a ser sintetizadas automaticamente quando a preferência de voz está habilitada.

A linha de voz permanece `PARTIAL`: a síntese, persistência e idiomas estão conectados, mas a equivalência integral da UI de seleção de voz e da entrada por voz/microfone da V1 ainda precisa ser portada e validada antes de promover para `PASS`. A FEATURE-0004 / MIG-0006 permanece não equivalente.

## Estado do milestone M29

O M29 conecta o botão de microfone do shell V2 ao reconhecimento de voz nativo do navegador, preservando a estratégia observável da V1: preferência por `SpeechRecognition` com fallback para `webkitSpeechRecognition`, captura de uma única fala por vez (`continuous=false`, `interimResults=false`) e idiomas PT/EN/ES/HE mapeados para `pt-BR`, `en-US`, `es-ES` e `he-IL`.

`assistant-voice-input-adapter.ts` isola a API experimental atrás de um contrato testável, normaliza transcript/confiança, mantém lifecycle explícito de listening e falha de forma segura quando reconhecimento não está disponível ou quando o navegador retorna erro. O `browser-assistant-runtime.ts` envia o transcript reconhecido pelo mesmo pipeline `process()` usado por texto, portanto contexto, NLP local-first, handlers, fallback LLM, histórico e resposta por síntese continuam em uma única trilha funcional.

O botão `#voiceButton` passa a refletir estado com `aria-pressed` e classe `listening`; mensagens de escuta, indisponibilidade e erro são apresentadas em PT/EN/ES/HE. O áudio capturado não é persistido pelo runtime. A linha Voz permanece `PARTIAL` apenas porque o seletor/configuração visual de voz da V1 ainda precisa ser reproduzido antes de `PASS`.

A FEATURE-0004 / MIG-0006 **ainda não está equivalente**. Permanecem principalmente o seletor/configuração visual de voz, assets físicos de fotos, paridade completa de weather/copy/i18n e lifecycle/UI completa do Assistente.

## Estado do milestone M32

O M32 conclui a camada observável de internacionalização dos handlers de domínio do Assistente sem criar um segundo estado de idioma. `assistant-domain-copy.ts` centraliza copy e opções para PT/EN/ES/HE, enquanto `assistant-domain-adapter.ts` reutiliza `intent.entities.language` como fonte de verdade para localização, fotos, preço, horário, detalhes, favoritos e ajuda. `assistant-nearby-adapter.ts` aplica a mesma fonte ao fluxo de categoria, permissão e resultados próximos.

O contrato genérico de `awaiting_place` em `@touristic/assistant` passa a receber o `request` original, permitindo localizar a pergunta antes de delegar ao adapter sem acoplar o pacote de domínio ao browser. Os metadados observáveis existentes foram preservados deliberadamente: o idioma altera texto e opções, mas não acrescenta campos novos aos payloads de domínio já consumidos pela V2.

As regressões cobrem o dicionário completo e integração real dos handlers em inglês, espanhol e hebraico, além da preservação do comportamento em português. Com isso, `nearby/favorites/help` passa a `PASS`. O agrupamento `location/photos/price/hours` e a linha geral de handlers permanecem `PARTIAL` exclusivamente porque os assets binários de fotos da V1 ainda não estão disponíveis na V2; esse gap será tratado separadamente.

A FEATURE-0004 / MIG-0006 ainda não está integralmente equivalente. Permanecem como principais frentes os assets observáveis de fotos e o lifecycle/UI completo de mensagens e shell do Assistente.

## Estado do milestone M33

O M33 conecta o `message-pipeline.ts` já validado ao DOM real do Assistente. `assistant-message-dom.ts` passa a materializar os contratos V1 de áreas `messages`/`navigation`, limpeza, deduplicação temporal, prioridade, supressão de mensagens de navegação fora da área correta, classes, IDs, `data-message-type` e scroll para a mensagem mais recente. O runtime deixa de adicionar mensagens diretamente e passa a utilizar essa fronteira para entradas do usuário, respostas do Assistente e estados do microfone.

`assistant-dom-view.ts` preserva apenas o pequeno subconjunto de formatação observado nas respostas auditadas (`b`, `strong`, `em` e quebras de linha) e escapa qualquer outro markup, inclusive scripts, imagens e tags com atributos executáveis. As opções retornadas pelos handlers voltam a ser materializadas como botões clicáveis; após a seleção, o valor é reenviado pelo evento `morro:assistant-option-selected`, mantendo o mesmo pipeline de processamento usado pelas opções iniciais.

As regressões unitárias verificam a fronteira de sanitização e o Quality Gate completo valida lint, typecheck, suíte integral e build. O `Assistant Voice Browser Contract` também permanece verde, comprovando que o novo lifecycle visual não regrediu síntese, microfone, preferências ou fallback. Com isso, `Mensagens — DOM/UI` passa a `PASS`.

A FEATURE-0004 / MIG-0006 ainda não está integralmente equivalente. Permanecem o delivery físico dos assets de fotos e a paridade visual completa do shell do Assistente, incluindo os estados observáveis de abertura, minimização e composição final da interface.

## Estado do milestone M34

O M34 fecha a paridade observável do shell do Assistente. `assistant-shell-ui.ts` centraliza o lifecycle de abertura e fechamento que antes estava disperso no `browser-entry.ts`: o modal inicia com `hidden` como na baseline V1, o quick action abre e fecha o shell, o botão de minimizar e a tecla Escape fecham a interface, e o fechamento é bloqueado enquanto o tutorial está ativo.

O controlador sincroniza `hidden`, `aria-hidden`, `aria-expanded`, `aria-controls`, a classe ativa do quick action e `assistant-modal-open` no `body`. Ao abrir, o input recebe foco; ao fechar, componentes associados de carrossel/follow-up também são ocultados. Regressões unitárias cobrem estado inicial, abertura/fechamento, acessibilidade, Escape e tutorial guard.

O contrato browser foi ampliado para validar a própria sequência V1: Assistente oculto no carregamento, abertura explícita pelo mood button, dez opções disponíveis e ordem de foco do modal aberto. No mesmo head, `Quality Gate`, `Assistant Voice Browser Contract`, `Map Provider Regression`, `Map Tour Browser Regression`, `Mapbox Visual Contract Regression`, `Navigation Visual Baseline` e `Navigation Accessibility Baseline` ficaram verdes. Com isso, `UI shell do assistente` passa a `PASS`.

A FEATURE-0004 / MIG-0006 ainda não é promovida a `equivalent` exclusivamente porque o delivery físico dos assets binários de `photos` permanece pendente. O catálogo, resolver e wiring visual de fotos já existem; falta disponibilizar os arquivos auditados da V1 no runtime V2 (ou definir um asset origin controlado) e validar a apresentação final.


## Estado do milestone M35

O M35 fecha o último bloqueio declarado pelo M34: o delivery físico dos assets binários usados pelo domínio `photos`. A baseline V1 `60746fd7fed97b805758b37adfdbe3bad2582bfe` possui 63 arquivos reais em `images/fotos` — 62 `.jpg` e `primeira_praia2.jpeg`. Os 63 bytes foram importados para o mesmo path público na V2 e congelados em `docs/qa/ASSISTANT-V1-PHOTO-ASSETS.sha256`; a regressão `assistant-v1-photo-assets.test.ts` verifica lista e SHA-256 de todo o conjunto.

O `dev-server.mjs` passa a servir `.jpg` e `.jpeg` como `image/jpeg`. O workflow `Assistant Photo Browser Contract` valida amostras físicas por SHA-256, MIME e o fluxo observável `Fotos de Toca do Morcego` até `metadata.presentation=carousel` e o DOM `.assistant-photo-carousel`, usando o runtime Mapbox autenticado real.

No head validado do M35, `Quality Gate`, `Assistant Photo Browser Contract`, `Map Provider Regression`, `Mapbox Visual Contract Regression` e `Navigation Visual Baseline` ficaram verdes. Não foi introduzido asset origin externo, token novo no browser ou transformação dos bytes auditados.

Com isso, `location/photos/price/hours` e `Handlers de domínio do diálogo` passam a `PASS`. Todas as linhas da matriz estão em `PASS`; FEATURE-0004 / MIG-0006 é promovida a `equivalent`. O estado não é `released`: rollout/publicação permanece uma etapa separada.
