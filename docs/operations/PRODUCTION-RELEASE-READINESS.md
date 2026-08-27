# Morro Digital V2 — Production Release Readiness Register

**Data do registro:** 27 de agosto de 2026. **Repositório:** `luizanunciostoca/touristic-digital-platform`. **Status:** `NO-GO` para produção até que o serviço production seja provisionado, os gates externos e a autorização formal sejam concluídos.

Este registro é a fonte operacional para transformar o checklist mestre de produção em evidência verificável. Ele distingue deliberadamente **evidência de código**, **evidência de CI**, **evidência de staging** e **evidência de produção**. Passar em testes locais não autoriza deploy, não prova disponibilidade de infraestrutura e não autoriza uma transação financeira real.

> `equivalent` não significa `released`. A produção só pode ser tocada após uma decisão formal `GO`, um Promotion Gate verde no SHA exato e a confirmação de que o runtime, o banco, os providers, o rollback e a observabilidade correspondem ao candidato aprovado.

## Candidato oficial congelado

A branch `main` local e `origin/main` foram revalidadas no SHA `a3dd199a51c6e5cdc4c756417117714173c7b6f8`, após o merge das PRs #34 e #35. Esse é o `PRODUCTION_CANDIDATE_SHA` atual deste registro. Qualquer mudança posterior em `main` invalida este candidato e exige nova certificação, novo registro e nova decisão.

| Gate                         | Evidência atual                                                                                                                                                                              | Estado                             | Próxima prova exigida                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| SHA exato de `main`          | `git rev-parse HEAD` e `git ls-remote origin refs/heads/main` coincidem em `a3dd199a51c6e5cdc4c756417117714173c7b6f8`                                                                        | `PASS` no momento do registro      | Revalidar imediatamente antes de qualquer promoção                    |
| Proteção de `main`           | Ruleset `main-release-protection` ativo, PR obrigatório, `quality` obrigatório, bloqueio de deleção e non-fast-forward, resolução de threads e bypass vazio | `PASS`                             | Confirmar somente os checks automáticos no merge                       |
| Flake do Business Onboarding | Espera por `businessCommercialCheckoutPrepared`, timeout fail-closed de 5 segundos e matriz de cinco repetições no workflow                                                                  | `PASS`                             | Revalidar em cada novo candidato                                      |
| Quality Gate                 | Workflow consolidado `quality` versionado; último run verde após PR #35                                                                                                                      | `PASS`                             | Revalidar em cada novo candidato                                      |
| Release Promotion Gate       | Run `33038924106` exige `expected_sha`, compara checkout e `origin/main`, executa contratos, build e smoke local                                                                             | `PASS`                             | Revalidar imediatamente antes da promoção                             |
| Registry e trackers          | Registry, matrizes e evidências históricas versionados                                                                                                                                       | `PASS` como documentação existente | Atualizar somente após evidência nova; não inventar estado `released` |

## Governança e controle de mudanças

O ruleset permanece ativo no GitHub com PR obrigatório, resolução de threads, status `quality`, bloqueio de force-push/non-fast-forward e lista de bypass vazia. A aprovação por uma segunda conta não é obrigatória; a aceitação depende dos checks automáticos e das demais regras ativas.

O repositório não deve receber credenciais, tokens, senhas ou valores de secret manager. A verificação `pnpm secret-patterns:check` cobre assinaturas conhecidas de chaves privadas, tokens OpenAI/GitHub/AWS e JWTs; ela não substitui a auditoria da plataforma de secrets nem a rotação de credenciais que tenham sido expostas no passado.

## Separação staging × production

A separação está materializada em dois blueprints distintos. Staging usa um serviço web e um MySQL privado próprios, `autoDeploy: false`, credenciais TEST fornecidas fora do Git e callbacks de staging. Produção pretende usar o serviço `morro-digital-v2`, bancos fornecidos fora do Git, secrets gerados ou sincronizados pela plataforma e réplica única enquanto o limiter distribuído não existir. O serviço ainda não foi provisionado no workspace Render; a criação está bloqueada até que o `render.yaml` corrigido seja aceito.

| Superfície    | Staging                                                          | Produção no repositório                                             | Prova live ainda necessária                                                                         |
| ------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Serviço web   | `morro-digital-v2-staging`                                       | Não provisionado; definido como `morro-digital-v2` no `render.yaml` | Criar e confirmar contas, projetos e serviços Render distintos                                      |
| Banco         | `morro-digital-v2-staging-mysql`, quatro nomes de banco isolados | URLs MySQL fornecidas via secret manager                            | Confirmar host, schema, TLS, firewall, pool e usuário de menor privilégio                           |
| Payments      | Mercado Pago `test`, confirmação explícita de credenciais TEST   | Também permanece em `test` até cutover autorizado                   | Criar/confirmar aplicação de produção, seller, chaves pareadas, webhook HTTPS e política de retries |
| Auth          | Usuários e origem fornecidos fora do Git; bypass global falso    | Usuários e origem fornecidos fora do Git; bypass exige confirmação  | Confirmar identidade administrativa, TTL, cookies, logout, RBAC e ausência de usuário temporário    |
| OpenAI        | Chave externa, hard limit fechado                                | Chave externa                                                       | Confirmar orçamento, limites, owner e ausência de PII indevida em logs                              |
| Rate limiting | Uma réplica, limiter distribuído falso                           | Uma réplica, limiter distribuído falso                              | Se houver escala horizontal, configurar e testar store distribuído atômico                          |
| Domínio e TLS | `https://morro-digital-v2-staging.onrender.com`                  | Host production ainda não existe                                    | Criar domínio, confirmar DNS, certificado, redirect HTTPS, CORS, OAuth, Mapbox e webhook            |

