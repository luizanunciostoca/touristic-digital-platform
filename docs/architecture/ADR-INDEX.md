# Architecture Decision Index (ADI)

## Objetivo

Manter um índice oficial das decisões arquiteturais da Touristic Digital Platform, com status, escopo, impacto e rastreabilidade.

## Status permitidos

- `proposed`
- `accepted`
- `superseded`
- `deprecated`

## Índice

| ADR | Título | Status | Domínios impactados | Implementação relacionada |
| --- | --- | --- | --- | --- |
| ADR-0001 | Limites arquiteturais e dependências | accepted | Core, Shared, Design System, Geospatial | `tooling/architecture/check-dependencies.mjs` |
| ADR-0002 | Estratégia multi-destino | accepted | Destination, Core, Apps | `docs/product-architecture/MULTI-DESTINATION-STRATEGY.md` |
| ADR-0003 | Estratégia de provedores geoespaciais | accepted | Geospatial, Navigation | `packages/geospatial` |

## Governança

1. Toda nova decisão estrutural deve criar ou atualizar um ADR.
2. O status do ADR deve ser atualizado quando a decisão for substituída ou descontinuada.
3. Cada ADR deve apontar para o código, PR, documentação e testes relacionados.
4. Nenhum ADR aceito pode ser removido; decisões substituídas permanecem como histórico.
5. O índice deve ser revisado em cada release candidate.

## Critérios para novo ADR

Um ADR é obrigatório quando uma mudança:

- altera limites entre domínios;
- introduz dependência estrutural;
- troca provedor crítico;
- muda estratégia de persistência, segurança, autenticação ou observabilidade;
- afeta múltiplos destinos;
- cria política de compatibilidade ou migração;
- modifica contratos públicos de pacotes.
