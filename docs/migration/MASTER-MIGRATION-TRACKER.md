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