A configuração de produção continua deliberadamente em `MERCADO_PAGO_CHECKOUT_MODE=test` e com o endpoint compatível com o contrato atual de webhook sandbox. Isso é um **guardrail de segurança**, não uma certificação de produção. O cutover real exige alteração revisada do contrato de endpoint/configuração, credenciais de produção correspondentes e autorização financeira separada.

## Inventário de produção

O código informa o nome do serviço, o runtime Node, o health check `/readyz`, o comando de predeploy de migrations e a identidade de release derivada das variáveis da plataforma. Ele não revela a conta Render, o projeto, o hostname MySQL, o domínio oficial, o DNS, o certificado, o storage, os workers, os cron jobs, os service accounts nem os owners dos alertas. Esses itens devem ser preenchidos pelo operador com acesso à infraestrutura, sem registrar secrets neste arquivo.

| Recurso                    | Conhecido pelo repositório                                                               | Estado do inventário operacional                         |
| -------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Serviço de produção        | Definido no `render.yaml` como `morro-digital-v2`, Node, Virginia, plano Starter         | **Bloqueado: serviço não existe no workspace Render**    |
| Banco de produção          | URLs `AUTH_DATABASE_URL`, `ORDERING_DATABASE_URL` e `FINANCIAL_DATABASE_URL` fora do Git | Confirmar host/schema/versão/collation/timezone/TLS/pool |
| Domínio oficial            | Return origins são externos ao blueprint                                                 | Confirmar DNS, domínio canônico, TLS e CORS              |
| CDN/proxy                  | Não especificado                                                                         | Confirmar ou registrar `N/A`                             |
| Storage, filas e workers   | Não materializados como recursos de produção no blueprint                                | Confirmar ou registrar `N/A`                             |
| Cron/scheduled jobs        | Não materializados como recursos no blueprint                                            | Confirmar ou registrar `N/A`                             |
| Providers                  | Mercado Pago, Mapbox e OpenAI aparecem na configuração                                   | Confirmar aplicações, origins, budgets e owners          |
| Secrets e service accounts | Valores permanecem fora do Git                                                           | Confirmar manager, leitores, escritores e rotação        |

## Banco, backup, disaster recovery e rollback

O predeploy aplica migrations de Ordering e Financial e valida conexões. A matriz local não prova uma execução contra MySQL de produção; a imagem Docker não está disponível neste sandbox. Antes do deploy, deve existir um backup imediatamente anterior, um recovery point identificável, retenção, PITR quando suportado, um restore testado em ambiente seguro, RPO/RTO escritos e um responsável nominal pela restauração.

O rollback da aplicação deve apontar para a última revision estável e para o SHA anterior. Migrations destrutivas não podem depender de downgrade; quando houver alteração incompatível, deve-se usar expand/contract. Em caso de falha, o critério é abortar quando health/readiness, startup, erros 5xx, migrations, webhook, pagamentos, banco ou reconciliação saírem dos limites definidos. O rollback só deve ser autorizado pelo responsável de plantão ou pelo owner designado no registro de Production Authorization.

## Segurança, abuso e observabilidade

O runtime já expõe `/healthz` e `/readyz`, injeta `X-Correlation-ID`, `X-Release-SHA`, `X-Release-Version` e `X-Deployment-ID`, registra observações estruturadas e falha fechado para identidade de release ausente em produção. Os contratos também cobrem HTTPS/origins, autenticação, CSRF, tenant, webhooks assinados, idempotência e isolamento de domínio.

A certificação live ainda precisa comprovar cookies Secure/HttpOnly/SameSite, CSP, HSTS, frame ancestors, CORS restritivo, validação de uploads, expiração e revogação de sessão, RBAC, tenant isolation, scan de dependências, ausência de secrets/PII nos logs, limites por IP/usuário/tenant, burst, concorrência entre réplicas, p50/p95/p99, CPU, memória, conexões MySQL e throughput de webhook.

