# Master Migration Tracker

## Finalidade

Este arquivo é a fonte de acompanhamento da migração V1 → Touristic Digital Platform. Cada item deve manter rastreabilidade entre origem, domínio, destino, equivalência, testes, riscos e rollback.

## Estados oficiais

`discovered` → `mapped` → `snapshotted` → `migrating` → `equivalent` → `released`

Um item não pode avançar para `equivalent` sem evidência visual ou comportamental aplicável, teste automatizado e caminho de rollback.

## Tracker inicial

| ID | Origem V1 | Domínio | Feature | Destino V2 | Wave | Estado | Visual | Comportamental | Testes | Risco |
|---|---|---|---|---|---:|---|---|---|---|---|
| MIG-0001 | `index.html` | Core UI | FEATURE-0007 | `apps/morro-digital-platform` | 3 | mapped | pendente | pendente | pendente | alto |
| MIG-0002 | `css/main.css` | Design System | FEATURE-0007 | `packages/design-system/src/legacy` | 2 | mapped | pendente | n/a | snapshot pendente | alto |
| MIG-0003 | `css/base/variables.css` | Design System | FEATURE-0007 | `packages/design-system/src/tokens` | 2 | mapped | pendente | n/a | pendente | médio |
| MIG-0004 | `js/map*` | Geospatial | FEATURE-0001 | `packages/geospatial` | 4 | discovered | pendente | pendente | pendente | crítico |
| MIG-0005 | `js/navigation*` | Navigation | FEATURE-0003 | `packages/geospatial/navigation` | 4 | discovered | pendente | pendente | pendente | crítico |
| MIG-0006 | `js/assistant*` | Assistant | FEATURE-0004 | `packages/assistant` | 11 | discovered | pendente | pendente | pendente | alto |
| MIG-0007 | Business Portal | Business | FEATURE-0005 | `apps/business-portal` | 6 | discovered | pendente | pendente | pendente | alto |
| MIG-0008 | CRM V1 | CRM | FEATURE-0006 | `apps/admin-crm` | 7 | discovered | pendente | pendente | pendente | alto |
| MIG-0009 | autenticação e sessão | Auth | FEATURE-0008 | `packages/auth` | 6 | discovered | n/a | pendente | pendente | crítico |
| MIG-0010 | pagamentos/assinaturas | Payments | FEATURE-0009 | `packages/payments` | 8 | discovered | pendente | pendente | sandbox pendente | crítico |
| MIG-0011 | afiliados | Affiliates | FEATURE-0010 | `packages/affiliates` | 9 | discovered | pendente | pendente | pendente | crítico |
| MIG-0012 | `js/map*` + bootstrap V1 | Geospatial | FEATURE-0001 | `packages/geospatial` + `apps/morro-digital-platform/src/bootstrap/geospatial.ts` | 4 | migrating | equivalência V1 × V2 pendente | Runtime, adapter, rollback e lifecycle automatizados | Quality Gate #134 verde no head `15e5f79` | crítico |
| MIG-0013 | Home / seletor de roteiros V1 | Core UI / Tours | FEATURE-0007 | `apps/morro-digital-platform/src/browser-entry.ts` | 4 | migrating | desktop/tablet/mobile pendentes | troca de roteiro e rollback automatizados | Quality Gate #134 verde no head `15e5f79` | alto |
| MIG-0014 | `js/tours/tour-data.js` | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-catalog.ts` | 4 | migrating | conteúdo visual pendente | 3 roteiros / 18 paradas estruturais validados | Quality Gate #134 verde; conteúdo multilíngue completo pendente | alto |
| MIG-0015 | marcadores e centro do mapa da V1 | Geospatial / Tours | FEATURE-0001 | `apps/morro-digital-platform/src/config/tour-markers.ts` + `tour-selection.ts` | 4 | migrating | troca de roteiro pendente em navegador real | substituição atômica, recentralização e rollback automatizados | Quality Gate #134 verde no head `15e5f79` | crítico |
| MIG-0016 | resolvedor `findTourByKeyword` da V1 | Tours | FEATURE-0007 | `apps/morro-digital-platform/src/config/tour-search.ts` | 4 | migrating | n/a | aliases, acentos e exceções compatíveis automatizados | Quality Gate #134 verde no head `15e5f79` | médio |

## Evidência de validação — Runtime + Geospatial + Tour Switching M1

O PR #8 foi incorporado à `main` com o escopo congelado em Platform Runtime + Geospatial Engine + Tour Switching M1.

Head final validado:

```text
15e5f79ab2f9de4c578cb07f756ebac124b3f21c
```

Merge commit:

```text
6e6b375455aea76c122855bd846a80f01b113b28
```

Quality Gate mais recente observado no mesmo head:

```text
Quality Gate #134
Run ID: 31132067444
Conclusão: success
```

Etapas aprovadas pelo workflow oficial:

- `pnpm install --frozen-lockfile`;
- `pnpm format:check`;
- `pnpm architecture:check`;
- `pnpm features:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm test`;
- `pnpm build`.

A validação automatizada não substitui a equivalência visual/comportamental. Por isso MIG-0012 a MIG-0016 permanecem em `migrating` até a execução e aprovação da matriz V1 × V2 aplicável.

## Pendências para equivalência

Para MIG-0012 a MIG-0016 avançarem para `equivalent`, registrar evidência aplicável para:

- desktop;
- tablet;
- celular;
- carregamento;
- mapa pronto;
- falha do provider;
- troca entre roteiros de 5 e 8 paradas;
- navegação por teclado;
- leitor de tela;
- contraste;
- textos ampliados;
- modo offline ou provider indisponível;
- rollback para a experiência V1.

Cada evidência visual deve conter screenshot V1, screenshot V2, diferença observada, decisão (`preservar`, `corrigir` ou `melhorar`), responsável e status.

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

A Wave 3 só será concluída quando App Shell, Header, navegação, overlays, modais, loaders, cards, inputs e botões possuírem contrato público, estados acessíveis, teste automatizado, baseline visual e integração sem dependência direta de providers externos.
