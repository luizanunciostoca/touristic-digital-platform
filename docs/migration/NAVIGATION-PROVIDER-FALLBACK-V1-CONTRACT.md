# Navigation — contrato V1 de fallback do provider de mapa

## Objetivo

Congelar a decisão exigida pelo cenário 21 da matriz `MIG-0005`, sem inventar navegação guiada em Leaflet.

## Fonte V1 congelada

```text
luizidebook/morro-de-sao-paulo-digital
60746fd7fed97b805758b37adfdbe3bad2582bfe
```

Evidências auditadas:

- `js/navigation/navigationState/__tests__/navigation-engine-integration-contract.test.js`;
- `js/navigation/navigationController/navigationController.js`;
- `js/map/core/map-controls.js`.

## Contrato observado na V1

A navegação guiada visual é dependente do Mapbox primário. A V1 não define um segundo motor de navegação first-person sobre Leaflet.

O contrato integrado da V1 exige explicitamente que Mapbox e Leaflet não renderizem a mesma rota em sequência e registra que a rota de navegação é desenhada exclusivamente no Mapbox 3D. O controller também condiciona reforço de first-person, câmera e marcador à disponibilidade de `MapboxPrimaryModule` e `isMapboxPrimaryReady()`.

Portanto, quando o provider principal de mapa deixa de estar disponível, a equivalência V1 não autoriza transferir uma sessão guiada ativa para Leaflet. O comportamento seguro e equivalente é encerrar/destruir o runtime específico do Mapbox antes de entrar no fallback cartográfico.

## Contrato V2

O boundary `apps/morro-digital-platform/src/browser-entry.ts` materializa essa decisão:

1. `prepareMapContainerForFallback()` chama `clearBrowserNavigationRuntime()` antes de remover o mapa real e aliases Mapbox;
2. `clearBrowserNavigationRuntime()` executa `activeNavigationRuntimeInstall?.destroy()`;
3. `installBrowserNavigationRuntime()` só é conectado quando `provider.mode === "real"`;
4. o provider Leaflet/development é iniciado sem `onMapCreated` de navegação e sem novo runtime guiado.

## Decisão

`Navigation + Mapbox` possui ownership único da sessão visual/câmera. `Leaflet` permanece fallback cartográfico da Home, não um segundo provider de navegação guiada.

Em uma transição para fallback:

```text
active Mapbox navigation runtime
        ↓ destroy / teardown
Mapbox aliases and map cleared
        ↓
Leaflet/development map fallback
        ↓
no guided navigation runtime installed
```

Essa decisão evita dois renderizadores concorrentes, vazamento de watchers/listeners/câmera e criação de comportamento que não existe na V1 congelada.

## Evidência executável V2

`apps/morro-digital-platform/src/legacy/navigation-provider-fallback-contract.test.ts` congela o boundary atual e falha se:

- fallback deixar de destruir o runtime de navegação antes de desmontar o Mapbox;
- navegação guiada passar a ser instalada em provider diferente de `real` sem uma nova decisão arquitetural e baseline própria.

Com Quality Gate verde, o cenário 21 pode avançar de `PARTIAL` para `PASS`.
