## Control Plane Metadata

> Bootstrap note: until MD-CP-003 merges the deterministic Claim Guard, the executable ChangeSet authority is the matching `.morro/changesets/*.json` manifest. These fields are coordination metadata and must agree with that manifest.

ChangeSet:
Owner:
Base-SHA:
Risk:
Affected-Domains:

## Objetivo

Descreva o problema e o resultado esperado.

## Escopo

- [ ] Aplicação
- [ ] Pacote compartilhado
- [ ] Infraestrutura ou tooling
- [ ] Documentação ou ADR
- [ ] Migração da V1
- [ ] Control Plane / CI

## Preservação e autoridade

- Baseline/fluxo relacionado:
- Owner canônico afetado:
- Evidência visual ou comportamental:
- Divergências intencionais:
- Plano de rollback:

## Impacto arquitetural

- Dependências adicionadas ou alteradas:
- Contratos/APIs/eventos afetados:
- Tenant/destination boundaries afetados:
- ADR necessário: [ ] Não [ ] Sim — link:

## Validação

- [ ] Claim ativo e sem overlap
- [ ] Base-SHA é o current main no momento da prova
- [ ] Formatação
- [ ] Lint
- [ ] Typecheck
- [ ] Testes afetados
- [ ] Build quando aplicável
- [ ] Regras de dependência
- [ ] Segurança revisada
- [ ] Evidência independente
- [ ] Documentação atualizada

## Riscos

Liste riscos técnicos, operacionais, financeiros, segurança, LGPD, providers e regressão.

## Definition of Done

- [ ] Mudança pequena, rastreável e reversível
- [ ] Sem fonte de verdade concorrente
- [ ] CI requerida verde no exact head
- [ ] Evidências vinculadas ao exact head
- [ ] CODEOWNERS revisado quando aplicável
