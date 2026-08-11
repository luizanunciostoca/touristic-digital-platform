# Master Migration Tracker

## Finalidade

Este arquivo é a fonte de acompanhamento da migração V1 → Touristic Digital Platform. Cada item deve manter rastreabilidade entre origem, domínio, destino, equivalência, testes, riscos e rollback.

## Estados oficiais

`discovered` → `mapped` → `snapshotted` → `migrating` → `equivalent` → `released`

Um item não pode avançar para `equivalent` sem evidência visual ou comportamental aplicável, teste automatizado e caminho de rollback.

## Tracker inicial

| ID | Origem V1 | Domínio | Feature | Destino V2 | Wave | Estado | Visual | Comportamental | Testes | Risco |
|---|---|---|---|---|---:|---|---|---|---|---|
| MIG-0001 | `index.html` | Core UI | FEATURE-0007 | `apps/morro-digital-platform` | 3 | equivalent | Home V1 × V2 comprovada em mobile/tablet/desktop; loading pixel-exact 0 e demais estados pelo manifest v4 | shell, acessibilidade, clima e fallbacks preservados | PR #19 + PR #20 verdes e incorporados à `main` | alto |
| MIG-0002 | `css/main.css` | Design System | FEATURE-0007 | `packages/design-system/src/legacy` | 2 | equivalent | 35/35 imports CSS ativos preservados byte a byte no checkpoint V1 | n/a | hashes Git blob + regressões visuais do PR #19 | alto |
| MIG-0003 | `css/base/variables.css` | Design System | FEATURE-0007 | `packages/design-system/src/tokens` | 2 | mapped | pendente | n/a | extração de tokens pendente | médio |
| MIG-0004 | `js/map*` | Geospatial | FEATURE-0001 | `packages/geospatial` | 4 | equivalent | contrato visual Mapbox V1 validado em mobile/tablet/desktop e alto contraste | provider real, fallback e rollback comprovados | PR #17: Quality, Provider, Tour Browser e Visual Contract verdes | crítico |
| MIG-0005 | `js/navigation*` | Navigation | FEATURE-0003 | `packages/navigation` + adapters em `packages/geospatial` + composição no app | 4 | equivalent | banner, guidance, first-person/câmera, minimizar/maximizar, forced-colors, texto 200% e mobile/tablet/desktop comprovados | 24/24 cenários obrigatórios PASS: sessão, accuracy, routing, Mapbox Directions fallback, geometry, bearing, arrival, events, lifecycle e provider fallback/teardown | matriz `NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md`; PRs #49/#52/#53/#54/#55; Quality Gates #542/#568/#569/#575 e browser gates verdes | crítico |
| MIG-0006 | `js/assistant*` | Assistant | FEATURE-0004 | `packages/assistant` | 11 | equivalent | shell/DOM/carrossel e contratos browser V1 validados | NLP, diálogo, domains, LLM, voz, Navigation e photos equivalentes | matriz `ASSISTANT-MIGRATION-MATRIX.md`; Quality + browser contracts M35 verdes | alto |
| MIG-0007 | Business Portal | Business | FEATURE-0005 | `packages/business` + Business surfaces/adapters in `apps/morro-digital-platform` | 6 | equivalent | dashboard, 28-step onboarding, production profile and browser lifecycle contracts evidenced | 19/19 Business-owned contracts PASS; checkout execution remains Payments-owned N/A | `BUSINESS-MIGRATION-MATRIX.md`; M54–M65 evidence; PR #128 Quality + Business browser contracts | alto |
| MIG-0008 | CRM V1 | CRM | FEATURE-0006 | `apps/admin-crm` | 7 | discovered | pendente | pendente | pendente | alto |
| MIG-0009 | autenticação e sessão | Auth | FEATURE-0008 | `packages/auth` + `packages/auth-browser` + Auth surfaces in `dashboard/` | 6 | equivalent | login V1-equivalent and canonical dashboard return proven in Chromium | 20/20 Auth contracts PASS: login/session/cookie/CSRF/origin/roles/tenant/audit/revocation | `AUTH-MIGRATION-MATRIX.md`; M47–M48 + M50–M52 + M66 evidence; PR #129 Quality + Auth/Business browser contracts | crítico |
| MIG-0010 | pagamentos/assinaturas | Payments | FEATURE-0009 | `packages/payments` | 8 | discovered | pendente | pendente | sandbox pendente | crítico |
| MIG-0011 | afiliados | Affiliates | FEATURE-0010 | `packages/affiliates` | 9 | discovered | pendente | pendente | pendente | crítico |
| MIG-0012 | `js/map*` + bootstrap V1 | Geospatial | FEATURE-0001 | `packages/geospatial` + `apps/morro-digital-platform/src/bootstrap/geospatial.ts` | 4 | equivalent | Mapbox Visual Contract validado nos três viewports, normal e `forced-colors` | Runtime, adapter, Mapbox real, fallback, rollback e lifecycle comprovados | PR #17 head final `2d84629b`; runs `31237633579`, `31237633601`, `31237633577` verdes | crítico |
| MIG-0013 | Home / seletor de roteiros V1 | Core UI / Tours | FEATURE-0007 | `apps/morro-digital-platform/src/browser-entry.ts` | 4 | equivalent | matriz Home v4: loading, map-ready, teclado, contraste e texto ampliado comprovados | troca 8→5→5→8, falhas e offline/provider indisponível comprovados | PRs #19/#17/#20 incorporados; Quality Gate final da matriz `31237787144` verde | alto |
| MIG-0014 | `js/tours/tour-data.js` | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-catalog.ts` + `tour-localization.ts` | 4 | equivalent | estrutura e conteúdo editorial multilíngue dos 3 roteiros preservados em PT-BR, EN, ES e HE | 3 roteiros / 18 paradas; descrições, narrações, dicas, fallbacks, chaves V1, geometria e mídia preservados | PR #18; Quality Gate #385 verde; revalidação integradora obrigatória após sync com `main` | alto |
| MIG-0015 | marcadores e centro do mapa da V1 | Geospatial / Tours | FEATURE-0001 | `apps/morro-digital-platform/src/config/tour-markers.ts` + `tour-selection.ts` | 4 | equivalent | rota, source/layers, câmera e 8/5 paradas validados no Mapbox real | substituição atômica, recentralização, troca 8→5→5→8 e rollback comprovados | PR #17 runs Provider `31237633601` e Tour Browser `31237633588` verdes | crítico |
| MIG-0016 | resolvedor `findTourByKeyword` da V1 | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-search.ts` | 4 | equivalent | n/a | aliases, acentos, termos barco/Gamboa, quadriciclo/ATV e retorno seguro preservados | testes automatizados do Runtime M1 + Quality Gates posteriores verdes | médio |

