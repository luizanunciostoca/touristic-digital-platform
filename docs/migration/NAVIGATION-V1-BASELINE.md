# Navigation V1 Baseline — MIG-0005 / FEATURE-0003

## Objetivo

Este documento registra a baseline funcional, arquitetural, visual e de segurança da navegação da V1 antes de qualquer implementação correspondente na Touristic Digital Platform.

A regra desta migração é equivalência primeiro, refatoração depois. Nenhum comportamento relevante da V1 pode ser removido, simplificado ou reinterpretado apenas por conveniência arquitetural.

## Fonte congelada

Repositório V1:

```text
luizidebook/morro-de-sao-paulo-digital
```

Commit auditado:

```text
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

## Estado deste baseline

```text
MIG-0005: mapped
FEATURE-0003: baseline-pending
```

Este documento ainda não constitui evidência suficiente para `snapshotted` ou `equivalent`.

Para avançar é obrigatório produzir uma baseline executável/visual da V1 e testes automatizados equivalentes na V2.

## Entrypoints ativos identificados

A inicialização da V1 chama `initNavigationUI()` diretamente em `main.js`.

`initNavigationUI()`:

- configura o botão fixo de encerramento;
- escuta `navigationStarted` e `navigationEnded`;
- inicializa `navigation-route-runtime.js`.

A navegação também se integra ao assistente por eventos e comandos, incluindo solicitação de navegação a partir de POIs.

## Componentes V1 inventariados

### Orquestração

- `navigationController/navigationController.js`
- `navigationIntegration.js`
- `navigationUI.js`

### Estado e concorrência

- `navigationState/navigationStateManager.js`
- `navigationState/navigationSessionManager.js`
- `navigationState/navigation-contract.js`
- `navigationState/navigation-route-geometry.js`
- `navigationState/navigation-route-helpers.js`

### Routing

- `navigationServices/routing-client.js`
- `navigationServices/directionsService.js`

### Instruções

- `navigationInstructions/routeProcessor.js`
- `navigationInstructions/routeProcessorUtils.js`
- `navigationInstructions/translateInstruction.js`
- `navigationUtils/instructionBuilder.js`
- `navigationUtils/navigationIcons.js`

### Localização e tracking

- `navigationUserLocation/user-location.js`
- `navigationUserLocation/enhanced-geolocation.js`
- `navigationUserLocation/enhanced-location-manager.js`
- `navigationUserLocation/enhanced-user-marker.js`
- `navigationUserLocation/movement-predictor.js`

### Runtime visual

- `navigationRuntime/navigation-route-runtime.js`
- `navigationRuntime/navigation-visual-stabilizer.js`

### UI

- `navigationUi/bannerUI.js`
- `navigationUi/navigationConfig.js`
- botão `#end-navigation-btn` em `index.html`
- banner `#instruction-banner` em `index.html`

### Sugestões e POIs

- `navigationSuggestions/navigation-suggestions.js`
- `navigationUtils/poiEnricher.js`

## Contrato de sessão

A V1 possui uma sessão de navegação explícita e cancelável.

`beginNavigationSession()` deve:

1. invalidar a sessão anterior;
2. criar um novo identificador monotônico;
3. criar um `AbortController` próprio;
4. associar timers, intervals e cleanups à sessão;
5. disponibilizar `isActive()` e `assertActive()`.

Ao cancelar ou substituir uma sessão:

- requests pendentes devem ser abortados;
- timeouts devem ser limpos;
- intervals devem ser limpos;
- listeners/cleanups devem ser removidos;
- callbacks atrasados não podem mutar o estado da nova sessão.

### Regra obrigatória V2

Nenhum callback assíncrono de routing, geolocation, câmera, banner ou assistente pode atualizar a UI ou estado sem validar que a sessão que o originou continua ativa.

## Contrato de routing

### Formato canônico

Coordenadas externas do routing usam:

```text
[longitude, latitude]
```

Apenas coordenadas finitas e dentro dos limites geográficos são aceitas.

### Perfil

O perfil atualmente aceito é:

```text
foot-walking
```

Perfis inválidos retornam ao perfil canônico.

### Idiomas

A V1 aceita:

```text
pt
en
es
he
```

### Endpoint primário

O browser solicita a rota por proxy same-origin:

```text
POST /api/routing/directions
```

O request usa JSON, `credentials: same-origin` e `cache: no-store`.

### Segurança

A implementação V2 deve preservar as seguintes garantias:

- nenhuma chave OpenRouteService no bundle/browser;
- nenhum endpoint ORS direto no browser;
- nenhum parâmetro `api_key` interpolado no frontend;
- nomes de destinos inseridos em HTML devem ser sanitizados;
- responses inválidos não podem ser aceitos como rota válida.

### Timeout e cancelamento

