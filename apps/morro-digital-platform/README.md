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
- conteúdo dos três roteiros localizado em PT-BR, inglês e espanhol;
- projeção das paradas de um roteiro em marcadores geoespaciais;
- shell acessível de desenvolvimento;
- provider visual de desenvolvimento sem credenciais reais;
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

O catálogo estrutural continua sendo a única fonte para identificadores, chaves de tradução, coordenadas, ordem das paradas e caminhos de imagem. Os contratos validam coordenadas, IDs duplicados e ordem sequencial; rotas, paradas, posições e coleções são congeladas para impedir mutações acidentais.

## Conteúdo multilíngue dos roteiros

O arquivo `src/config/tour-localization.ts` adiciona uma camada de conteúdo independente do catálogo geográfico. Os locales suportados são:

```text
pt-BR
en
es
```

A camada fornece, para todos os três roteiros e suas 18 paradas:

- título do roteiro;
- descrição do roteiro;
- duração;
- meio de transporte;
- título de cada parada;
- texto alternativo de cada imagem.

As funções públicas são:

```ts
normalizeTourLocale(locale);
localizeMorroTour(tourId, locale);
getLocalizedMorroTourCatalog(locale);
```

`normalizeTourLocale` reconhece variantes como `en-US`, `en-GB` e `es-AR`; qualquer locale não suportado utiliza `pt-BR` como fallback determinístico.

A localização não duplica geometria nem mídia. `localizeMorroTour` projeta o texto localizado sobre a rota estrutural existente, preservando IDs, ordem, coordenadas, chaves de tradução e `photoPath`. O resultado e a coleção de paradas são imutáveis.

Os testes garantem cobertura completa de PT-BR/EN/ES, equivalência do conteúdo PT-BR com o catálogo atual, preservação de geometria e referências de mídia, fallback de locale e ausência de strings obrigatórias vazias.

A internacionalização do shell completo, seletor visual de idioma, descrições narrativas extensas de cada parada, narrações em áudio e dicas editoriais continuam fora deste incremento e devem permanecer em PRs próprios.

## Marcadores do roteiro inicial

O arquivo `src/config/tour-markers.ts` projeta qualquer roteiro do catálogo em uma coleção imutável de `MapMarker`.

No Runtime M1, o entrypoint carrega as oito paradas do Passeio Volta à Ilha. Cada marcador recebe um identificador namespaced, como `volta-a-ilha:stop-1`, e um rótulo ordenado.

Durante o bootstrap, os marcadores são enviados ao `GeospatialEngine`. O resultado registra a quantidade carregada e publica os identificadores pelo evento `MapMarkersLoaded`.

Quando o provider rejeita os marcadores, o engine é destruído, o evento `MapMarkersLoadFailed` é publicado e o erro original continua sendo propagado.

O arquivo `src/config/map-markers.ts` continua preservado como baseline inicial de pontos compartilhados da V1 enquanto a deduplicação definitiva entre roteiros e pontos de interesse não é concluída.

## Provider de desenvolvimento

O arquivo `src/development/mapbox-sdk.ts` implementa apenas o contrato estrutural necessário para validar o fluxo do runtime no navegador. Ele não realiza chamadas externas, não carrega mapas reais e não deve ser utilizado em produção.

O provider exibe a quantidade de pontos carregados por meio do atributo `data-development-marker-count`. O entrypoint `src/browser-entry.ts` utiliza valores explícitos de desenvolvimento e não acessa tokens reais.

## Configuração do Mapbox real

A integração real deve utilizar um arquivo `.env` local baseado em `.env.example`:

```text
VITE_MAPBOX_ACCESS_TOKEN=
VITE_MAPBOX_STYLE=
VITE_MAPBOX_CONTAINER_ID=map
VITE_MAPBOX_INITIAL_ZOOM=14
```

Regras obrigatórias:

- nunca versionar tokens;
- usar token público restrito por URL;
- aplicar privilégio mínimo;
- preservar o estilo aprovado da V1 durante a equivalência visual;
- manter rollback para a experiência anterior até aprovação formal.

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

## Estado da formatação

Os arquivos apontados pela primeira execução oficial do Quality Gate foram formatados pela mesma versão do Prettier instalada pelo lockfile. O workflow temporário usado exclusivamente para aplicar essa saída foi removido, e o repositório voltou a utilizar somente o `Quality Gate` padrão com permissões de leitura.

Essa correção não substitui a validação oficial: arquitetura, Feature Registry, lint, TypeScript, testes e build continuam dependendo de uma execução completa do GitHub Actions associada ao head atual.

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

O PR deve permanecer como draft enquanto qualquer uma dessas verificações estiver pendente.
