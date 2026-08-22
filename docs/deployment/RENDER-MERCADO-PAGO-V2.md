# Render + Mercado Pago — migração controlada da V1 para a V2

## Objetivo

Reutilizar o ambiente Render e, quando a V1 estiver ligada diretamente ao Mercado Pago, reutilizar as mesmas credenciais já configuradas no serviço V1 sem expor, copiar manualmente ou rotacionar segredos.

A V1 permanece intacta como rollback até todos os gates externos da V2 passarem.

```text
Business handoff -> Ordering -> Financial -> Mercado Pago
                                      ^          |
                                      |          v
                         verified result <- webhook/readback
```

Business e browser nunca recebem Access Token, segredo de webhook ou autoridade para confirmar pagamento.

## Estado implementado

A V2 possui:

- adapter Checkout Pro;
- checkout com valores vindos da autoridade Ordering/Financial;
- refund idempotente;
- readback/reconciliation do Payment;
- webhook autenticado por `x-signature`, `x-request-id` e `data.id` da query string;
- verificação de consistência entre `data.id` da query e do corpo;
- readback antes de promover resultado financeiro terminal;
- ACK HTTP 200 para notificação Mercado Pago autenticamente assinada;
- eventos `pending` reconhecidos sem fabricar resultado terminal;
- verified payment result persistido antes de accounting;
- proteção contra replay/collision;
- allowlist estrita de origins do checkout;
- `/healthz` e `/readyz`;
- release/correlation/deployment identity;
- graceful shutdown com readiness transition e bounded drain;
- Auth de produção com security state MySQL durável;
- pre-deploy de migrations Ordering/Financial;
- smoke reproduzível de Render;
- preflight reproduzível do provider Mercado Pago.

Valor, moeda, identidade e estado do provider são conferidos no reconciliation e no provider E2E usando os campos documentados do Payment (`transaction_amount`, `currency_id`, `external_reference`). A implementação não depende de propagação não documentada de metadata da preferência para o Payment.

## Segurança dos segredos

Nunca registre Access Token ou segredo de webhook em GitHub, `.env.example`, PR/issue, bundle `VITE_*`, logs ou evidências de QA.

Os segredos permanecem no Render.

## Reuso automático da V1 com verificação fail-closed

A V1 declara:

- `BUSINESS_PAYMENT_API_URL`;
- `BUSINESS_PAYMENT_API_TOKEN`;
- `BUSINESS_PAYMENT_WEBHOOK_SECRET`.

O Blueprint V2 referencia as três variáveis diretamente do serviço `morro-digital` no mesmo workspace:

```text
morro-digital/BUSINESS_PAYMENT_API_URL
  -> morro-digital-v2/V1_PAYMENT_PROVIDER_API_URL

morro-digital/BUSINESS_PAYMENT_API_TOKEN
  -> morro-digital-v2/MERCADO_PAGO_ACCESS_TOKEN

morro-digital/BUSINESS_PAYMENT_WEBHOOK_SECRET
  -> morro-digital-v2/MERCADO_PAGO_WEBHOOK_SECRET
```

Antes do deploy, `payments-migrate.mjs` exige HTTPS e o host exato `api.mercadopago.com` para `V1_PAYMENT_PROVIDER_API_URL`.

Se a V1 estiver usando um gateway/intermediário, o pre-deploy termina com:

```text
V1_PAYMENT_PROVIDER_IS_NOT_DIRECT_MERCADO_PAGO
```

Nesse caso nenhum segredo é enviado ao Mercado Pago pela V2. O deploy permanece bloqueado até a credencial direta correta ser configurada.

O segredo legado `BUSINESS_PAYMENT_WEBHOOK_SECRET` é somente candidato a reuso. A compatibilidade com a assinatura oficial Mercado Pago precisa ser comprovada pelo simulador/E2E. Se não for compatível, corrija somente `MERCADO_PAGO_WEBHOOK_SECRET` no serviço V2 com o segredo oficial da mesma aplicação Mercado Pago.

## Blueprint Render da V2

Serviço canônico:

```text
morro-digital-v2
```

Fluxo operacional:

```text
build -> preDeploy config/migrations -> start -> /readyz
```

O Blueprint usa:

