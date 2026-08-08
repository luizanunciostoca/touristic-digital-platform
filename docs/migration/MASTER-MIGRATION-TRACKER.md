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
| MIG-0005 | `js/navigation*` | Navigation | FEATURE-0003 | `packages/geospatial/navigation` | 4 | discovered | pendente | pendente | pendente | crítico |
| MIG-0006 | `js/assistant*` | Assistant | FEATURE-0004 | `packages/assistant` | 11 | discovered | pendente | pendente | pendente | alto |
| MIG-0007 | Business Portal | Business | FEATURE-0005 | `apps/business-portal` | 6 | discovered | pendente | pendente | pendente | alto |
| MIG-0008 | CRM V1 | CRM | FEATURE-0006 | `apps/admin-crm` | 7 | discovered | pendente | pendente | pendente | alto |
| MIG-0009 | autenticação e sessão | Auth | FEATURE-0008 | `packages/auth` | 6 | discovered | n/a | pendente | pendente | crítico |
| MIG-0010 | pagamentos/assinaturas | Payments | FEATURE-0009 | `packages/payments` | 8 | discovered | pendente | pendente | sandbox pendente | crítico |
| MIG-0011 | afiliados | Affiliates | FEATURE-0010 | `packages/affiliates` | 9 | discovered | pendente | pendente | pendente | crítico |
| MIG-0012 | `js/map*` + bootstrap V1 | Geospatial | FEATURE-0001 | `packages/geospatial` + `apps/morro-digital-platform/src/bootstrap/geospatial.ts` | 4 | equivalent | Mapbox Visual Contract validado nos três viewports, normal e `forced-colors` | Runtime, adapter, Mapbox real, fallback, rollback e lifecycle comprovados | PR #17 head final `2d84629b`; runs `31237633579`, `31237633601`, `31237633577` verdes | crítico |
| MIG-0013 | Home / seletor de roteiros V1 | Core UI / Tours | FEATURE-0007 | `apps/morro-digital-platform/src/browser-entry.ts` | 4 | equivalent | matriz Home v4: loading, map-ready, teclado, contraste e texto ampliado comprovados | troca 8→5→5→8, falhas e offline/provider indisponível comprovados | PRs #19/#17/#20 incorporados; Quality Gate final da matriz `31237787144` verde | alto |
| MIG-0014 | `js/tours/tour-data.js` + `js/i18n/{pt,en,es,he}.js` | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-localization.ts` + fontes editoriais V1 | 4 | equivalent | conteúdo dos 3 roteiros/18 paradas preservado nos quatro idiomas da V1; `photoAlt` estrutural mantido conforme `translateTour()` | chaves, fallback PT/EN, descrições, narrações, dicas, aliases de locale e imutabilidade comprovados | PR #18 head `1d7e4bc9`; Quality Gate `31238742255` verde; testes exigem cobertura integral de chaves EN/ES/HE | alto |
| MIG-0015 | marcadores e centro do mapa da V1 | Geospatial / Tours | FEATURE-0001 | `apps/morro-digital-platform/src/config/tour-markers.ts` + `tour-selection.ts` | 4 | equivalent | rota, source/layers, câmera e 8/5 paradas validados no Mapbox real | substituição atômica, recentralização, troca 8→5→5→8 e rollback comprovados | PR #17 runs Provider `31237633601` e Tour Browser `31237633588` verdes | crítico |
| MIG-0016 | resolvedor `findTourByKeyword` da V1 | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-search.ts` | 4 | equivalent | n/a | aliases, acentos, termos barco/Gamboa, quadriciclo/ATV e retorno seguro preservados | testes automatizados do Runtime M1 + Quality Gates posteriores verdes | médio |

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

### Conteúdo multilíngue dos roteiros — PR #18

Fonte V1 congelada:

```text
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

A auditoria direta confirmou quatro idiomas de tour na V1 (`pt`, `en`, `es`, `he`) e o contrato editorial de cada parada: título, descrição, narração, dicas e `photoAlt` estrutural. A primeira implementação do PR #18 foi corrigida porque omitia hebraico, descrições/narrações/dicas e traduzia `photoAlt` sem correspondência na V1.

Head comprovado antes da atualização documental do tracker:

```text
1d7e4bc9b2496f01d181f4965f58a7186c57fd8d
```

Quality Gate:

```text
Run: 31238742255
Conclusão: success
```

Os testes exigem cobertura integral de todas as chaves editoriais esperadas nos dicionários EN/ES/HE, 3 roteiros/18 paradas em todos os locales, fallback V1, preservação PT, `photoAlt` estrutural, geometria/mídia e imutabilidade.

## Gate da Wave 4 — Runtime + Geospatial + Tours

MIG-0012, MIG-0013, MIG-0014, MIG-0015 e MIG-0016 estão em `equivalent` com evidência automatizada. Isso fecha a equivalência do checkpoint atual da Wave 4; nenhum desses itens deve ser promovido para `released` sem o gate de release/deploy correspondente.

A próxima frente crítica da Wave 4 é **MIG-0005 — Navigation**, ainda em `discovered`. Ela deve iniciar por inventário da V1 e baseline comportamental antes de qualquer refatoração.

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
