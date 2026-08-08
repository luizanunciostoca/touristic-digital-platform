# Navigation V1 Executable Baseline — NAV-15

## Finalidade

Este checkpoint transforma parte da baseline histórica de `MIG-0005 / FEATURE-0003` em evidência executável no monorepo V2.

A fonte permanece congelada em:

```text
repository: luizidebook/morro-de-sao-paulo-digital
commit: 60746fd7fed97b805758b37adfdbe3bad2582bfe
```

Este documento não altera o estado oficial de `MIG-0005`, que permanece `mapped`.

## Proveniência congelada

### Geometry runtime V1

```text
path: js/navigation/navigationState/navigation-route-geometry.js
blob: 90d7b9a24c83f9bb3c9fbbefd853df46107f904f
```

### Geometry tests V1

```text
path: js/navigation/navigationState/__tests__/navigation-route-geometry.test.js
blob: f700c954cb791987c0fd124491bd0885e75f8e1c
```

### Session runtime V1

```text
path: js/navigation/navigationState/navigationSessionManager.js
blob: 1d769afad37efb349f629fceac0a483ca92fae45
```

### Session contract tests V1

```text
path: js/navigation/navigationState/__tests__/navigation-session-contract.test.js
blob: 4df4fd6fe7924198a0139e3ba44e62540fa8e167
```

## Fixtures geométricas executáveis

`packages/navigation/src/v1-baseline-fixtures.ts` congela os valores observados diretamente no teste V1 auditado.

`packages/navigation/src/v1-baseline-parity.test.ts` executa esses mesmos vetores contra a implementação atual de `@touristic/navigation`.

A paridade coberta neste checkpoint inclui:

1. derivação de distância e duração quando o resumo da API está ausente;
2. preservação de distância e duração oficiais da rota;
3. distância e duração restantes proporcionais;
4. distância até a próxima manobra;
5. bearing leste no início da rota;
6. progresso aproximado de 50% no ponto intermediário;
7. mudança de bearing pela tangente local ao contornar uma curva;
8. limitação de regressão de progresso causada por jitter de GPS;
9. bearing norte igual a zero como valor válido;
10. formatação V1 de distância e duração (`1.3 km`, `1h 1min`).

## O que esta evidência comprova

Os vetores centrais do teste `navigation-route-geometry.test.js` da V1 congelada possuem uma prova executável explícita contra a V2, com rastreabilidade até commit e blobs da fonte auditada.

A suíte existente de `packages/navigation/src/geometry.test.ts` já cobria os mesmos comportamentos. O NAV-15 adiciona proveniência formal para impedir que essa equivalência dependa apenas de semelhança implícita entre testes.

## O que ainda não está comprovado

Este checkpoint não satisfaz sozinho o critério `snapshotted` de MIG-0005. Permanecem obrigatórios:

- fixtures executáveis de routing e erros;
- sequência congelada de eventos da V1;
- health/state snapshots;
- contratos executáveis de sessão/supersession além da proveniência já registrada;
- geolocation e watcher races;
- chegada e recálculo;
- fallback de routing;
- screenshots determinísticos de banner e botão Encerrar;
- evidência dinâmica de câmera/first-person;
- minimize/maximize;
- contraste forçado, texto ampliado e matriz mobile/tablet/desktop.

## Regra de avanço

`MIG-0005` só poderá sair de `mapped` quando os requisitos formais definidos em `NAVIGATION-V1-BASELINE.md` forem atendidos. A existência desta fixture não autoriza promover o estado isoladamente.