Routing deve diferenciar pelo menos:

```text
INVALID_COORDINATES
ROUTING_TIMEOUT
ROUTING_CANCELLED
ROUTING_NETWORK_ERROR
ROUTING_PROXY_UNAVAILABLE
INVALID_ROUTE_RESPONSE
```

O timeout V1 é limitado entre 1 s e 30 s, com default de 12 s no cliente canônico.

### Fallback

A V1 possui fallback de routing para Mapbox Directions quando o proxy está indisponível ou retorna condições explicitamente elegíveis.

O fallback deve permanecer isolado do core de navegação. O core não deve depender de APIs Mapbox.

## Contrato do route model

A V1 normaliza rotas GeoJSON e aceita variações estruturais legadas, mas converge para uma geometria LineString com pelo menos dois pontos válidos.

O modelo calcula:

- distância geométrica por Haversine;
- distância total;
- duração total;
- escala entre distância declarada e geometria;
- distâncias cumulativas;
- limites de cada step;
- identidade determinística da rota.

## Contrato de tracking geométrico

A posição do usuário é projetada sobre o segmento mais próximo da rota.

O snapshot expõe pelo menos:

- `routeIdentity`;
- coordenada projetada;
- índice do segmento;
- distância fora da rota;
- distância total;
- duração total;
- distância concluída;
- distância restante;
- duração restante;
- progresso;
- progresso em percentual;
- bearing bruto;
- bearing suavizado;
- distância até a próxima manobra.

### Progresso

A V1 evita regressões abruptas de progresso. Um pequeno recuo configurado é tolerado, mas a navegação não pode saltar arbitrariamente para trás por ruído de GPS.

### Bearing

O bearing usa a tangente da rota à frente do usuário e smoothing angular para evitar oscilações bruscas.

## Runtime visual e câmera

O runtime V1 possui ownership explícito do movimento visual do Mapbox durante navegação.

Parâmetros observados no snapshot auditado:

```text
runtime update interval: 600 ms
location event delay: 60 ms
camera minimum interval: 900 ms
camera minimum movement: 1.5 m
camera minimum bearing change: 2.5°
pitch: 68°
default zoom: 19.1
```

A distância até a próxima manobra controla zoom com histerese em três estados:

```text
far
near
close
```

A histerese é obrigatória para impedir alternância contínua de zoom perto dos thresholds.

### Regra de ownership

Durante first-person navigation, apenas um coordenador pode controlar simultaneamente:

- marcador do usuário;
- bearing visual;
- câmera;
- progresso visual da rota.

A V2 não pode reintroduzir múltiplos loops concorrentes controlando a câmera.

### Polling

O polling periódico serve para recuperar/sincronizar estado e banner.

Ele não deve reiniciar animações de câmera sem nova informação visual relevante.

## Eventos V1 relevantes

Baseline mínima:

```text
navigationStarted
navigationStatusChanged
userLocationUpdated
navigationRouteRuntimeUpdated
navigationEnded
```

`navigationStatusChanged` inclui um health snapshot com fase, presença de rota, instruções, localização, estado ativo/pausado, step atual, distância, duração, progresso, sessão e destino.

## Fases e estado

A V2 deve modelar explicitamente o lifecycle da navegação. A implementação não deve depender apenas de booleanos dispersos.

Estados/fases exatos serão congelados na etapa de snapshot comportamental antes da implementação final.

## Geolocation

A V1 protege contra race conditions de tracking.

Requisitos obrigatórios:

- tracking não pode ser marcado como ativo antes da criação bem-sucedida da sessão/watch;
- watcher tardio pertencente a sessão invalidada deve ser cancelado;
- callbacks de localização stale não podem atualizar a navegação atual;
- latitude/longitude, accuracy e freshness devem ser validados antes de guidance.

Limites observados no controller V1:

```text
bootstrap max accuracy: 1500 m
guidance max accuracy: 300 m
```

Esses números são baseline, não recomendação permanente. Qualquer alteração futura deve ser registrada como melhoria deliberada depois da equivalência.

## UI de navegação

O shell V1 contém um banner de instruções com:

- seta/ícone de manobra;
- instrução principal;
- instrução detalhada;
- progresso visual;
- percentual;
- distância restante;
- tempo restante;
- minimizar/maximizar.

Há também um botão fixo independente:

```text
Encerrar Navegação
```

O botão aparece em `navigationStarted`, desaparece em `navigationEnded` e dispara cancelamento explícito.

## Integração com assistente

O assistente participa da entrada e saída da jornada, mas não deve ser owner do estado de navegação.

Integrações observadas:

- POI pode solicitar `navegar até <destino>`;
- `navigationStarted` produz feedback conversacional;
- `navigationEnded` informa cancelamento ou chegada;
- analytics distingue início, conclusão e cancelamento.

