# Morro Digital — Runtime M1

Este aplicativo é o primeiro marco executável da Touristic Digital Platform para Morro de São Paulo.

## Escopo atual

- inicialização do destino `morro-de-sao-paulo`;
- Platform Runtime com módulos `geospatial` e `marketplace`;
- Geospatial Engine independente do SDK do provider;
- Mapbox Adapter e driver estrutural para Mapbox GL JS;
- eventos `DestinationLoaded`, `MapInitialized`, `MapReady` e `MapInitializationFailed`;
- shell acessível de desenvolvimento;
- provider visual de desenvolvimento sem credenciais reais;
- servidor HTTP local sem dependências adicionais.

## Executar localmente

Após sincronizar o lockfile do workspace:

```bash
pnpm install
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

## Provider de desenvolvimento

O arquivo `src/development/mapbox-sdk.ts` implementa apenas o contrato estrutural necessário para validar o fluxo do runtime no navegador. Ele não realiza chamadas externas, não carrega mapas reais e não deve ser utilizado em produção.

O entrypoint `src/browser-entry.ts` utiliza valores explícitos de desenvolvimento e não acessa tokens reais.

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
```

O atributo `aria-busy` é aplicado durante a inicialização e removido ao concluir ou falhar.

## Validação mínima antes de merge

```bash
pnpm format:check
pnpm architecture:check
pnpm features:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

O PR deve permanecer como draft enquanto qualquer uma dessas verificações estiver pendente.
