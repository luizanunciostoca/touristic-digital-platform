# Morro Digital — Runtime M1

Este aplicativo é o primeiro marco executável da Touristic Digital Platform para Morro de São Paulo.

## Escopo atual

- inicialização do destino `morro-de-sao-paulo`;
- Platform Runtime integrado ao pacote `@touristic/core`;
- módulos `geospatial` e `marketplace` com dependências validadas;
- Geospatial Engine independente do SDK do provider;
- Mapbox Adapter e driver estrutural para Mapbox GL JS;
- eventos `DestinationLoaded`, `MapInitialized`, `MapReady` e `MapInitializationFailed`;
- eventos `MapMarkersLoaded` e `MapMarkersLoadFailed`;
- catálogo estrutural dos três roteiros da V1;
- conteúdo editorial dos três roteiros preservado em PT-BR, inglês, espanhol e hebraico;
- projeção das paradas de um roteiro em marcadores geoespaciais;
- shell V1 reproduzido sobre o Runtime V2;
- Mapbox GL JS real com Leaflet como fallback/rollback;
- servidor HTTP local sem dependências adicionais.

## Executar localmente

```bash
pnpm install --frozen-lockfile
pnpm --filter @touristic/morro-digital-platform dev
```

O comando executa o build completo do monorepo e inicia o ambiente em:

```text
http://127.0.0.1:4173
```

A porta pode ser alterada por variável de ambiente:

```bash
PORT=4300 pnpm --filter @touristic/morro-digital-platform dev
```

## Limite arquitetural do Runtime

Os contratos `EventBus`, `ModuleRegistry`, `PlatformModule` e `PlatformRuntime` pertencem ao núcleo da plataforma e são exportados por `@touristic/core`.

Essa decisão elimina um workspace intermediário sem dependências próprias, preserva a separação lógica em `packages/core/src/runtime.ts` e mantém o lockfile existente compatível com o aplicativo.

## Catálogo estrutural de roteiros da V1

O arquivo `src/config/tour-catalog.ts` preserva a estrutura dos três roteiros existentes em `js/tours/tour-data.js`:

- Passeio Volta à Ilha: 8 paradas;
- Trilha Ecológica para a Gamboa: 5 paradas;
- Expedição de Quadriciclo: 5 paradas.

O catálogo continua sendo a fonte de identificadores, títulos/fallbacks PT, chaves de tradução dos títulos, duração, transporte, coordenadas, caminhos de imagem e `photoAlt`. Os contratos validam coordenadas, IDs duplicados e ordem sequencial das paradas. Rotas, paradas, posições e coleções são congeladas para impedir mutações acidentais.

## Conteúdo multilíngue dos roteiros

A equivalência editorial é baseada exclusivamente no snapshot V1 `60746fd7fed97b805758b37adfdbe3bad2582bfe`.

`src/config/tour-editorial-source.ts` preserva, para as 18 paradas, as chaves e fallbacks PT-BR de:

- descrição;
- narração;
- dicas.

Os dicionários `tour-translations-en.ts`, `tour-translations-es.ts` e `tour-translations-he.ts` preservam as traduções existentes na V1. `tour-localization.ts` projeta esses textos sobre o catálogo estrutural sem duplicar geometria ou mídia.

Locales suportados:

```text
pt-BR
en
es
he
```

A normalização reconhece variantes de navegador (`pt-*`, `en-*`, `es-*`, `he-*`) e o código legado `iw` para hebraico. Sem locale explícito, o padrão permanece PT-BR. Para um locale não suportado, a resolução segue o comportamento de `getGeneralText` da V1: tenta inglês antes do fallback PT-BR.

Cada parada localizada contém título, descrição, narração e dicas, mantendo também suas chaves V1. O `photoAlt` não é traduzido nessa camada porque `translateTour()` da V1 não o passa por `getGeneralText`; o valor estrutural em português é preservado para evitar inventar conteúdo que não existia na fonte.

Os testes exigem:

- os 3 roteiros e as 18 paradas em todos os quatro locales;
- cobertura integral das chaves esperadas nos dicionários EN/ES/HE;
- valores V1 fixados para traduções que divergiam na primeira versão do PR;
- fallback PT-BR byte a byte;
- fallback inglês para locale desconhecido;
- `photoAlt` estrutural inalterado;
- geometria, ordem e `photoPath` idênticos entre locales;
- objetos e coleções imutáveis.

A internacionalização visual do shell/seletor de idioma continua separada deste incremento; este checkpoint entrega a fonte editorial tipada e equivalente para os roteiros.

## Marcadores do roteiro inicial

O arquivo `src/config/tour-markers.ts` projeta qualquer roteiro do catálogo em uma coleção imutável de `MapMarker`.

No Runtime M1, o entrypoint carrega as oito paradas do Passeio Volta à Ilha. Cada marcador recebe um identificador namespaced, como `volta-a-ilha:stop-1`, e um rótulo ordenado.

Durante o bootstrap, os marcadores são enviados ao `GeospatialEngine`. O resultado registra a quantidade carregada e publica os identificadores pelo evento `MapMarkersLoaded`.

Quando o provider rejeita os marcadores, o engine é destruído, o evento `MapMarkersLoadFailed` é publicado e o erro original continua sendo propagado.

O arquivo `src/config/map-markers.ts` continua preservado como baseline inicial de pontos compartilhados da V1 enquanto a deduplicação definitiva entre roteiros e pontos de interesse não é concluída.

## Mapbox real e fallback

O browser runtime carrega Mapbox GL JS `3.12.0` quando existe token público configurado e preserva Leaflet como fallback quando o token não existe, o SDK não carrega ou a inicialização real falha.

A configuração pública é injetada por `/runtime-config.js`. Nenhuma credencial deve ser versionada.

Exemplo local baseado em `.env.example`:

```text
VITE_MAPBOX_ACCESS_TOKEN=
VITE_MAPBOX_STYLE=mapbox://styles/mapbox/streets-v12
VITE_MAPBOX_CONTAINER_ID=map
VITE_MAPBOX_INITIAL_ZOOM=13.5
```

Regras obrigatórias:

- nunca versionar tokens;
- usar token público restrito por URL;
- aplicar privilégio mínimo;
- preservar o contrato de style/câmera/rota da V1;
- manter rollback Leaflet funcional.

## Estados visuais

O container do mapa recebe atributos de estado:

```text
data-map-state="initializing"
data-map-state="ready"
data-map-state="error"
data-map-provider="mapbox"
data-map-marker-count="8"
```

O atributo `aria-busy` é aplicado durante a inicialização e removido ao concluir ou falhar.

## Validação mínima antes de merge

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Nenhum incremento deve ser consolidado sem Quality Gate verde no head final.