- `preDeployCommand` para provider identity + migrations + DB readiness;
- `healthCheckPath: /readyz`;
- `maxShutdownDelaySeconds: 30`;
- uma única réplica enquanto rate limit distribuído não existir;
- `MERCADO_PAGO_CHECKOUT_MODE=test` inicialmente;
- `MERCADO_PAGO_CHECKOUT_MODE=test` exige `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true`, registrando que o Access Token foi conferido diretamente em **Testes > Credenciais de teste**;
- Checkout Pro usa o `init_point` retornado pelo provider;
- a allowlist inicial aceita somente `https://www.mercadopago.com` e `https://www.mercadopago.com.br`.

O adapter rejeita TEST mode sem confirmação operacional explícita antes da preferência e rejeita qualquer checkout origin fora da allowlist. Se o provider devolver outra origin HTTPS, interrompa o gate e valide essa origin contra documentação oficial antes de alterar a allowlist. Não use wildcard.

A identidade de release usa automaticamente variáveis do Render (`RENDER_GIT_COMMIT`, branch e identidade service/instance), mantendo `MORRO_RELEASE_*` como override explícito.

## Valores que o operador precisa configurar no Render

### Auth

- `DASHBOARD_USERS_JSON`;
- `DASHBOARD_AUTH_ORIGIN`;
- `AUTH_DATABASE_URL`;
- `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED`.

`DASHBOARD_AUTH_SECRET` é gerado pelo Blueprint.

Se `DASHBOARD_USERS_JSON` possuir um usuário `admin`, defina `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=true` apenas se a autoridade global desse administrador for intencional. Caso contrário, mantenha `false` e ajuste os usuários.

### Ordering / Financial

- `ORDERING_DATABASE_URL`;
- `FINANCIAL_DATABASE_URL`;
- `ORDERING_PRICING_CATALOG_JSON`.

Ordering e Financial devem manter ownership/bancos separados conforme a arquitetura V2.

### Checkout

- `PAYMENTS_RETURN_URL_ORIGINS`;
- `PAYMENTS_WEBHOOK_URL`.

Não é necessário preencher manualmente `MERCADO_PAGO_CHECKOUT_ORIGINS` para o primeiro deploy de teste: o Blueprint já fornece `https://www.mercadopago.com,https://www.mercadopago.com.br`. O modo `test` só prossegue com `MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true`, após o operador conferir o Access Token na tela **Testes > Credenciais de teste**; não amplie a allowlist por tentativa e erro.

O Blueprint gera automaticamente:

- `PAYMENTS_STATUS_TOKEN_SECRET`;
- `PAYMENTS_HANDOFF_SECRET`.

## Sequência exata no Render

### 1. Não alterar a V1

Mantenha `morro-digital` funcionando. Não apague variáveis nem desligue o serviço.

### 2. Criar/sincronizar o Blueprint V2

Crie `morro-digital-v2` no **mesmo workspace** da V1 usando o `render.yaml` deste branch/commit aprovado.

Durante o sync, confirme que as três referências `fromService` foram resolvidas. Não abra nem copie os valores secretos.

### 3. Preencher Auth

```text
DASHBOARD_USERS_JSON=<JSON canônico de usuários>
DASHBOARD_AUTH_ORIGIN=https://<host-v2-ou-dominio-final>
AUTH_DATABASE_URL=<MySQL TLS/durável>
DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=false|true
```

### 4. Preencher bancos e catálogo

```text
ORDERING_DATABASE_URL=<MySQL Ordering>
FINANCIAL_DATABASE_URL=<MySQL Financial>
ORDERING_PRICING_CATALOG_JSON=<catálogo canônico aprovado>
```

O pre-deploy aplica Ordering M151 + ticketing reservation e Financial M145 e executa `SELECT 1` nos dois bancos. Qualquer falha aborta o deploy antes de receber tráfego.

### 5. Configurar retorno e webhook

```text
PAYMENTS_RETURN_URL_ORIGINS=https://<host-v2>
PAYMENTS_WEBHOOK_URL=https://<host-v2>/api/payments/v1/webhooks/sandbox
```

O Blueprint já mantém:

```text
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
MERCADO_PAGO_CHECKOUT_ORIGINS=https://www.mercadopago.com,https://www.mercadopago.com.br
```

### 6. Executar o deploy

O deploy só deve prosseguir se o log de pre-deploy terminar com um registro `PAYMENTS-PREDEPLOY` versão 2 com `status: pass`.

