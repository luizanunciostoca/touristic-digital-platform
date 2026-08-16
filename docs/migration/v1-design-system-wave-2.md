# Wave 2 — Design System da V1

## Objetivo

Preservar integralmente a linguagem visual ativa da V1, transformar seus estilos em uma baseline verificável e, somente depois, generalizar tokens e componentes para a Touristic Digital Platform.

## Evidência inicial

A aplicação pública carrega `css/main.css` a partir de `index.html`. Esse entry point importa 34 folhas de estilo locais organizadas em base, layout, botões, mapa, marcadores, navegação, assistente, tour, UI geral, vendor e responsividade.

A V1 também depende visualmente de Leaflet, Mapbox GL JS, Awesomplete, Font Awesome, Google Fonts/Poppins, Swiper e Weather Icons.

O inventário inicial está em:

```text
docs/migration/generated/v1-design-system-inventory.json
```

## Etapas

### DS-01 — Preservação — concluída

- os 35 arquivos CSS ativos do checkpoint V1 permanecem preservados byte a byte em `apps/morro-digital-platform/public/legacy/css`;
- `apps/morro-digital-platform/src/legacy/v1-style-snapshot.test.ts` fixa o commit V1 e o Git blob SHA de cada arquivo;
- nenhuma regra, seletor, especificidade ou `!important` foi refatorado para fechar FEATURE-0007.

### DS-02 — Baselines visuais — concluída para a superfície V1 migrada

O manifest visual v4 cobre mobile, tablet e desktop e registra os estados determinísticos, contratos visuais e fallbacks aplicáveis. A jornada Home de `FEATURE-0007` / `MIG-0013` está `equivalent`.

### DS-03 — Tokens — concluída sem substituição do legado

Os tokens V1 são expostos por `packages/design-system/src/tokens/v1.ts` a partir da fonte congelada:

```text
luizidebook/morro-de-sao-paulo-digital
commit 60746fd7fed97b805758b37adfdbe3bad2582bfe
css/base/variables.css
git blob 8686e390ef14db5de3dd84f6394f0c896160ff42
```

A extração é aditiva. O export público anterior `tokens` permanece inalterado para compatibilidade; o contrato canônico V1 entra como `v1Tokens`, `v1CssVariables` e `V1_DESIGN_TOKEN_SOURCE`. O CSS legado continua sendo o fallback/runtime ativo, portanto a canonicalização não produz alteração visual por si só.

### DS-04 — Componentes — evidência existente suficiente para equivalência V1

O pacote já contém contratos e renderers Core UI para App Shell, Header, Navigation, Modal, Action e Feedback, com testes próprios. A equivalência visual/comportamental do shell Home não depende de uma substituição estética adicional do CSS legado e não exige refatorar um Button apenas para encerrar a Wave 2.

## Gates de aceite

- inventário do grafo CSS ativo disponível;
- 35 arquivos ativos preservados e hash-pinned;
- baseline visual disponível nos três viewports obrigatórios;
- nenhum desvio visual introduzido pela extração de tokens;
- acessibilidade e fallbacks da Home preservados;
- token contract automatizado contra o arquivo V1 preservado;
- API anterior do pacote preservada;
- Quality Gate obrigatório antes de promoção;
- rollback continua sendo o CSS legado já preservado e utilizado pelo runtime.

## Reconciliação final de FEATURE-0007

O gap residual não era uma ausência funcional na Home nem uma necessidade de redesenho. Era a combinação de:

1. `MIG-0003` ainda marcado como `mapped`;
2. ausência de `packages/design-system/src/tokens` canônico para `css/base/variables.css`;
3. Feature Registry ainda em `inventory-in-progress` apesar de `MIG-0001`, `MIG-0002`, `MIG-0013`, `MIG-0014` e `MIG-0016` já terem evidência equivalente.

A lacuna de análise de CSS órfão/dinamicamente carregado permanece registrada como limitação do inventário inicial, mas não invalida a equivalência do grafo ativo congelado que alimenta a V1 e está coberto pelo snapshot e pelos contratos visuais. Qualquer expansão futura do Design System continua sujeita a novos gates e não altera retroativamente esta declaração de equivalência V1.
