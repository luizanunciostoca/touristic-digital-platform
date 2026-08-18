# Morro Digital V2 — Relatório final pós-validação local

**Data da validação:** 18 de agosto de 2026  
**Repositório:** `luizidebook/touristic-digital-platform`  
**Branch:** `main`  
**HEAD publicado:** `96fefbb5` (`chore(release): reconcile local verification evidence`)

## Resumo executivo

A execução elevou o projeto ao maior estado comprovável no sandbox sem GitHub Actions, credenciais de provider ou staging externo. O commit `96fefbb5` foi publicado diretamente em `origin/main` com o bugfix de idempotência do Affiliates, a correção de cleanup do teste MySQL do Ordering, a reconciliação do Feature Registry e a atualização do Master Migration Tracker.

O estado **não deve ser chamado de RELEASED globalmente**. Há evidência local forte para os domínios e para o banco MySQL, mas o provider sandbox E2E permanece bloqueado por credenciais externas e os checks oficiais do GitHub Actions/staging não foram executados nesta validação.

## Quadro de evidências

| Área | Classificação | Evidência real | Limite atual |
|---|---|---|---|
| Core UI, Geospatial, Navigation, Assistant, Business e Auth | EQUIVALENT_VERIFIED | Contratos e evidências permanentes já incorporados; aplicação principal abriu localmente | Release operacional e Actions não revalidados neste ciclo |
| Design System / MIG-0003 | EQUIVALENT_VERIFIED | 41 custom properties estruturadas em tokens V1; testes do design system e tracker reconciliado | Não promovido a released sem staging/Actions |
| CRM / MIG-0008 | EQUIVALENT_VERIFIED | 164/164 testes do CRM server com MySQL local; Settings genéricos, schema `crm_settings` e adapter filesystem/S3-compatible; contratos browser existentes | Staging, Actions e prova de object storage S3 real permanecem externos |
| Payments / MIG-0010 | BLOCKED_EXTERNAL | Financial 91/91 e Ordering 41/41 com MySQL real; observabilidade de recurring lifecycle; topology guard single-replica; browser principal local | Provider sandbox E2E exige `PAYMENTS_SANDBOX_PROVIDER_BASE_URL`, `PAYMENTS_SANDBOX_PROVIDER_API_TOKEN` e `PAYMENTS_SANDBOX_WEBHOOK_SECRET` |
| Affiliates / MIG-0011 | EQUIVALENT_VERIFIED (local) | Affiliates 4/4 com MySQL real; digest de idempotência normalizado case-insensitive; persistência, auditoria e outbox exercitados | Readback externo Ordering/Financial, DSR/retenção, browser E2E e Actions ainda pendentes |
| Ticketing / MIG-0017 | EQUIVALENT_VERIFIED | Ticketing 31/31 com MySQL real; reservation binding e transaction persistence exercitados; integração Ordering/Financial local | Browser E2E específico de Ticketing e provider sandbox não separados |
| Banco e migrations | CONTAINER_VERIFIED | 40 tabelas criadas no MySQL local para Financial, CRM, Ordering, Ticketing e Affiliates; migrations aplicadas com dependência Ordering corrigida | Não substitui migration dry-run/backup/restore em staging |
| Browser E2E | BROWSER_VERIFIED | 75 arquivos e 374 testes da aplicação; servidor local via `vite-node` em `http://127.0.0.1:4173`; mapa, clima, assistente e categorias carregados; assistente aberto com sucesso | Rotas autenticadas e checkout real exigem sessão/credenciais específicas |
| Quality Gate individual | LOCAL_VERIFIED | Lint, typecheck, testes e build dos pacotes afetados passaram; gate histórico completo de 37 tarefas e validações individuais foram confirmados | `pnpm check` agregado não foi usado como nova evidência nesta etapa devido a artefatos/cache `.turbo`; os gates individuais continuam a fonte desta classificação |
| Rollback drill | LOCAL_VERIFIED | `deploy good` readiness 200 → `deploy bad` readiness 503 → redeploy good readiness 200/health 200 | Drill não prova backup/restore ou rollback em staging |
| Provider E2E | BLOCKED_EXTERNAL | Script `tooling/payments/provider-sandbox-e2e.mjs` executado e falhou fail-closed | Três variáveis de credencial do sandbox provider ausentes |

## Testes MySQL executados

| Domínio | Resultado |
|---|---:|
| Financial | 91/91 PASS |
| Ordering | 41/41 PASS |
| CRM | 164/164 PASS |
| Ticketing | 31/31 PASS |
| Affiliates | 4/4 PASS |
| **Total** | **331/331 PASS** |

O teste de Affiliates revelou e corrigiu um defeito legítimo: o MySQL retornava o digest em caixa diferente da representação do input. A comparação do `semantic_digest` agora é case-insensitive, preservando a proteção contra replay e conflito sem relaxar a igualdade semântica. O teste de Ordering também passou a limpar explicitamente os vínculos de Ticketing antes dos testes, respeitando a dependência de dados.

## Provider sandbox E2E

O script executável iniciou o fluxo provider-neutral, mas encerrou com `EXIT_CODE=1` e a mensagem fail-closed de credenciais ausentes. Para liberar esta etapa, o operador precisa fornecer, fora do repositório, o endpoint HTTPS do sandbox provider, o bearer token e o segredo de assinatura do webhook. Nenhum segredo foi inventado ou gravado no código.

## Rollback drill

O drill local comprovou o comportamento operacional mínimo exigido: a versão boa respondeu readiness 200; a versão ruim respondeu readiness 503 enquanto o health endpoint permaneceu observável; a versão boa foi redeployada e retornou readiness 200 e health 200. Isso é evidência `LOCAL_VERIFIED`, não substituto para backup/restore e rollback em staging.

## Estado publicado

O commit `96fefbb5` foi enviado com sucesso para `origin/main`, avançando a referência remota de `a6ee3846` para `96fefbb5`. O working tree deve permanecer limpo após a inclusão opcional deste relatório. As alterações publicadas incluem o bugfix de Affiliates, testes de integração determinísticos, cleanup de Ordering, Feature Registry e Master Migration Tracker.

## Conclusão de release

O projeto está **READY_FOR_CI / PRE-RELEASE OPERATIONAL READY** com evidência local e MySQL real. Os domínios classificados como `EQUIVALENT_VERIFIED` têm evidência suficiente para equivalência local, mas não foram promovidos globalmente a `RELEASED`. Payments permanece `BLOCKED_EXTERNAL` até o provider sandbox E2E ser executado com credenciais reais; depois disso ainda são necessários os checks do GitHub Actions, staging observability, backup/restore e rollback operacional antes de um GO de produção.

A promoção responsável, portanto, é: **equivalência local comprovada, release global ainda bloqueado por dependências externas identificadas**.