O output nunca contém Access Token ou segredo de webhook.

### 7. Validar health/readiness

```bash
MORRO_V2_BASE_URL=https://<host-v2> pnpm payments:render:smoke
```

O gate exige `/healthz` 200, `/readyz` 200/ready, release SHA/version/deployment identity, correlation ID e ausência de critical readiness failures.

### 8. Executar preflight Mercado Pago

Ainda em modo `test`, forneça apenas para o comando de validação:

```text
MERCADO_PAGO_E2E_PAYER_EMAIL=<email de usuário de teste aprovado>
MERCADO_PAGO_E2E_AMOUNT_MINOR_UNITS=<valor de teste aprovado em centavos>
```

Execute:

```bash
pnpm payments:mercado-pago:preflight
```

O comando cria uma preferência Checkout Pro controlada e retorna `paymentId`, ID da preferência, origin e checkout URL. Nenhuma cobrança é realizada automaticamente.

A origin retornada deve coincidir exatamente com `MERCADO_PAGO_CHECKOUT_ORIGINS`. Uma diferença é `NO-GO` até revisão contra documentação oficial; não amplie a allowlist por tentativa e erro.

### 9. Testar o webhook

URL:

```text
https://<host-v2>/api/payments/v1/webhooks/sandbox
```

A integração valida `x-signature`, `x-request-id`, `data.id` da query string, consistência query/corpo, janela temporal e faz readback do Payment no Mercado Pago antes de produzir estado terminal.

Use primeiro o simulador oficial de Webhooks da aplicação Mercado Pago e depois um pagamento de teste do provider.

Se assinatura válida não for aceita e o provider URL/token estiverem corretos, valide o segredo oficial da aplicação e substitua apenas `MERCADO_PAGO_WEBHOOK_SECRET` no V2.

### 10. Validar lifecycle completo

A evidência final deve provar:

1. Business/Ordering cria checkout;
2. Financial cria a preferência Mercado Pago;
3. checkout URL está na allowlist;
4. pagamento de teste é concluído;
5. webhook assinado chega ao endpoint V2;
6. `pending` não cria resultado terminal;
7. estado terminal é confirmado por readback;
8. verified payment result é persistido;
9. ledger é derivado uma única vez;
10. browser converge para o resultado persistido;
11. replay não duplica contabilização;
12. assinatura inválida recebe 401;
13. `data.id` query/body divergente é rejeitado;
14. `external_reference` divergente é rejeitado;
15. reconciliation confere estado/identidade/valor/moeda;
16. refund controlado é idempotente.

## Promoção para produção

Somente depois de todos os gates acima e dos gates oficiais de CI/browser/Platform:

1. trocar `MERCADO_PAGO_CHECKOUT_MODE=production`;
2. trocar `MERCADO_PAGO_CHECKOUT_ORIGINS` pela origin HTTPS exata do `init_point` produtivo realmente retornado pela conta, sem sandbox e sem wildcard;
3. novo deploy;
4. revalidar `/healthz` e `/readyz`;
5. validar webhook/readback produtivo;
6. observar logs/alertas;
7. manter V1 disponível durante a janela de rollback.

## Critérios de rollback / NO-GO

Não promova ou retorne tráfego para V1 se ocorrer qualquer um dos seguintes:

- `fromService` não resolver uma variável;
- `V1_PAYMENT_PROVIDER_IS_NOT_DIRECT_MERCADO_PAGO`;
- migration/pre-deploy falhar;
- `/readyz` != 200;
- identidade de release ausente;
- assinatura de webhook não validável;
- divergência query/body `data.id`;
- divergência `external_reference`;
- reconciliation encontrar divergência de valor/moeda;
- Payment confirmado sem verified result persistido;
- replay gerar dupla contabilização;
- refund não idempotente;
- provider readback persistentemente indisponível;
- segredo aparecer em browser/log/evidência;
- Auth security state ou bancos ficarem indisponíveis.

Não apague Payments, ledger, webhooks ou evidências financeiras durante rollback.

## Estado de aceitação

Até executar Render + Mercado Pago reais e os gates de CI:

```text
CODE_PREPARED / EXTERNAL_VALIDATION_REQUIRED
```

Não promover para `PROVIDER_VERIFIED`, `PRODUCTION_READY` ou V2 global GO sem essas evidências.