## Business equivalente — MIG-0007

M65 closes the final Business-owned parity contract. The canonical matrix is `19 PASS / 0 PARTIAL / 0 GAP / 1 N/A`; checkout execution is the sole N/A because it belongs to `FEATURE-0009`. The Business feature is `equivalent`, not `released`. See `docs/qa/BUSINESS-M65-EVIDENCE.md` and PR #128 for the final Quality and deterministic Chromium evidence.

## Auth equivalente — MIG-0009

M66 closes the four consumer-dependent Auth parity rows intentionally left partial in M48. The canonical matrix is `20 PASS / 0 PARTIAL / 0 GAP / 0 N/A`. The feature is `equivalent`, not `released`. Permanent evidence includes the Auth Integration Contract, Auth Login Browser Contract and Business dashboard/security regressions on PR #129.

## Evidência consolidada — checkpoint Home + Runtime + Geospatial

A sequência de consolidação foi concluída em `main` por squash, preservando a separação arquitetural:

```text
PR #19 — V1 App Shell
merge: a7f3dd75c48173d4226eaa6a4eda5998ff2ed5ad

PR #17 — Mapbox GL JS real
merge: 41f0588d3f5bf18ea03394dbd0137bd7e2821b3c

PR #20 — matriz formal V1 × V2
merge: 5702834b08fece32b2189c5bae472fa82ef52a4f
```

### App Shell / V1 checkpoint — PR #19

Head validado:

```text
8c73e827711c473fb893ab7e44cdcd5dddbf21f5
```

Evidências:

```text
Quality Gate: 31235067203 — success
Capture loading/map-ready: 31235065886 — success
Capture accessibility: 31235065887 — success
Capture text enlargement: 31235065888 — success
```

O estado `loading` atingiu diferença de 0 pixels em mobile, tablet e desktop. O shell preserva acessibilidade, texto ampliado e comportamento de clima/provider indisponível.

### Mapbox real / Tour Switching — PR #17

Head final validado:

