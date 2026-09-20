# Chat 6 — CSS Modernization + Premium UX

## Baseline reconciliado

- Repositório: `luizanunciostoca/touristic-digital-platform`
- GitHub LIVE `main` no início desta tranche: `9694964d9e7d02aaceab1499c64e61099e982dcb`
- Design System V2 foundations: PR #102, merge `b4437eae59488b040b70e92b78672a936a813f73`
- Branch: `wave/css-modernization-ux-premium-20260920`
- A branch foi confirmada como idêntica ao `main` antes da primeira alteração.

## Limite de preservação

`apps/morro-digital-platform/public/legacy/**` é evidência histórica da V1 e **não é editado** por esta wave.

A modernização é progressiva. Enquanto regras históricas não forem migradas, o runtime pode usar uma ponte de compatibilidade pós-legacy. Essa ponte fica explicitamente separada das novas cascade layers para não fingir que dívida antiga já foi removida.

## Arquitetura CSS V2

O novo `premium-ux-v2.css` declara a ordem canônica:

`reset → vendor → legacy → tokens → base → components → features → utilities → overrides`

A aplicação atual ainda possui CSS histórico não-layered. Em CSS, regras normais não-layered têm precedência sobre regras normais dentro de named layers; por isso a compatibilidade que precisa vencer a V1 permanece temporariamente não-layered e documentada no final do arquivo.

Próximas migrações devem mover superfícies uma a uma para as layers e reduzir essa ponte, nunca duplicá-la.

## Modos de experiência

O Chat 6 formaliza um atributo somente de apresentação: `body[data-md-mode]`.

Valores: `discover`, `place`, `navigation`, `tour`, `commerce`, `assistant`.

### Autoridade dos sinais

- NAVIGATION: `body.navigation-active`
- TOUR imersivo: `#map[data-active-tour]` / `data-tour-state` / `data-tour-flow-stage`
- PLACE: `#map[data-explore-stage="detail"]`
- ASSISTANT: `body.assistant-modal-open`
- COMMERCE: superfícies standalone de Commerce
- DISCOVER: fallback

Precedência na Home: `NAVIGATION > TOUR > PLACE > COMMERCE > ASSISTANT > DISCOVER`.

Importante: `body.tour-active` pertence ao tutorial público de onboarding e não é autoridade para o modo TOUR imersivo.

## Bottom sheet

O primitivo `.md-bottom-sheet` passa a aceitar `data-sheet-state="peek"`, `data-sheet-state="half"` e `data-sheet-state="full"`.

Os estados usam `dvh`, respeitam reduced motion e podem ser aplicados progressivamente a Place, Search, Tour e preview de Commerce sem exigir migração global imediata.

## Dívida reduzida nesta tranche

- os dois consumidores não-legados de `var(--transition)` em Explore deixam de animar `all`;
- a ponte pós-legacy restringe propriedades animadas de controles e voice selector;
- modos NAVIGATION e TOUR podem retirar controles concorrentes sem alterar seus estados funcionais;
- novas regras usam tokens do Design System V2;
- nenhuma regra histórica é reescrita.

## Dívida remanescente

Ainda existem, principalmente dentro do snapshot V1 preservado: `transition: all`, z-indexes históricos extremos, hardcoded colors, múltiplas escalas de espaçamento/radius, `!important` necessários a contratos históricos e integrações Mapbox/Leaflet, breakpoints duplicados e superfícies ainda não migradas para cascade layers.

Esses itens devem ser removidos por superfície, sempre acompanhados por regressão visual e browser contract. Não fazer busca-e-substituição global.

## Gate desta tranche

Antes de merge:

1. branch reconciliada com o `main` corrente;
2. formatting;
3. lint;
4. typecheck;
5. unit tests;
6. build;
7. browser regressions afetadas;
8. visual regression afetada;
9. revisão de diff para confirmar zero alterações em `public/legacy/**`;
10. CI exact-head verde.