| Alerta mínimo                                                | Owner e severidade a preencher no go/no-go | Teste exigido                          |
| ------------------------------------------------------------ | ------------------------------------------ | -------------------------------------- |
| Serviço, `/healthz` e `/readyz` indisponíveis                | Plantão; crítico                           | Alerta sintético                       |
| HTTP 5xx, latência p95/p99, CPU e memória                    | Plantão; alto                              | Injeção controlada em staging          |
| Falha/pool/migration do MySQL                                | DBA/plantão; crítico                       | Falha controlada e recuperação         |
| Rejeição/backlog de webhook e erro de provider               | Payments; alto                             | Evento assinado controlado             |
| Findings de reconciliation, refund e subscription            | Financeiro; crítico                        | Fixture sandbox e leitura autoritativa |
| Anomalia de autenticação e certificado próximo do vencimento | Segurança/plantão; alto                    | Teste sintético e inspeção de TLS      |

## Payments e autorização financeira

A aceitação TEST existente não autoriza dinheiro real. Antes de qualquer cutover de Mercado Pago, o operador deve confirmar seller, Application ID, Public Key, Access Token, associação entre as credenciais, webhook HTTPS, assinatura, eventos de payment/subscription, retry policy, idempotência, reconciliation, refund, cancelamento e observabilidade. As credenciais devem ser fornecidas apenas ao secret manager e nunca ao chat, ao Git ou ao frontend.

A aceitação financeira de produção é um gate separado. Por padrão, este registro classifica a transação real como **N/A para a certificação de engenharia**, salvo se uma política aprovada exigir microtransação. Se for exigida, deve existir autorização específica com valor mínimo controlado, instrumento autorizado, readback autoritativo, webhook real, accounting, settlement/reconciliation, refund e evidência sem dados de cartão. Sem essa autorização, o resultado correto é `NO-GO` para a transação, não uma tentativa.

## Sequência operacional de promoção

| Ordem | Ação                                               | Evidência                                                                                    | Critério de parada                                            |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1     | Revalidar `PRODUCTION_CANDIDATE_SHA` contra `main` | SHA local/remoto idêntico                                                                    | Qualquer divergência invalida a certificação                  |
| 2     | Concluir CI no SHA final                           | Quality Gate, cinco repetições Business e Acceptance quando aplicável                        | Qualquer flake, job ausente ou skip inesperado = `NO-GO`      |
| 3     | Validar staging isolado                            | health/readiness, runtime identity, DB, provider TEST, smoke e rollback                      | Falta de secret, migration, provider ou restore = `NO-GO`     |
| 4     | Emitir Production Authorization                    | Registro com SHA, evidências, backup, rollback, owners e `GO`                                | Sem `GO`, não tocar produção                                  |
| 5     | Executar Release Promotion Gate                    | Run ID com `expected_sha` exato                                                              | SHA diferente, build/startup/smoke/contract falho = `NO-GO`   |
| 6     | Promover a revision pelo SHA                       | Deploy ID, revision, logs e environment=production                                           | `latest`, branch móvel ou tráfego parcial incorreto = `NO-GO` |
| 7     | Executar acceptance segura                         | homepage, auth/session/logout, search, map, navigation, health/readiness, módulos e zero 5xx | Erro P0/P1 ou identidade divergente = rollback/`NO-GO`        |
| 8     | Observar janela pós-release                        | 5xx, p95/p99, DB, CPU, memória, auth, webhook, Payments, Ticketing e jobs                    | Instabilidade fora dos limites = rollback                     |
| 9     | Reconciliar documentação                           | deploy ID, revision, SHA, backup point, rollback target, evidence permanente                 | Não encerrar sem registro final e decisão GO                  |

## Autorização formal — modelo

O registro de autorização deve conter, no mínimo, `PRODUCTION_CANDIDATE_SHA`, links ou IDs do Quality Gate, Final Release Acceptance e Release Promotion Gate, auditoria de secrets, DB readiness, backup/recovery point, rollback target, dashboards, alertas, segurança, owners, janela de observação e decisão explícita.

```text
Production Authorization
Candidate SHA: a3dd199a51c6e5cdc4c756417117714173c7b6f8
Decision: NO-GO
Reason: production service is not provisioned; live inventory, backup/restore drill, provider production cutover decision, and explicit release authorization remain pending.
Real-money acceptance: N/A unless separately authorized.
Approver: pending
Date/time: pending
```

Até que o serviço production exista, o bloco acima seja substituído por uma decisão assinada `GO` e todas as evidências obrigatórias existam no SHA exato, o estado objetivo do projeto é **engenharia com guardrails e staging validado; não released e não production-ready**.

## Referências internas

1. `render.yaml` — blueprint de produção com checkout TEST e secrets fora do Git.
2. `render.staging.yaml` — blueprint de staging isolado com MySQL privado e providers TEST.
3. `.github/workflows/release-promotion-gate.yml` — promoção por SHA exato.
4. `.github/workflows/final-release-acceptance.yml` — orquestração de acceptance e identidade de release.
5. `.github/workflows/business-onboarding-commercial-browser-contract.yml` — contrato Business→Payments e repetição determinística.
6. `docs/product-architecture/RELEASE-PROCESS.md` — fluxo, go/no-go, rollback e definição de released.
7. `docs/operations/CI-RESTORE-PROMOTION-RUNBOOK.md` — governança do Quality Gate e regras de parada.