A arquitetura V2 deve publicar eventos; o Assistant consome esses eventos sem criar dependência reversa do Navigation para Assistant.

## Fronteira arquitetural V2 proposta

### `@touristic/navigation`

Owner de lógica provider-agnostic:

- contratos de rota;
- contratos de localização;
- lifecycle e sessão;
- routing client abstraction;
- route geometry model;
- route tracker;
- guidance state;
- cálculo de progresso/bearing;
- eventos de navegação;
- erros normalizados;
- contratos de UI/guidance, sem DOM.

### `@touristic/geospatial`

Owner de capacidades de mapa/provider:

- Mapbox/Leaflet drivers;
- renderização da route geometry;
- marker do usuário;
- câmera first-person;
- fit/zoom/padding;
- visual progress layer;
- adaptação de provider para contratos do Navigation.

### App `morro-digital-platform`

Owner de composição específica do destino:

- UI concreta do banner;
- botão Encerrar Navegação;
- ligação com POIs/tours;
- tradução de textos de interface;
- analytics;
- ligação com Assistant por eventos.

### Proibição arquitetural

`@touristic/navigation` não pode importar Mapbox, Leaflet, DOM, Assistant ou código específico de Morro de São Paulo.

## Sequência de migração proposta

### NAV-01 — contratos + sessão

Criar pacote `@touristic/navigation` com tipos, lifecycle e cancelamento de sessão.

Gate:

- nenhum DOM/provider;
- testes de supersession/cancelamento;
- timers/listeners stale não executam efeitos.

### NAV-02 — routing client

Extrair request/normalização/erros para contrato provider-agnostic.

Gate:

- coordenadas;
- timeout;
- abort;
- response validation;
- ausência de segredos no browser.

### NAV-03 — geometry + tracker

Migrar Haversine, projeção, distância cumulativa, progresso, bearing e smoothing.

Gate:

- fixtures V1 × V2;
- tolerâncias numéricas explícitas;
- nenhum acesso a browser APIs.

### NAV-04 — Mapbox navigation adapter

Implementar renderer/câmera no geospatial sem transferir ownership de lifecycle ao provider.

Gate:

- one-camera-owner invariant;
- histerese de zoom;
- throttling;
- rollback/fallback.

### NAV-05 — geolocation adapter

Integrar watchers com sessão e lifecycle.

Gate:

- stale watcher cancellation;
- accuracy/freshness;
- cleanup completo.

### NAV-06 — UI + jornada

Integrar banner, botão Encerrar e eventos no app.

Gate:

- matriz visual V1 × V2;
- teclado;
- contraste forçado;
- texto ampliado;
- minimize/maximize;
- cancel/arrive.

### NAV-07 — Assistant/analytics/suggestions

Conectar consumidores aos eventos estáveis do Navigation.

Gate:

- nenhuma dependência reversa;
- início/conclusão/cancelamento rastreados uma única vez;
- suggestions isoladas do core.

## Matriz obrigatória de equivalência

Antes de MIG-0005 atingir `equivalent`, validar no mínimo:

1. iniciar navegação com localização válida;
2. permissão de localização negada;
3. localização imprecisa;
4. coordenadas inválidas;
5. routing proxy success;
6. routing proxy timeout;
7. routing proxy unavailable;
8. fallback elegível;
9. cancelamento durante request;
10. sessão A substituída por sessão B;
11. callback tardio da sessão A;
12. atualização de progresso ao longo da rota;
13. ruído GPS com pequeno movimento para trás;
14. mudança de bearing;
15. aproximação de manobra e histerese de zoom;
16. polling sem movimento real;
17. minimizar/maximizar banner;
18. cancelamento manual;
19. chegada ao destino;
20. cleanup após `navigationEnded`;
21. fallback de mapa/provider quando aplicável;
22. alto contraste;
23. texto ampliado;
24. mobile/tablet/desktop.

## Critério para `snapshotted`

MIG-0005 só pode avançar para `snapshotted` quando houver evidência congelada da V1 contendo:

- fixtures de routing/geometry;
- sequência de eventos;
- state/health snapshots;
- screenshots dos estados visuais determinísticos;
- gravação ou evidência equivalente para estados dinâmicos de câmera;
- contratos de erro/cancelamento;
- comportamento de fallback.

## Critério para iniciar implementação

NAV-01 pode começar depois deste baseline ser versionado porque é um contrato isolado e reversível.

NAV-04, NAV-05 e NAV-06 não devem ser considerados equivalentes até a baseline executável/visual V1 estar registrada.

## Critério para `equivalent`

Todos os gates aplicáveis devem estar verdes no mesmo head, sem workflows temporários, sem segredos, sem alteração automática residual e com rollback definido.

`equivalent` não significa `released`.
