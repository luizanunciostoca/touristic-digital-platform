# Render Staging V2 — isolamento, migração e acceptance

## Objetivo

Criar um staging da V2 que seja rastreável ao repositório canônico `luizanunciostoca/touristic-digital-platform`, execute o mesmo runtime candidato e permaneça isolado do staging legado e de produção.

Este runbook é **fail-closed**: nenhuma mutation de banco, deploy do candidate ou chamada paga deve ocorrer enquanto as pré-condições abaixo não estiverem comprovadas.

Toda evidência de CI e acceptance citada neste runbook deve corresponder ao head exato que será promovido; evidência de SHA anterior não autoriza deploy.

## Estado legado observado em 2026-08-21

O recurso Render existente `morro-digital-staging` **não é o staging da V2**. A auditoria read-only mostrou:

- repositório: `luizidebook/morro-de-sao-paulo-digital`;
- branch: `audit/business-flow-main-synced-2026-08`;
- build: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run prisma:seed`;
- start: `npm start`;
- health check: `/api/health`;
- região: Ohio;
- último deploy live observado: `fa7bedb5896f8c3327589e737ef51f879bfe59d8`;
- datastore: `morro-digital-staging-db`, PostgreSQL 18, Ohio.

Não repontar, apagar ou reciclar esses recursos durante a certificação. Eles permanecem como evidência histórica/rollback até decisão explícita posterior.

## Topologia V2 de staging

O arquivo `render.staging.yaml` cria recursos novos e separados:

```text
morro-digital-v2-staging (web, Node 22+, Ohio)
        |
        | private network / generated credentials
        v
morro-digital-v2-staging-mysql (private service, MySQL 8.4, Ohio)
        |-- morro_auth_staging       / user morro_auth
        |-- morro_ordering_staging   / user morro_ordering
        |-- morro_financial_staging  / user morro_financial
        `-- morro_affiliates_staging / user morro_affiliates
```

Cada domínio possui schema e usuário próprios. O compartilhamento do engine MySQL é aceito **somente em staging de acceptance** para reduzir custo operacional; ele não constitui evidência de isolamento físico/failure-domain para produção.

O MySQL usa private service e disco persistente em `/var/lib/mysql`. Não há porta pública de banco.

## Segurança das credenciais de banco

O Blueprint gera `MYSQL_ROOT_PASSWORD` e as quatro senhas de domínio no private service. O web service recebe as credenciais por `fromService`, além do `hostport` privado.

`tooling/render/with-staging-mysql-env.mjs` monta `AUTH_DATABASE_URL`, `ORDERING_DATABASE_URL`, `FINANCIAL_DATABASE_URL` e `AFFILIATES_DATABASE_URL` somente em memória ao iniciar o processo filho. As URLs e senhas não são gravadas no GitHub nem impressas em logs.

## Pré-condições antes de criar o Blueprint

1. `main` precisa apontar para o candidate aprovado e possuir CI verde no SHA exato.
2. O GitHub App do Render precisa ter acesso ao repositório privado `luizanunciostoca/touristic-digital-platform`.
3. O staging legado e seu Postgres devem permanecer intactos.
4. O operador deve ter credenciais **de teste** válidas do Mercado Pago e o segredo oficial do webhook, sem enviá-los para GitHub ou chat.
5. O token público Mapbox deve estar válido; o provider preflight do CI deve estar verde.
6. Nenhuma configuração de produção do Mercado Pago pode ser usada neste Blueprint.

## Criação do Blueprint

No Render, crie um novo Blueprint apontando para o repositório canônico e selecione o caminho:

```text
render.staging.yaml
```

Revise antes de confirmar:

- web service: `morro-digital-v2-staging`;
- private DB service: `morro-digital-v2-staging-mysql`;
- região dos dois: `ohio`;
- branch dos dois: `main`;
- `autoDeploy: false`;
- health check: `/readyz`;
- MySQL disk: `/var/lib/mysql`;
- Mercado Pago: `MERCADO_PAGO_CHECKOUT_MODE=test`.

Se qualquer item divergir, **não sincronize**.

## Valores `sync: false`

Preencha no fluxo seguro do Render, sem copiá-los para PRs, issues ou chat:

### Auth

- `DASHBOARD_USERS_JSON`: usuários de acceptance aprovados;
- `DASHBOARD_AUTH_ORIGIN`: origin HTTPS exata do novo serviço.

`DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED` permanece `false`, salvo decisão explícita e documentada.

### Ordering

- `ORDERING_PRICING_CATALOG_JSON`: catálogo canônico aprovado, em minor units.

### Payments / Mercado Pago

- `PAYMENTS_RETURN_URL_ORIGINS`: origin HTTPS exata do staging;
- `MERCADO_PAGO_ACCESS_TOKEN`: Access Token exibido em **Testes > Credenciais de teste** da aplicação Checkout Pro aprovada;
- `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED`: `true` somente após essa origem TEST ter sido conferida pelo operador;
- `MERCADO_PAGO_WEBHOOK_SECRET`: segredo oficial do webhook da mesma aplicação;
- `PAYMENTS_WEBHOOK_URL`: `https://<host-staging>/api/payments/v1/webhooks/sandbox`.

