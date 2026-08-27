# Morro Digital V2 — Production GO Checklist

**Objetivo:** transformar o estado atual de engenharia validada em um release **comprovadamente pronto e formalmente autorizado para produção**.

**Status inicial:** `NO-GO`. Os checks de código e CI estão verdes, mas isso não substitui inventário live, evidência de staging, testes de recuperação, owners operacionais nem autorização formal. Cada item abaixo deve receber evidência persistente; “parece configurado”, “passou localmente” ou “está no blueprint” não é conclusão.

## Como usar este checklist

Marque cada item somente quando a evidência estiver anexada ao registro de produção, à issue de release ou ao artefato de CI correspondente. Para cada item, substitua `A atribuir` pelo responsável nominal e informe data/hora, ambiente, SHA, revision, deploy ID, URL ou run ID. Nunca cole valores de secrets, tokens, chaves privadas, dados de cartão ou PII sensível no checklist.

| Estado  | Significado                                             |
| ------- | ------------------------------------------------------- |
| `[ ]`   | Pendente                                                |
| `[x]`   | Concluído com evidência verificável                     |
| `N/A`   | Não aplicável, com justificativa e aprovação registrada |
| `NO-GO` | Critério de parada; não promover                        |

> **Regra principal:** sem SHA exato, backup/recovery point, rollback target, owners, evidência de staging, Promotion Gate verde e autorização formal `GO`, a produção não deve ser tocada.

## 0. Registro do candidato e governança

