# Morro Digital Control Center — UX Design V1

## Authority

Visual/behavioral source of truth: **Morro Digital Control Center — Manual UX Design V1** supplied for the Control Center implementation.

This document records the code mapping and qualification rules. It does not replace the manual.

## Canonical surfaces

- Shell: `apps/control-center/public/index.html`
- Existing functional runtime: `apps/control-center/public/control-center.js`
- UX V1 interaction layer: `apps/control-center/public/control-center-ux-v1.js`
- UX V1 tokens/layout: `apps/control-center/public/control-center.css`
- Admin API: `apps/morro-digital-platform/tooling/admin-api.mjs`
- Domain adapters: `apps/morro-digital-platform/tooling/admin-domain-adapters.mjs`

The migration is intentionally incremental. Existing owner-backed domain behavior is preserved; the UX layer does not introduce a second authorization authority.

## Design tokens

The administrative palette follows the manual literally:

| Token               | Value     |
| ------------------- | --------- |
| `--md-bg`           | `#F4F8FC` |
| `--md-surface`      | `#FFFFFF` |
| `--md-text`         | `#0B2447` |
| `--md-text-muted`   | `#60738F` |
| `--md-primary`      | `#0B63CE` |
| `--md-primary-soft` | `#EAF3FF` |
| `--md-success`      | `#10A760` |
| `--md-warning`      | `#D97706` |
| `--md-danger`       | `#D92D20` |
| `--md-purple`       | `#6D5CE8` |
| `--md-border`       | `#DCE6F1` |
| `--md-focus`        | `#2E90FA` |

Base shell measurements are 224 px sidebar, 64 px topbar, 24 px desktop content padding, 12 px card radius and a 4 px spacing base.

## Information architecture

The sidebar is grouped as:

- Principal: Visão Global
- Operação: Visão Geral
- Relacionamentos: Empresas, Usuários, Afiliados
- Comercial: CRM, Produtos, Ofertas
- Reservas: Reservas, Ticketing, Check-in
- Financeiro: Pedidos, Pagamentos, Reembolsos, Comissões
- Controle: Suporte, Auditoria
- Plataforma: Sistema, Integrações, Configurações

Content and Destination administration remain accessible as existing platform capabilities while the canonical navigation is reconciled. Their presence must not change destination ownership or authorization boundaries.

## Destination-first behavior

The topbar contains a persistent destination selector and an explicit Global scope.

Rules:

1. `global` consolidates safe read projections.
2. Destination scope is persisted only in browser session storage.
3. Business, CRM, Products, Reservations, Content and Affiliates propagate or resolve `destinationId` only through owner/domain-backed contracts.
4. Business profiles expose an explicit canonical `destinationId`; CRM leads persist their own explicit `destinationId`; neither relationship is inferred from labels, addresses or membership text.
5. Universal Search propagates the selected destination into domain search adapters.
6. Affiliates are platform entities. Destination is an assignment; no company ownership relationship is created.
7. Legacy or future records without a canonical destination stay visibly unassigned and fail closed in destination-scoped views.

## Home

The UX V1 layer renders:

- greeting + operational summary + date/status;
- five KPI cards: Empresas, Afiliados, Reservas Hoje, Receita Hoje, Alertas;
- “Precisa da sua atenção” queue from real health/module state;
- “Resumo por destino” drill-down;
- recent administrative activity from append-only audit;
- the canonical Affiliate model explanatory card.

Product override: the approved Control Center does not expose a floating Assistant shortcut or a Quick Actions block. Operational actions remain inside their contextual modules and command/search flows.

Metrics are never fabricated. A missing owner aggregate is rendered as unavailable/partial rather than replaced by demo numbers.

## Universal Search

- Ctrl/Cmd + K focuses the field.
- Escape closes results.
- Arrow Up/Down navigate available results.
- Enter opens the active result.
- Search requests carry destination scope where available.
- Backend authorization remains authoritative.

## 360 pattern

Reusable 360 headings/tabs are applied to:

- Business: Resumo, Perfil, Usuários, Produtos, Ofertas, Reservas, Financeiro, CRM, Histórico, Auditoria.
- Affiliate: Resumo, Perfil, Destinos, Atribuições, Conversões, Comissões, Histórico, Auditoria.
- User: Resumo, Conta, Permissões, Empresas, Sessões, Histórico, Auditoria.

The existing owner-backed detail renderers remain the data source.

## Support Mode and critical actions

Support Mode continues to preserve actor and effective user separately. Critical mutations remain server-authorized and keep the existing step-up, reason, confirmation and audit requirements.

The UX layer may hide or contextualize actions, but hidden UI is never treated as authorization.

## Responsive behavior

Qualification targets:

- 1440 × 900
- 1280 × 800
- 1024 × 768
- 768 × 1024
- 390 × 844

Desktop keeps the expanded operational shell. Tablet collapses/reflows content. Mobile uses a drawer and responsive table-to-card treatment where safe.

## Accessibility

Baseline: WCAG 2.2 AA for primary flows.

Implemented contracts include semantic controls, visible focus, keyboard search navigation, Escape handling, reduced motion, live status regions from the existing runtime, and responsive touch surfaces.

## Safety invariant

The Control Center UI is not an authority. Every mutation must remain authorized by the backend capability and owner-domain contract.

No UX work in this wave authorizes production refunds, payouts, destructive migrations, secret changes or irreversible production deployment.

## Qualification

Static contract:
`apps/morro-digital-platform/src/ux/control-center-ux-v1-contract.test.ts`

Browser qualification must continue to prove login, dashboard, search, destination context, Business/Affiliate/User detail, Support Mode, critical actions, accessibility and responsive no-overflow behavior.

Visual regression baselines are captured by the Control Center browser contract at 1440, 1280, 1024, 768 and 390 px. Final UX certification requires those artifacts, the accessibility report and all mandatory CI checks to come from the exact candidate head.