O Blueprint fixa:

```text
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
MERCADO_PAGO_CHECKOUT_ORIGINS=https://www.mercadopago.com,https://www.mercadopago.com.br
V1_PAYMENT_PROVIDER_API_URL=https://api.mercadopago.com
```

Em `MERCADO_PAGO_CHECKOUT_MODE=test`, o adapter exige `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true` antes de qualquer chamada de criação de preferência. Essa confirmação registra que o operador conferiu o Access Token diretamente em **Testes > Credenciais de teste**. O fluxo atual do Checkout Pro emite essas credenciais automaticamente; portanto o runtime não infere mais TEST pela tag de `/users/me`. Depois desse guard, somente o `init_point` em uma das origins oficiais acima é aceito.

### Mapbox

- `VITE_MAPBOX_ACCESS_TOKEN`: token público válido, copiado diretamente do Mapbox;
- o estilo permanece `mapbox://styles/mapbox/streets-v12`.

### OpenAI

`OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED=false` no Blueprint. Isso mantém chamadas pagas fail-closed. A verificação do provider OpenAI é uma promoção separada e não deve ser habilitada apenas para fazer o staging passar.

## Ordem de deploy

`autoDeploy` permanece desligado. Depois de o Blueprint existir e todos os valores obrigatórios estarem configurados:

1. confirme que `main` ainda é o candidate SHA congelado;
2. confirme que o MySQL private service está live e com disco persistente;
3. confirme que o web service está ligado ao repositório/branch canônicos;
4. dispare o deploy manual do web service;
5. o build deve concluir;
6. o pre-deploy executa `payments-migrate.mjs` através do wrapper de MySQL;
7. só prossiga se aparecer `PAYMENTS-PREDEPLOY` v2 com `status: pass`;
8. aguarde `/readyz` ficar ready antes de executar acceptance.

O pre-deploy aplica Ordering M151 + ticketing reservation e Financial M145. Uma falha aborta o novo deploy antes de trocar tráfego.

## Release identity e smoke

Após o deploy, rode:

```bash
MORRO_V2_BASE_URL=https://<host-staging> pnpm payments:render:smoke
```

O smoke exige:

- `/healthz` HTTP 200 e `status=live`;
- `/readyz` HTTP 200 e `readiness=ready`;
- `x-release-sha` presente e igual entre health/readiness;
- `x-release-version` presente;
- `x-deployment-id` presente;
- `x-correlation-id` presente.

O `x-release-sha` deve ser exatamente o candidate congelado. Divergência é **NO-GO**.

## Acceptance Mercado Pago

Somente depois de health/readiness/release identity passarem:

1. executar `pnpm payments:mercado-pago:preflight` com usuário/valor de teste aprovados;
2. confirmar checkout sandbox e origin exata;
3. concluir pagamento de teste;
4. receber webhook com assinatura válida;
5. executar authoritative readback do Payment;
6. comprovar reconciliation de estado, identidade, valor e moeda;
7. comprovar persistência do verified result antes do ledger;
8. comprovar replay idempotente;
9. executar refund controlado;
10. repetir readback/reconciliation após refund.

Nenhum passo autoriza produção.

## Critérios de NO-GO

Interrompa a certificação se ocorrer qualquer um destes pontos:

- origem Git/branch diferente do repositório canônico e `main`;
- candidate SHA diferente do aprovado;
- qualquer tentativa de reutilizar o Postgres legado como MySQL;
- private MySQL indisponível ou sem persistência;
- collision entre schemas de Auth/Ordering/Financial/Affiliates;
- pre-deploy de migration falhar;
- `/readyz` diferente de 200/ready;
- release identity ausente ou divergente;
- Mercado Pago fora de `test`;
- segredo em log/browser/evidência;
- webhook não verificável;
- reconciliation divergente;
- refund não idempotente.

## Rollback

Durante acceptance, o staging legado permanece sem alteração. Se o V2 falhar:

1. não promova tráfego nem produção;
2. preserve logs e evidências do deploy V2;
3. mantenha os bancos V2 para diagnóstico, sem operações destrutivas;
4. continue usando o staging legado apenas como referência/rollback operacional;
5. corrija a causa em PR e gere um novo candidate SHA; nunca force a identidade do release antigo.

## Estado de aceitação

Antes de completar os passos externos:

```text
CI_VERIFIED / STAGING_INFRA_PREPARED / STAGING_VERIFICATION_REQUIRED
```

Somente após deploy do SHA exato, smoke, migrations, provider test lifecycle e readbacks é permitido promover para `STAGING_VERIFIED` e `PROVIDER_VERIFIED`.
