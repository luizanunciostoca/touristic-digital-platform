# Render + Mercado Pago — migração controlada da V1 para a V2

## Objetivo

Reutilizar o ambiente Render e, quando a V1 estiver realmente ligada diretamente ao Mercado Pago, reutilizar as mesmas credenciais já configuradas no serviço V1 sem expor, copiar manualmente ou rotacionar segredos.

A V1 permanece intacta como rollback até todos os gates externos da V2 passarem.

```text
Business handoff -> Ordering -> Financial -> Mercado Pago
                                      ^          |
                                      |          v
                         verified result <- webhook/readback
```

Business e browser nunca recebem Access Token, segredo de webhook ou autoridade para confirmar pagamento.

## Estado implementado no código

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
- allowlist exata de origins do checkout;
- `/healthz` e `/readyz`;
- release/correlation/deployment identity;
- graceful shutdown com readiness transition e bounded drain;
- Auth de produção com security state MySQL durável;
- pre-deploy de migrations Ordering/Financial;
- smoke reproduzível de Render;
- preflight reproduzível do provider Mercado Pago.

## Segurança dos segredos

Nunca registre Access Token ou segredo de webhook em:

- GitHub;
- `.env.example`;
- PR/issue/comentário;
- browser ou variável `VITE_*`;
- logs/evidências de QA.

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

Antes do deploy, `payments-migrate.mjs` verifica que `V1_PAYMENT_PROVIDER_API_URL` usa HTTPS e o host exato `api.mercadopago.com`.

Se a V1 estiver usando um gateway/intermediário, o pre-deploy termina com:

```text
V1_PAYMENT_PROVIDER_IS_NOT_DIRECT_MERCADO_PAGO
```

Nesse caso nenhum segredo é enviado ao Mercado Pago pela V2. O deploy fica bloqueado até a credencial direta correta ser configurada.

Essa regra remove a necessidade de presumir que um token genérico da V1 seja um Access Token Mercado Pago.

## Blueprint Render da V2

O serviço canônico é:

```text
morro-digital-v2
```

Configuração operacional preparada:

```text
build -> preDeploy migration/config gate -> start -> /readyz
```

O Blueprint usa:

- `preDeployCommand`: migrations + provider identity/config validation;
- `healthCheckPath: /readyz`;
- `maxShutdownDelaySeconds: 30`;
- uma única réplica enquanto rate limit distribuído não existir;
- `MERCADO_PAGO_CHECKOUT_MODE=test` inicialmente.

A identidade de release usa automaticamente os valores fornecidos pelo Render (`RENDER_GIT_COMMIT`, branch e identidade da instância/serviço), com `MORRO_RELEASE_*` disponível somente como override explícito.

## Valores que o operador precisa configurar no Render

Os seguintes valores são próprios da V2 e não podem ser inferidos com segurança da V1:

### Auth

- `DASHBOARD_USERS_JSON`;
- `DASHBOARD_AUTH_ORIGIN`;
- `AUTH_DATABASE_URL`;
- `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED`.

`DASHBOARD_AUTH_SECRET` é gerado pelo Blueprint.

Se `DASHBOARD_USERS_JSON` possuir um usuário `admin`, `DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=true` só deve ser definido se a autoridade global desse administrador for intencional. Caso contrário a readiness permanece fechada.

### Ordering / Financial

- `ORDERING_DATABASE_URL`;
- `FINANCIAL_DATABASE_URL`;
- `ORDERING_PRICING_CATALOG_JSON`.

Ordering e Financial devem manter ownership/bancos separados conforme a arquitetura V2.

### Checkout

- `PAYMENTS_RETURN_URL_ORIGINS`;
- `PAYMENTS_WEBHOOK_URL`;
- `MERCADO_PAGO_CHECKOUT_ORIGINS`.

O Blueprint gera automaticamente:

- `PAYMENTS_STATUS_TOKEN_SECRET`;
- `PAYMENTS_HANDOFF_SECRET`.

## Sequência exata no Render

### 1. Não alterar a V1

Mantenha `morro-digital` funcionando. Não apague variáveis nem desligue o serviço.

### 2. Criar/sincronizar o Blueprint V2

Crie `morro-digital-v2` no **mesmo workspace** da V1 usando o `render.yaml` deste branch/commit aprovado.

Durante o sync, confirme que as três referências `fromService` foram resolvidas. Não abra nem copie o valor secreto.

### 3. Preencher Auth

Configure:

```text
DASHBOARD_USERS_JSON=<JSON canônico de usuários>
DASHBOARD_AUTH_ORIGIN=https://<host-v2-ou-dominio-final>
AUTH_DATABASE_URL=<MySQL TLS/durável>
DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=false|true
```

### 4. Preencher bancos e catálogo

