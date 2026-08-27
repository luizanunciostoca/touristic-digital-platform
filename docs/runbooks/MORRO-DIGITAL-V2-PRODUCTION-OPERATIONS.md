# Morro Digital V2 — Production Operations Runbook

**Escopo:** operação segura do serviço `morro-digital-v2` depois de uma autorização formal `GO`. **Estado atual:** este runbook é aplicável como procedimento, mas a execução live continua bloqueada enquanto o registro de Production Authorization estiver em `NO-GO`.

## Princípios de operação

Toda mudança começa por um SHA imutável e termina com evidência permanente. O operador não deve promover `latest`, uma branch móvel ou uma imagem sem identidade. Nenhum passo deste documento pede que secrets sejam colados em chat, logs, issues ou no Git. Operações financeiras reais exigem autorização separada; o ambiente de staging usa somente credenciais TEST.

## Dados que devem estar preenchidos antes da janela

| Campo                      | Valor a preencher antes do `GO` |
| -------------------------- | ------------------------------- |
| `PRODUCTION_CANDIDATE_SHA` | SHA completo aprovado           |
| Revision estável anterior  | ID da revision e SHA anterior   |
| Production deploy ID       | ID fornecido pela plataforma    |
| Production revision        | Nome/ID da revision promovida   |
| Domínio canônico           | Hostname oficial                |
| MySQL recovery point       | ID ou timestamp do backup       |
| RPO/RTO                    | Limites aprovados               |
| On-call primary/secondary  | Pessoas/contatos fora do Git    |
| Dashboard operacional      | URL/permalink                   |
| Sink de observabilidade    | Destino e retenção              |
| Janela de observação       | Início, fim e limites de abort  |

## Deploy seguro

Antes da janela, revalide `git ls-remote origin refs/heads/main` e compare o resultado com `PRODUCTION_CANDIDATE_SHA`. Execute o Quality Gate, a aceitação final e o Release Promotion Gate exatamente nesse SHA. O Promotion Gate deve passar pelos contratos canônicos, pelo build, pelo startup e pelo smoke local; qualquer divergência invalida o candidato.

Confirme que a Production Authorization contém `GO`, backup/recovery point, rollback target, owners de alerta, segurança e evidência de staging. Confirme também que o blueprint de produção não recebeu secrets de staging, que o checkout continua TEST até um cutover de Payments explicitamente autorizado e que o provider não será exercitado com dinheiro real durante o smoke seguro.

O deploy deve usar o SHA aprovado, executar predeploy/migrations conforme o comando versionado e aguardar o startup. Registre o deploy ID, revision, SHA, environment, `X-Release-SHA`, `X-Release-Version`, `X-Deployment-ID`, health, readiness e os primeiros logs estruturados. Interrompa se `/healthz` ou `/readyz` falhar, se a identidade de release estiver ausente, se a migration falhar, se aparecerem erros críticos ou se qualquer tráfego chegar à revision errada.

## Smoke seguro pós-deploy

Execute apenas operações que não movimentem dinheiro: homepage e assets, runtime config, `/healthz`, `/readyz`, autenticação, sessão e logout, busca, mapa, navegação e as superfícies de Business, CRM, Ticketing e Affiliates que tenham fixtures seguras. Confirme que a resposta carrega o SHA esperado, os headers de correlação e que não existe `acceptance mode`, senha temporária, segredo TEST indevido ou erro 5xx inesperado.

A aceitação de Payments de produção fica como `N/A` quando a política de release não exige microtransação real. Se uma microtransação for exigida, abra um gate separado com autorização financeira, valor mínimo, instrumento autorizado, readback autoritativo, webhook, accounting, settlement/reconciliation, refund e evidência sem dados de cartão.

## Rollback de aplicação

Dispare rollback quando houver falha de health/readiness, identity, startup, migration, erro P0/P1, aumento sustentado de 5xx, degradação de p95/p99, falha de conexão/pool MySQL, rejeição/backlog de webhook, falha de provider ou finding anormal de reconciliation. O responsável de plantão pode executar o abort somente dentro dos limites aprovados; registre a decisão, hora e evidência.

Para rollback, interrompa a exposição da revision nova pela plataforma, promova a revision estável anterior pelo SHA registrado e confirme `/healthz`, `/readyz`, `X-Release-SHA`, `X-Deployment-ID`, logs, métricas e smoke seguro. Não faça downgrade destrutivo de schema. Se a migration foi expand/contract, mantenha o schema compatível com a revision anterior; se não for compatível, siga o plano de migração reversível ou restaure em ambiente seguro com o owner de banco.