| ID     | Prioridade | Tarefa pendente                                                                                                                                                                         | Responsável      | Evidência de conclusão                        | Dependência/critério de parada                             |
| ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------- | ---------------------------------------------------------- |
| GOV-01 | P0         | Confirmar que a PR possui Quality Gate verde e não depende de aprovação de uma segunda conta.                                                                                             | Release owner   | Check `quality` verde e estado do ruleset.     | Não fazer bypass; falha de CI, `NO-GO`.                    |
| GOV-02 | P0         | Mesclar a PR somente com `Quality Gate/quality` verde, threads resolvidas e ruleset de `main` ativo.                                                                                    | A atribuir       | SHA de `main` após merge e histórico da PR.   | Não usar force-push, merge administrativo ou branch móvel. |
| GOV-03 | P0         | Definir o novo `PRODUCTION_CANDIDATE_SHA` depois do merge; o SHA anterior `6276b0bc…` deixa de ser candidato se `main` mudar.                                                           | Release owner    | SHA completo local/remoto idêntico.           | Qualquer divergência invalida toda a certificação.         |
| GOV-04 | P0         | Atualizar a Issue [#33](https://github.com/luizanunciostoca/touristic-digital-platform/issues/33) com o novo SHA, estado e links de evidência.                                          | Release owner    | Issue única em estado `NO-GO` ou `GO` formal. | Não criar registros concorrentes para o mesmo release.     |
| GOV-05 | P1         | Confirmar que o ruleset `main-release-protection` exige PR, `quality`, resolução de threads, bloqueio de deleção/non-fast-forward e zero bypass actors, sem exigir aprovação de segunda conta. | Repository owner | Saída do ruleset e teste controlado da PR.    | Se o `quality` ou os bloqueios forem removidos, parar o release. |

## 1. Inventário live de infraestrutura

| ID     | Prioridade | Tarefa pendente                                                                                                                     | Responsável         | Evidência de conclusão                                       | Dependência/critério de parada                                 |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| INF-01 | P0         | Registrar conta e projeto Render, região, plano e permissões administrativas do serviço de produção `morro-digital-v2`.             | Infra owner         | Inventário sem tokens, com links/IDs de recurso.             | Sem acesso ou owner nominal, `NO-GO`.                          |
| INF-02 | P0         | Confirmar a revision live, deploy ID, SHA e serviço que receberá o candidato.                                                       | Infra owner         | Export/print da plataforma e headers de runtime.             | Revision ou SHA desconhecido, `NO-GO`.                         |
| INF-03 | P0         | Confirmar o banco de produção, host lógico, schema, versão, collation, timezone, TLS, firewall, pool e usuário de menor privilégio. | DBA/Infra           | Inventário redigido e teste de conexão sem expor URL/secret. | Banco não identificado ou sem TLS/least privilege, `NO-GO`.    |
| INF-04 | P0         | Identificar domínio canônico, DNS, certificado TLS, redirect HTTPS, CORS, OAuth return origins, Mapbox origins e URL do webhook.    | Infra/Security      | Checklist DNS/TLS e URLs aprovadas.                          | Qualquer origem wildcard ou domínio não confirmado, `NO-GO`.   |
| INF-05 | P1         | Confirmar CDN/proxy, storage, filas, workers, cron/scheduled jobs e service accounts; registrar `N/A` quando não existirem.         | Infra owner         | Inventário completo com owner de cada recurso.               | Recurso não inventariado não pode ser considerado operacional. |
| INF-06 | P0         | Confirmar destinos de logs, métricas, traces, dashboards, retenção e controle de acesso.                                            | Observability owner | URLs/permalinks e política de retenção.                      | Sem observabilidade consultável, `NO-GO`.                      |
| INF-07 | P0         | Confirmar on-call primary/secondary, owner de banco, Payments, Security, observabilidade e autoridade de rollback.                  | Release owner       | Nomes e contatos fora do Git, associados ao release.         | Alerta sem owner é falha de readiness.                         |

## 2. Staging isolado e certificação operacional

| ID     | Prioridade | Tarefa pendente                                                                                                                                                              | Responsável         | Evidência de conclusão                                                                     | Dependência/critério de parada                                           |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| STG-01 | P0         | Publicar o candidato exato em `morro-digital-v2-staging` com `autoDeploy: false`.                                                                                            | Infra owner         | Deploy ID, revision e SHA.                                                                 | Staging apontando para `main` móvel, `NO-GO`.                            |
| STG-02 | P0         | Confirmar que staging usa somente banco, schemas, usuários, secrets e callbacks isolados da produção.                                                                        | DBA/Infra           | Matriz staging × produção e evidência de valores não compartilhados; sem valores secretos. | Qualquer compartilhamento não aprovado, `NO-GO`.                         |
| STG-03 | P0         | Validar migrations de Auth, Ordering e Financial em staging, incluindo sucesso, idempotência e comportamento após restart.                                                   | DBA/Backend         | Logs/run ID, schema version e resultado de reexecução segura.                              | Migration destrutiva, não repetível ou sem rollback compatível, `NO-GO`. |
| STG-04 | P0         | Executar health, readiness, startup e release identity com `X-Release-SHA`, `X-Release-Version` e `X-Deployment-ID`.                                                         | Infra/QA            | Respostas e headers redigidos.                                                             | `/healthz`/`/readyz` falho ou identity divergente, `NO-GO`.              |
| STG-05 | P0         | Executar smoke seguro: homepage/assets, Auth/session/logout, busca, mapa, navegação e superfícies Business, CRM, Ticketing e Affiliates.                                     | QA                  | Checklist, screenshots/logs e ausência de 5xx inesperado.                                  | Falha P0/P1 ou isolamento quebrado, `NO-GO`.                             |
| STG-06 | P0         | Confirmar Mercado Pago em modo TEST, seller/aplicação TEST, webhook TEST, assinatura, retry e idempotência.                                                                  | Payments owner      | Evidência de fixture/evento sandbox, sem dinheiro real.                                    | Qualquer mistura TEST/PROD, `NO-GO`.                                     |
| STG-07 | P1         | Testar limites de rate limiting, burst, concorrência e comportamento com mais de uma réplica; registrar que o limiter distribuído segue falso se houver somente uma réplica. | Security/Infra      | Métricas e resultado controlado.                                                           | Escala horizontal sem store atômico, `NO-GO`.                            |
| STG-08 | P0         | Executar injeção controlada de falhas em staging para health, banco, provider, webhook e dependência externa.                                                                | SRE/QA              | Timeline, alertas disparados e recuperação.                                                | Alerta sem disparo/owner, `NO-GO`.                                       |
| STG-09 | P0         | Executar rollback em staging para a última revision estável e confirmar health, readiness, identity, dados e smoke pós-rollback.                                             | Release/Infra       | Deploy IDs, SHA anterior e relatório de rollback.                                          | Rollback manual não repetível ou schema incompatível, `NO-GO`.           |
| STG-10 | P0         | Medir baseline de p50/p95/p99, 5xx, CPU, memória, conexões/pool MySQL, throughput e backlog de webhook.                                                                      | Observability owner | Dashboard/permalink e valores de referência.                                               | Sem baseline não há critério de abort.                                   |

## 3. Secrets, Auth e segurança

| ID     | Prioridade | Tarefa pendente                                                                                                                 | Responsável       | Evidência de conclusão                                    | Dependência/critério de parada                                   |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| SEC-01 | P0         | Confirmar secret manager, leitores/escritores, rotação, retenção e auditoria de todas as 56 chaves inventariadas.               | Security/Infra    | Matriz de secret names, owners e timestamps; sem valores. | Secret no Git/chat/log, `NO-GO` e iniciar rotação.               |
| SEC-02 | P0         | Confirmar que nenhum secret TEST está injetado em produção e que o ambiente é explicitamente `production`.                      | Security/Infra    | Auditoria de configuração e diff redigido.                | Mistura de ambientes, `NO-GO`.                                   |
| SEC-03 | P0         | Confirmar origem HTTPS canônica, cookies `Secure`/`HttpOnly`/`SameSite`, TTL, logout, revogação e CSRF.                         | Auth/Security     | Testes live redigidos e evidência de sessão.              | Bypass global, cookie inseguro ou sessão sem expiração, `NO-GO`. |
| SEC-04 | P0         | Confirmar RBAC, tenant isolation, autorização de mutações, ausência de cross-tenant reads e auditoria append-only.              | Security/Backend  | Suite de autorização e evidência de auditoria.            | Qualquer acesso indevido, `NO-GO`.                               |
| SEC-05 | P1         | Validar CSP, HSTS, frame ancestors, `X-Content-Type-Options`, Referrer Policy, Permissions Policy, CORS restritivo e redirects. | Security/Frontend | Headers live e relatório de inspeção.                     | CSP permissiva ou CORS wildcard não aprovado, `NO-GO`.           |
| SEC-06 | P1         | Validar uploads, tamanho/tipo de arquivo, path traversal, conteúdo ativo e armazenamento privado.                               | Security/Backend  | Casos positivos/negativos e logs.                         | Upload não validado, `NO-GO`.                                    |
| SEC-07 | P1         | Executar scan de dependências, container e configuração da plataforma, além de revisar findings de secrets/PII em logs.         | Security          | Relatórios com findings triados.                          | Finding crítico sem mitigação, `NO-GO`.                          |
| SEC-08 | P1         | Confirmar orçamento e hard limits do OpenAI/LLM, owner, timeout, fallback e ausência de PII indevida nos prompts/logs.          | AI owner/Security | Configuração redigida e teste controlado.                 | Sem limite financeiro ou vazamento de PII, `NO-GO`.              |

## 4. Banco, backup, restore e disaster recovery

| ID    | Prioridade | Tarefa pendente                                                                                                  | Responsável        | Evidência de conclusão                                   | Dependência/critério de parada                                  |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------- | --------------------------------------------------------------- |
| DB-01 | P0         | Criar backup imediatamente anterior ao deploy e registrar recovery point identificável.                          | DBA                | Backup ID/timestamp e retenção.                          | Backup não verificável, `NO-GO`.                                |
| DB-02 | P0         | Confirmar retenção, criptografia, PITR quando suportado, região, acesso e processo de recuperação.               | DBA/Security       | Política e configuração redigida.                        | Sem retenção ou acesso controlado, `NO-GO`.                     |
| DB-03 | P0         | Restaurar o backup em clone/ambiente seguro e validar schema, migrations, integridade e duração.                 | DBA                | Restore ID, duração, checks de integridade.              | Restore não testado, `NO-GO`.                                   |
| DB-04 | P0         | Escrever e aprovar RPO/RTO e comparar com o resultado observado no restore.                                      | DBA/Business owner | Valores aprovados e medidos.                             | RPO/RTO ausente ou não atendido, `NO-GO`.                       |
| DB-05 | P0         | Confirmar que as migrations seguem expand/contract quando necessário e que não dependem de downgrade destrutivo. | Backend/DBA        | Plano de compatibilidade entre revision nova e anterior. | Incompatibilidade, `NO-GO`.                                     |
| DB-06 | P0         | Testar pool, TLS, timeouts, retry, conexão e comportamento de degradação do MySQL.                               | DBA/Backend        | Métricas e testes controlados.                           | Pool esgotado ou fallback inseguro, `NO-GO`.                    |
| DB-07 | P0         | Executar simulado de disaster recovery sem alterar produção e registrar timeline, owners e decisões.             | SRE/DBA            | Relatório de DR e ações corretivas.                      | Conhecimento informal ou passo manual não documentado, `NO-GO`. |

## 5. Mercado Pago e autorização financeira

| ID     | Prioridade | Tarefa pendente                                                                                                                                             | Responsável      | Evidência de conclusão                                             | Dependência/critério de parada                                |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| PAY-01 | P0         | Manter o checkout de produção em TEST até existir autorização financeira explícita; não tratar o blueprint TEST como certificação live.                     | Payments owner   | Registro de decisão.                                               | Sem autorização, não fazer cutover.                           |
| PAY-02 | P0         | Criar/confirmar aplicação, seller, Public Key, Access Token e associação das credenciais de produção no secret manager.                                     | Payments owner   | IDs redigidos, auditoria de secret manager.                        | Credencial enviada ao Git/chat/frontend, `NO-GO`.             |
| PAY-03 | P0         | Definir contrato de webhook HTTPS de produção, assinatura raw-body, `x-signature`, `x-request-id`, clock tolerance, retries e deduplicação.                 | Payments/Backend | Endpoint aprovado e evento assinado controlado.                    | Endpoint não assinado ou não idempotente, `NO-GO`.            |
| PAY-04 | P0         | Validar eventos de payment/subscription, readback autoritativo, accounting, settlement e reconciliation.                                                    | Payments/Finance | Evidências sandbox e, se autorizado, produção sem dados de cartão. | Acknowledgement sem readback ou finding inexplicado, `NO-GO`. |
| PAY-05 | P0         | Validar refund/cancelamento com idempotência, readback autoritativo e tratamento de falha parcial.                                                          | Payments/Finance | Fixture TEST; produção somente com autorização específica.         | Não executar comando financeiro sem gate.                     |
| PAY-06 | P1         | Definir se a microtransação real é `N/A` ou necessária. Se necessária, obter autorização com valor mínimo, instrumento autorizado, refund e contabilização. | Finance owner    | Decisão assinada e evidências.                                     | Sem decisão, transação real é `NO-GO`.                        |
| PAY-07 | P1         | Documentar política de outage: não forçar estado no browser, não repetir sem idempotency key, preservar provider event ID e abrir reconciliation.           | Payments/SRE     | Runbook revisado e simulado.                                       | Falha sem procedimento, `NO-GO`.                              |

## 6. Observabilidade, alertas e operação

| ID     | Prioridade | Tarefa pendente                                                                                                                | Responsável            | Evidência de conclusão                   | Dependência/critério de parada               |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------- | -------------------------------------------- |
| OBS-01 | P0         | Criar dashboards live para 5xx, p50/p95/p99, throughput, CPU, memória, pool MySQL, Auth, webhook, Payments, Ticketing e jobs.  | Observability owner    | URLs/permalinks e janela de retenção.    | Dashboard inacessível ao plantão, `NO-GO`.   |
| OBS-02 | P0         | Configurar alerta de `/healthz` e `/readyz` com owner de plantão e severidade crítica.                                         | SRE                    | Teste sintético e receipt do alerta.     | Sem owner ou sem teste, `NO-GO`.             |
| OBS-03 | P0         | Configurar alertas de 5xx, latência p95/p99, CPU, memória, MySQL/pool/migration.                                               | SRE/DBA                | Thresholds, owners, channels e teste.    | Threshold não definido, `NO-GO`.             |
| OBS-04 | P0         | Configurar alertas de webhook rejeitado/backlog, provider error, reconciliation findings, refund/subscription e anomalia Auth. | Payments/Security/SRE  | Eventos sintéticos e alert receipts.     | Alerta financeiro sem owner, `NO-GO`.        |
| OBS-05 | P1         | Confirmar logs estruturados sem secrets/PII indevida, com correlation ID, release SHA, version e deployment ID.                | Security/Observability | Amostra redigida e política de retenção. | Secret/PII nos logs, `NO-GO`.                |
| OBS-06 | P0         | Executar uma janela sintética completa em staging: disparar alerta, notificar owner, mitigar e encerrar com evidência.         | SRE                    | Timeline completa.                       | Se não houver resposta operacional, `NO-GO`. |

## 7. Release Promotion Gate e deploy

| ID     | Prioridade | Tarefa pendente                                                                                                                                            | Responsável        | Evidência de conclusão                | Dependência/critério de parada                       |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------- | ---------------------------------------------------- |
| REL-01 | P0         | Congelar o SHA final e revalidar `git rev-parse HEAD` contra `git ls-remote origin refs/heads/main`.                                                       | Release owner      | SHA completo idêntico.                | Divergência, `NO-GO`.                                |
| REL-02 | P0         | Confirmar no SHA final Quality Gate, testes, build, cinco repetições Business e Acceptance aplicável.                                                      | QA/Release         | Run IDs verdes.                       | Job ausente, flake ou skip inesperado, `NO-GO`.      |
| REL-03 | P0         | Executar o [Release Promotion Gate](../../.github/workflows/release-promotion-gate.yml) com `expected_sha` exato.                                          | Release owner      | Run ID, logs e artifact.              | Não executar com branch móvel ou `latest`.           |
| REL-04 | P0         | Emitir Production Authorization com SHA, links de gates, backup point, rollback target, owners, dashboards, alerts e decisão `GO`.                         | Approver designado | Registro assinado/identificado.       | Sem `GO`, não tocar produção.                        |
| REL-05 | P0         | Promover a revision pelo SHA aprovado, executar predeploy/migrations e registrar deploy ID, revision e environment.                                        | Infra owner        | Dados da plataforma e logs redigidos. | SHA/revision divergente ou migration falha, `NO-GO`. |
| REL-06 | P0         | Confirmar headers `X-Release-SHA`, `X-Release-Version`, `X-Deployment-ID` e runtime identity após deploy.                                                  | Infra/QA           | Capturas/requests redigidos.          | Identity ausente ou divergente, rollback.            |
| REL-07 | P0         | Executar acceptance segura em produção sem dinheiro real: homepage, Auth, logout, busca, mapa, navegação, módulos, health/readiness e zero 5xx inesperado. | QA/Release         | Evidência por endpoint/superfície.    | P0/P1 ou identidade divergente, rollback.            |
| REL-08 | P0         | Confirmar que nenhum secret, modo TEST indevido, acceptance bypass ou configuração de staging chegou à produção.                                           | Security/Infra     | Auditoria pós-deploy.                 | Qualquer mistura de ambiente, rollback e rotação.    |

## 8. Janela pós-release e rollback

| ID      | Prioridade | Tarefa pendente                                                                                                                              | Responsável            | Evidência de conclusão                          | Dependência/critério de parada             |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------- | ------------------------------------------ |
| POST-01 | P0         | Definir janela de observação, baseline e limites de abort antes do deploy.                                                                   | Release/SRE            | Registro com início/fim e thresholds.           | Sem critério de abort, `NO-GO`.            |
| POST-02 | P0         | Observar 5xx, latência, DB, CPU, memória, Auth, webhook, Payments, Ticketing, jobs e reconciliation durante a janela.                        | On-call                | Dashboard snapshot e timeline.                  | Sinal fora do limite, abort/rollback.      |
| POST-03 | P0         | Executar rollback se houver falha de health/readiness, startup, identity, migration, erro P0/P1, banco, provider, webhook ou reconciliation. | Autoridade de rollback | Deploy ID novo/anterior, SHA, motivo e duração. | Não fazer downgrade destrutivo de schema.  |
| POST-04 | P0         | Confirmar smoke seguro e health/readiness após eventual rollback.                                                                            | QA/Infra               | Evidência de revision estável.                  | Revision instável, manter `NO-GO`.         |
| POST-05 | P1         | Confirmar que alertas continuam ativos, backlog zerado ou explicado e findings de reconciliation resolvidos.                                 | SRE/Payments           | Dashboard, tickets e reconciliação.             | Finding inexplicado, não encerrar release. |
| POST-06 | P1         | Fazer post-release review, registrar incidentes, impacto, causa raiz e ações preventivas.                                                    | Release owner          | Issue/PIR e owners das ações.                   | Não encerrar sem registro final.           |

## 9. Fechamento documental

| ID     | Prioridade | Tarefa pendente                                                                                                         | Responsável          | Evidência de conclusão                 | Dependência/critério de parada            |
| ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------- | ----------------------------------------- |
| DOC-01 | P0         | Atualizar `PRODUCTION-RELEASE-READINESS.md` com novo SHA, evidências live, deploy ID, revision, backup point e decisão. | Release owner        | Registro versionado e issue vinculada. | Não marcar `released` antes do `GO`.      |
| DOC-02 | P0         | Atualizar este checklist, o runbook operacional e o Master Tracker com estados objetivos.                               | Release owner        | Commit/PR e links permanentes.         | Item sem evidência permanece pendente.    |
| DOC-03 | P1         | Registrar `N/A` formal para CDN, workers, cron, microtransação ou outros itens não existentes, com aprovação do owner.  | Owner correspondente | Justificativa e aprovador.             | “Não sabemos” não é `N/A`.                |
| DOC-04 | P0         | Encerrar a Issue #33 somente após decisão `GO`, evidências completas e janela pós-release concluída.                    | Release owner        | Issue encerrada com resumo final.      | Caso contrário, manter aberta em `NO-GO`. |

## Critérios objetivos de conclusão

O sistema pode ser classificado como **Production Ready / GO** somente quando todas as linhas P0 estiverem marcadas com `[x]`, as linhas P1 tiverem sido concluídas ou classificadas formalmente como `N/A`, e existirem simultaneamente:

1. Um `PRODUCTION_CANDIDATE_SHA` exato, imutável e aprovado.
2. Todos os checks obrigatórios verdes; aprovação de segunda conta não é requisito do ruleset atual.
3. Inventário live completo com owners, alertas, dashboards, secrets e recursos de dados identificados.
4. Evidência de staging isolado, migrations, smoke, observabilidade, backup/restore e rollback.
5. Production Authorization explícita com decisão `GO`.
6. Release Promotion Gate verde no SHA exato.
7. Deploy identificado por revision, deploy ID e headers de release.
8. Acceptance segura sem dinheiro real, salvo gate financeiro separado e autorizado.
9. Janela pós-release concluída dentro dos limites, sem P0/P1 e sem findings inexplicados.
10. Documentação, issue e tracker reconciliados.

Se qualquer critério falhar, o estado correto é **`NO-GO`**, mesmo que o código, os testes locais e o CI estejam verdes.

## Evidência atual já disponível

Os seguintes pontos já foram implementados ou comprovados no ciclo anterior e não precisam ser refeitos, salvo se o SHA mudar:

- PRs #34, #35 e #36 com Quality Gate verde; o candidato atual é o SHA `a3dd199a51c6e5cdc4c756417117714173c7b6f8` após a correção do Blueprint production.
- Quality Gate, contratos de CI, varredura de padrões de secrets e supply-chain audit versionados.
- Contrato Business comercial executado cinco vezes no CI e localmente.
- Startup local após build e exports Node dos pacotes compartilhados corrigidos.
- Runbook de operações e registro de readiness versionados.

Essa evidência é válida para o SHA correspondente e não substitui as provas live listadas neste checklist.
