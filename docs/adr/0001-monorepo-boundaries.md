# ADR-0001 — Fronteiras de dependência do monorepo

- Status: Accepted
- Data: 2026-08-05

## Contexto

A plataforma precisa evoluir a V1 para múltiplos destinos sem criar aplicações duplicadas, ciclos de dependência ou acoplamento entre produtos executáveis e capacidades reutilizáveis.

## Decisão

1. `apps/*` compõem produtos executáveis e podem consumir `packages/*`.
2. `packages/*` nunca podem depender de `apps/*`.
3. `services/*` podem consumir contratos de `packages/*`, mas não código de interface de `apps/*`.
4. `packages/core` não possui dependências internas.
5. `packages/shared` contém somente primitivas agnósticas de domínio.
6. Acesso entre workspaces ocorre por exports públicos e nomes `@touristic/*`, nunca por caminhos relativos atravessando fronteiras.
7. O quality gate deve bloquear violações automaticamente.

## Alternativas consideradas

- Repositórios separados por aplicação: rejeitado pelo risco de divergência e duplicação.
- Monólito sem fronteiras automatizadas: rejeitado pelo alto risco de acoplamento progressivo.

## Consequências

### Positivas

- Reutilização controlada entre destinos.
- Impacto de mudanças mais previsível.
- Migração gradual da V1 por capacidade.

### Negativas

- Algumas mudanças exigirão contratos ou adapters explícitos.
- O CI ficará mais rigoroso.

## Preservação da V1

As fronteiras reorganizam o código, mas não autorizam alterar comportamento, CSS, fluxos ou integrações da V1 sem contrato de equivalência.

## Rollback

Uma migração de módulo pode retornar ao adapter legado sem reverter a estrutura inteira do monorepo.