Configure:

```text
ORDERING_DATABASE_URL=<MySQL Ordering>
FINANCIAL_DATABASE_URL=<MySQL Financial>
ORDERING_PRICING_CATALOG_JSON=<catálogo canônico aprovado>
```

O pre-deploy aplica Ordering M151 + ticketing reservation e Financial M145, e executa `SELECT 1` nos dois bancos. Qualquer falha aborta o deploy antes de receber tráfego.

### 5. Configurar origins e webhook

Configure inicialmente:

```text
PAYMENTS_RETURN_URL_ORIGINS=https://<host-v2>
PAYMENTS_WEBHOOK_URL=https://<host-v2>/api/payments/v1/webhooks/sandbox
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
```

`MERCADO_PAGO_CHECKOUT_ORIGINS` deve conter apenas origins HTTPS efetivamente retornadas pela conta Mercado Pago validada. Não use wildcard.

### 6. Executar o deploy

O deploy só deve prosseguir se o log de pre-deploy terminar com:

```json
{"contract":"PAYMENTS-PREDEPLOY","contractVersion":2,"status":"pass"}
```

O output nunca contém Access Token ou segredo de webhook.

### 7. Validar health/readiness

Com o endereço HTTPS do serviço:

```bash
MORRO_V2_BASE_URL=https://<host-v2> pnpm payments:render:smoke
```

O gate exige:

- `/healthz` HTTP 200;
- `/readyz` HTTP 200;
- readiness `ready`;
- release SHA configurado;
- release version/deployment identity configurados;
- correlation ID;
- ausência de critical readiness failures.

### 8. Executar preflight Mercado Pago

Ainda em modo `test`, configure apenas para o comando de validação:

```text
MERCADO_PAGO_E2E_PAYER_EMAIL=<email de usuário de teste aprovado>
MERCADO_PAGO_E2E_AMOUNT_MINOR_UNITS=<valor de teste aprovado em centavos>
```

Execute:

```bash
pnpm payments:mercado-pago:preflight
```

O comando cria uma preferência Checkout Pro em modo de teste usando o adapter real e retorna:

- `paymentId` interno de teste;
- ID da preferência;
- origin do checkout;
- checkout URL para completar o pagamento com usuário de teste.

Nenhuma cobrança é realizada automaticamente pelo script.

### 9. Testar o webhook

A URL deve ser:

```text
https://<host-v2>/api/payments/v1/webhooks/sandbox
```

A integração valida:

- `x-signature`;
- `x-request-id`;
- `data.id` da query string;
- consistência do mesmo ID no corpo;
- janela temporal da assinatura;
- readback do Payment no Mercado Pago;
- identidade `external_reference`;
- estado terminal antes de contabilizar.

Use o simulador oficial de Webhooks da aplicação Mercado Pago e, depois, um pagamento de teste real do provider.

### 10. Validar lifecycle completo

A evidência final deve provar:

1. Business/Ordering cria checkout;
2. Financial cria a preferência Mercado Pago;
3. checkout URL está na allowlist;
4. pagamento de teste é concluído;
5. webhook assinado chega ao endpoint V2;
6. `pending` não cria resultado financeiro terminal;
7. `approved` é confirmado por readback;
8. verified payment result é persistido;
9. ledger é derivado uma única vez;
10. polling/browser converge para o resultado persistido;
11. replay não duplica contabilização;
12. assinatura inválida recebe 401;
13. `data.id` query/body divergente é rejeitado;
14. `external_reference` divergente é rejeitado;
15. reconciliation confere estado/identidade/valor/moeda;
16. refund controlado é idempotente.

## Promoção para produção

Somente depois de todos os gates acima e dos gates oficiais de CI/browser/Platform:

```text
MERCADO_PAGO_CHECKOUT_MODE=production
```

Depois da alteração:

1. novo deploy;
2. `/healthz` e `/readyz` novamente;
3. confirmar `init_point` de produção e allowlist;
4. validar webhook/readback de produção;
5. observar logs/alertas;
6. manter V1 disponível durante a janela de rollback.

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
- divergência de valor/moeda;
- Payment confirmado sem verified result persistido;
- replay gerar dupla contabilização;
- refund não idempotente;
- provider readback persistentemente indisponível;
- segredo aparecer em browser/log/evidência;
- Auth security state ou bancos ficarem indisponíveis.

Não apague Payments, ledger, webhooks ou evidências financeiras durante rollback.

## Encerramento

A implementação de código pode ser considerada pronta para validação externa quando os testes/quality do head passarem. A integração só é `PROVIDER_VERIFIED` depois dos passos Render + Mercado Pago acima. A V1 só deve ser aposentada depois de uma janela operacional estável da V2, observabilidade ativa e rollback testado.
