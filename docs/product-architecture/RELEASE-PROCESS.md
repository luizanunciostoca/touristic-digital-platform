# Release Process — Touristic Digital Platform

## 1. Objetivo

Definir um processo previsível, seguro e auditável para lançar alterações em aplicações, APIs, eventos, configurações e infraestrutura.

## 2. Tipos de release

- **Patch:** correção compatível, sem mudança de contrato.
- **Minor:** capacidade compatível, protegida por contrato e feature flag quando necessário.
- **Major:** mudança incompatível, nova versão de API/evento/configuração e plano de migração.
- **Hotfix:** correção urgente de produção, com escopo mínimo e revisão posterior obrigatória.

## 3. Fluxo oficial

```text
Development
→ Pull Request
→ Quality Gate
→ Release Candidate
→ Staging
→ Go/No-Go
→ Progressive Rollout
→ Production
→ Post-release Review
```

## 4. Pull Request

Todo PR deve incluir:

- Feature/Capability IDs;
- impacto na V1 e multi-destino;
- contratos e ADRs afetados;
- testes executados;
- segurança e LGPD;
- observabilidade;
- migração e rollback;
- screenshots ou evidências quando aplicável.

## 5. Quality Gate

Obrigatório:

- frozen install;
- format check;
- architecture check;
- lint;
- typecheck;
- testes unitários e de integração;
- build;
- segurança de dependências e segredos;
- E2E e regressão visual/comportamental para fluxos críticos.

## 6. Release Candidate

A RC deve possuir versão imutável, changelog, imagem/artefato identificável, migrações de banco revisadas, configuração validada e observabilidade pronta.

## 7. Staging

Staging deve reproduzir produção quanto a topologia, políticas e integrações em modo seguro. Pagamentos usam sandbox. Dados pessoais reais não devem ser copiados sem base legal e proteção adequada.

## 8. Go/No-Go

Critérios de GO:

- gates verdes;
- riscos conhecidos aceitos;
- rollback testado;
- responsável de plantão definido;
- dashboards e alertas ativos;
- backups e migrações verificados;
- comunicação preparada.

## 9. Rollout progressivo

Preferência:

1. ambiente interno;
2. percentual pequeno;
3. um destino ou tenant controlado;
4. expansão gradual;
5. disponibilidade geral.

Feature flags devem permitir interromper exposição sem novo deploy quando tecnicamente adequado.

## 10. Rollback

Rollback deve considerar código, configuração, banco, filas, caches, eventos e integrações. Migrações destrutivas exigem estratégia expand/contract e não podem depender de downgrade impossível.

## 11. Hotfix

Hotfix exige:

- incidente ou risco claro;
- mudança mínima;
- testes direcionados;
- aprovação rápida autorizada;
- monitoramento intensivo;
- revisão e documentação posterior.

## 12. Pós-release

Nas primeiras janelas definidas devem ser revisados:

- erros e latência;
- conversão e jornadas críticas;
- filas e webhooks;
- pagamentos e reconciliação;
- reservas;
- consumo de providers GIS/IA;
- feedback e regressões.

## 13. Changelog e depreciação

Toda release informa mudanças, riscos, migração e incompatibilidades. Depreciações possuem alternativa, prazo, telemetria de uso e comunicação.

## 14. Incidente de release

Falha relevante abre incidente com timeline, impacto por destino/tenant, mitigação, causa raiz e ações preventivas.

## 15. Definition of Released

Uma versão só é considerada lançada quando produção está estável, métricas dentro do limite, reconciliações críticas concluídas e documentação/changelog publicados.