Finalize o rollback registrando deploy ID/revision nova, revision anterior, SHA efetivo, motivo, duração, impacto por tenant/destino, estado de Payments, estado do banco, recovery point e ações preventivas. O rollback não deve apagar histórico append-only, eventos de provider, ledger ou auditoria.

## Backup, restore e disaster recovery

Antes do release, crie um backup do banco de produção e registre o recovery point. Confirme retenção, PITR quando suportado, criptografia, controle de acesso, região e owner. Teste o restore em clone/snapshot sem alterar produção e registre a duração, a integridade de migrations, o RPO observado e o RTO observado.

Em desastre, declare incidente, preserve logs e IDs de correlação, determine o último recovery point válido, restaure em ambiente isolado, aplique apenas migrations compatíveis, valide health/readiness e execute smoke seguro. Só substitua o endpoint live após o owner autorizar e após confirmar que nenhum segredo de staging foi restaurado no ambiente de produção. Registre cada passo; conhecimento informal não é requisito de recuperação.

## Mercado Pago indisponível ou webhook degradado

Quando houver erro do provider, não substitua a autoridade por resposta não autoritativa do browser, não repita comandos sem a idempotency key e não force Payment, refund, subscription ou settlement manualmente. Marque o provider como degradado, preserve correlation ID e provider event ID, monitore retries e verifique se o webhook assinado está chegando.

Se o endpoint estiver indisponível, confirme DNS/TLS, assinatura raw-body, clock tolerance, `x-signature`, `x-request-id`, deduplicação e backlog. Reentregas devem ser idempotentes. Reconciliation é read-only e deve produzir findings explícitos; acknowledgement não remedia nem altera autoridade financeira. Refund e cancelamento exigem readback autoritativo e nunca devem ser certificados apenas por resposta do comando.

## Auth, banco e segurança

Para incidente de Auth, confirme origem HTTPS, cookies Secure/HttpOnly/SameSite, TTL, CSRF, CORS, RBAC e tenant isolation. Para incidente de banco, interrompa migrations concorrentes, confirme conexões e pool, preserve evidência, avalie failover/restore e não exponha URLs de conexão nos logs. Para suspeita de segurança, revogue/rotacione a credencial afetada no secret manager, preserve evidência, restrinja acessos e acione o owner de segurança.

Uploads, CSP, HSTS, frame ancestors, X-Content-Type-Options, Referrer Policy, redirects, inputs e dependências devem permanecer cobertos pelos contratos automatizados. Novos bypasses, usuários temporários ou allowlists emergenciais precisam de owner, validade e registro explícito; a configuração padrão deve ser fail-closed.

## Alertas e observação pós-release

Durante a janela, acompanhe 5xx, p95/p99, CPU, memória, conexões/pool MySQL, health/readiness, Auth, webhook, Payments, Ticketing, jobs e reconciliation. Um alerta sem owner é falha de readiness. Dispare pelo menos um alerta sintético em staging antes do `GO` e registre o resultado.

| Sinal                               | Ação inicial                                                  | Abort/rollback quando                                      |
| ----------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `/healthz` ou `/readyz` falha       | Verificar revision, startup, DB e logs                        | Falha persistente ou identity divergente                   |
| 5xx/latência aumenta                | Comparar baseline, correlation IDs e endpoint                 | Limite aprovado ultrapassado de forma sustentada           |
| MySQL/pool falha                    | Congelar migrations, verificar conexões e recovery point      | Perda de escrita, corrupção ou esgotamento sem recuperação |
| Webhook rejeitado/backlog           | Verificar TLS, assinatura, clock e deduplicação               | Eventos autoritativos não são processados com segurança    |
| Payment/refund/reconciliation falha | Não remediar autoridade manualmente; abrir incidente Payments | Findings não explicados ou risco de dupla contabilização   |
| Auth anomaly                        | Restringir acesso e preservar auditoria                       | Suspeita de comprometimento ou isolamento rompido          |

Ao final da janela, confirme ausência de P0/P1, métricas dentro dos limites, zero findings de reconciliation não explicados, estabilidade do banco, logs sem secrets/PII indevida e rollback ainda disponível. Atualize a evidência permanente, o Master Tracker, a matriz de release e o registro de Production Authorization.

## Encerramento de incidente

Todo incidente de release deve registrar timeline, impacto por destino/tenant, detecção, mitigação, causa raiz, decisão de rollback, recovery point, comunicação, owner e ações preventivas. O incidente não deve ser encerrado somente porque o tráfego voltou: health, readiness, identity, database, provider, observabilidade, alertas e reconciliação também precisam estar verdes ou formalmente aceitos como `N/A`.