```text
2d84629bafbcfa1dc48ec6203b2a26625ac88bcb
```

Evidências no mesmo head:

```text
Quality Gate: 31237633579 — success
Map Provider Regression: 31237633601 — success
Map Tour Browser Regression: 31237633588 — success
Mapbox Visual Contract Regression: 31237633577 — success
```

O contrato validado preserva Mapbox GL JS 3.12.0, style V1, câmera inicial, source/layers, paints/dash/widths, `fitBounds`, 8→5→5 e restauração, teclado, logo vendor, alto contraste, fallback Leaflet e rollback após falha de SDK/inicialização.

### Matriz formal — PR #20

Head final validado:

```text
ed00d970ad6d493d040dd33e28a103e814197e0d
```

Quality Gate:

```text
Run: 31237787144
Conclusão: success
```

O manifest v4 mantém três modos de prova:

- `pixel-exact`: threshold obrigatório de 0 pixels para estados determinísticos;
- `visual-contract`: renderer externo variável, com contrato V1, navegador autenticado, screenshots e zero erros;
- `behavioral-equivalence`: fallback, falhas e provider indisponível.

A jornada `home` está em `equivalent`, não `released`.

## Pendência ativa da Wave 4

A pendência funcional ainda aberta fora de Navigation é **MIG-0014 — conteúdo dos roteiros**.

O PR #18 deve permanecer draft até:

- confrontar diretamente a V1 congelada `60746fd7fed97b805758b37adfdbe3bad2582bfe`;
- inventariar todos os campos editoriais dos 3 roteiros e 18 paradas;
- preservar os idiomas realmente suportados pela V1;
- migrar descrições completas, narrações, dicas e metadados de acessibilidade quando existirem na fonte;
- validar fallback e chaves de tradução;
- adicionar testes de equivalência por campo/chave;
- registrar qualquer mudança intencional como `preservar`, `corrigir` ou `melhorar`;
- executar Quality Gate completo no head final.

MIG-0014 só poderá avançar para `equivalent` após essa evidência.

## Navigation equivalente — MIG-0005

A fonte V1 de Navigation permanece congelada em:

```text
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

O baseline `docs/migration/NAVIGATION-V1-BASELINE.md` e a matriz `docs/migration/NAVIGATION-MIG-0005-EQUIVALENCE-MATRIX.md` cobrem os contratos obrigatórios de sessão, routing, geometry, geolocation, UI, acessibilidade e provider fallback.

Resultado final da matriz:

```text
PASS     24
PARTIAL   0
GAP       0
TOTAL    24
```

Checkpoints adicionais que fecharam as pendências finais:

```text
Accuracy V1 — PR #52
head 211054cebd4e5e991958e2292e7eb4d3bbecb0f6
1500 m bootstrap / 300 m guidance

Routing fallback — PR #53
head 54ee3ca76e46b59fe8e4aa622bd3afae0ab8c835
Quality Gate #568 — success
Navigation Visual Baseline #41 — success

Acessibilidade ativa — PR #54
head 68177abb57f648ac73b0e3d3d999a510badfd5a4
Quality Gate #569 — success
Navigation Accessibility Baseline #1 — success
artifact 9031022524
sha256 a23b789045ee557d4001cefed8f1a8603f704ef59c1ddc787d05f965ce89d161

Provider fallback — PR #55
head d2a169b29ec991c9fb42918af593cdbff10fbb05
Quality Gate #575 — success
```

O contrato final mantém o core `@touristic/navigation` provider-agnostic, o adapter Mapbox no boundary geospatial/app, nenhum segredo no browser, teardown idempotente e ausência de navegação Leaflet inventada. Quando Mapbox cai para fallback cartográfico, o runtime guiado Mapbox é destruído antes da troca de provider.

`MIG-0005` está em `equivalent`, não `released`. Rollout/publicação permanece separado.

## Campos obrigatórios por novo item

- ID permanente `MIG-XXXX`;
- caminho ou fluxo de origem na V1;
- domínio owner;
- Feature ID;
- destino exato no monorepo;
- wave;
- dependências e APIs externas;
- baseline visual e comportamental;
- teste de equivalência;
- risco e rollback;
- responsável e decisão de preservação.

## Gate da Wave 3 — Core UI

A Wave 3 possui equivalência da Home comprovada. A extração/refatoração de Design System além da camada legacy continua separada e só avança com seus próprios gates e baselines.
