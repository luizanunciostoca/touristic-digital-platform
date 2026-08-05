# V1 Legacy Style Preservation

Esta área receberá cópias verificadas dos estilos da V1 antes de qualquer refatoração.

## Regras obrigatórias

1. Cada arquivo preservado deve registrar repositório, caminho, ref e SHA de origem.
2. A primeira cópia deve permanecer semanticamente idêntica à V1.
3. Renomear seletores, eliminar regras, alterar especificidade ou remover `!important` exige baseline visual e contrato de equivalência.
4. Overrides de Mapbox, Leaflet, Swiper, Font Awesome, Awesomplete e Weather Icons permanecem isolados e rastreáveis.
5. Tokens modernos serão introduzidos em paralelo; não substituirão automaticamente valores legados.
6. A remoção de qualquer arquivo exige ADR, testes de regressão e rollback documentado.

## Estrutura planejada

```text
legacy/
├── manifest.json
├── base/
├── layout/
├── components/
├── navigation/
└── vendor/
```

O `manifest.json` vinculará cada arquivo ao SHA original, features, telas, baselines e estado de migração.
