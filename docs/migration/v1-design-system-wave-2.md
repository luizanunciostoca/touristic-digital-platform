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

### DS-01 — Preservação

- copiar os estilos ativos mantendo estrutura e conteúdo;
- registrar caminho, ref e SHA de origem;
- criar `legacy/manifest.json`;
- proibir remoções automáticas.

### DS-02 — Baselines visuais

Capturar, no mínimo:

- 390 × 844 — smartphone;
- 768 × 1024 — tablet;
- 1440 × 900 — desktop.

Estados obrigatórios:

- carregamento;
- home e mapa;
- assistente fechado e aberto;
- submenu e cards;
- carrossel;
- popup do mapa;
- navegação ativa;
- geolocalização negada;
- modo offline e erro;
- contraste forçado e navegação por teclado.

### DS-03 — Tokens

Extrair em paralelo, sem substituir imediatamente o legado:

```text
packages/design-system/src/tokens/
├── colors.ts
├── typography.ts
├── spacing.ts
├── radii.ts
├── shadows.ts
├── breakpoints.ts
├── z-index.ts
└── motion.ts
```

### DS-04 — Componente piloto

Migrar primeiro um componente de baixo risco. O candidato inicial será `Button`, incluindo estados default, hover, focus-visible, active, disabled e loading.

## Gates de aceite

- inventário e manifest válidos;
- todos os arquivos ativos rastreados;
- baseline visual disponível em três viewports;
- nenhum desvio visual não documentado;
- acessibilidade preservada;
- Quality Gate verde;
- rollback para CSS legado testado.

## Lacunas ainda abertas

A análise integral de seletores, duplicações, especificidade e estilos injetados por JavaScript depende da execução do inventário em um workspace que contenha um checkout completo da V1. O inventário atual é fiel ao grafo ativo observado em `index.html` e `css/main.css`, mas não declara cobertura de arquivos CSS órfãos ou dinamicamente carregados.
