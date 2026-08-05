# Feature Registry

O Feature Registry é a fonte oficial de rastreabilidade entre capacidades de negócio, implementação da V1, destino no monorepo, onda de migração e contratos de equivalência.

## Regras

1. Cada capacidade possui um ID permanente `FEATURE-XXXX`.
2. Nenhuma feature crítica pode ser migrada sem origem V1, destino, testes e baseline.
3. `equivalence.behavior`, `equivalence.visual` e `equivalence.api` só podem ser marcados como `true` com evidência versionada.
4. Features inéditas não exigem equivalência comportamental com a V1, mas exigem contrato, testes, segurança e observabilidade.
5. Mudanças de domínio, onda ou estratégia exigem revisão arquitetural; mudanças irreversíveis exigem ADR.

## Estados

- `planned`: definida, ainda sem inventário.
- `inventory-in-progress`: arquivos, estilos e comportamentos sendo catalogados.
- `baseline-pending`: inventário inicial existe, mas faltam evidências executáveis.
- `migration-ready`: contratos e baselines aprovados.
- `in-migration`: implementação no novo monorepo em andamento.
- `equivalent`: contratos de equivalência aprovados.

O arquivo canônico é `docs/features/registry.json`.
