# Render + Mercado Pago — migração controlada da V1 para a V2

## Objetivo

Reutilizar a infraestrutura Render e as credenciais de pagamento já validadas operacionalmente na V1 sem copiar segredos para o GitHub, sem interromper a V1 durante a validação e sem enfraquecer a autoridade financeira da V2.

A V2 mantém a cadeia de autoridade:

```text
Business handoff -> Ordering -> Financial -> Mercado Pago
                                      ^          |
                                      |          v
                         verified result <- webhook/readback
```

Business e browser não recebem Access Token, segredo de webhook nem autoridade para confirmar pagamento.

## Regra de segurança

Nunca copie um Access Token ou segredo de webhook para:

- GitHub;
- `.env.example`;
- código-fonte;
- PR, issue ou comentário;
- bundle `VITE_*`/browser;
- logs ou evidências de QA.

Os segredos devem permanecer em Environment/Secrets do Render.

## Estado da V1

A V1 declara no seu Blueprint os nomes externos:

- `BUSINESS_PAYMENT_API_TOKEN`;
- `BUSINESS_PAYMENT_WEBHOOK_SECRET`;
- `BUSINESS_PAYMENT_API_URL`.

Na V2 os nomes canônicos são:

- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `MERCADO_PAGO_CHECKOUT_ORIGINS`;
- `MERCADO_PAGO_CHECKOUT_MODE`.

Durante a migração, o adapter V2 aceita temporariamente os dois primeiros nomes legados da V1 como fallback server-only. Isso existe apenas para permitir cutover sem exposição de segredo. Depois da validação, copie os valores para os nomes canônicos e remova os aliases antigos do serviço V2.

`BUSINESS_PAYMENT_API_URL` não é reutilizado pela implementação V2. O adapter Mercado Pago fixa a API server-side em `https://api.mercadopago.com/`, eliminando endpoint de provider configurável por segredo.

## Sequência no Render

### 1. Preservar V1

Não altere nem desligue o serviço V1 antes do aceite completo da V2. Ele é o rollback operacional durante a migração.

### 2. Criar serviço V2 separado

Use `render.yaml` da V2 para criar `morro-digital-v2`.

O serviço deve permanecer com uma única réplica enquanto o rate limit distribuído não estiver configurado.

### 3. Configurar persistência e autoridade V2

Cadastre no serviço V2:

- `ORDERING_DATABASE_URL`;
- `FINANCIAL_DATABASE_URL`;
- `ORDERING_PRICING_CATALOG_JSON`;
- `PAYMENTS_RETURN_URL_ORIGINS`;
- demais segredos server-only exigidos pelo Blueprint.

Ordering e Financial devem permanecer em bancos/usuários com ownership separado conforme o contrato de ambiente.

### 4. Migrar os segredos do provider dentro do Render

Preferência:

1. copie o valor secreto de pagamento da V1 diretamente para `MERCADO_PAGO_ACCESS_TOKEN` do serviço V2;
2. copie o segredo de webhook correspondente para `MERCADO_PAGO_WEBHOOK_SECRET`;
3. não revele os valores durante a cópia.

Se o painel/processo operacional não permitir a migração canônica de imediato, use temporariamente no serviço V2:

- `BUSINESS_PAYMENT_API_TOKEN`;
- `BUSINESS_PAYMENT_WEBHOOK_SECRET`.

O runtime V2 tratará esses nomes como aliases somente no servidor.

### 5. Manter Checkout em teste

Configure inicialmente:

```text
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
```

Não mude para `production` até concluir todos os gates deste documento.

### 6. Configurar allowlist do checkout

`MERCADO_PAGO_CHECKOUT_ORIGINS` deve conter somente origins HTTPS realmente retornadas pelo Mercado Pago para a conta/ambiente validado.

Não use wildcard e não copie uma origin presumida. Execute uma preferência controlada e registre apenas a origin do `sandbox_init_point`/`init_point` esperado.

### 7. Configurar callback

Configure:

```text
PAYMENTS_WEBHOOK_URL=https://<host-v2>/api/payments/v1/webhooks/sandbox
```

O pathname legado `webhooks/sandbox` é mantido temporariamente para preservar os contratos M141 existentes durante a substituição do adapter. Ele recebe assinatura Mercado Pago quando `PAYMENTS_PROVIDER_MODE=mercado_pago`.

No Mercado Pago, configure a notificação correspondente para o mesmo URL V2.

### 8. Executar provider E2E

Validar, nesta ordem:

1. criação de checkout a partir do handoff Business/Ordering;
2. retorno de URL Mercado Pago dentro da allowlist;
3. ausência de token/segredo no browser e em logs;
4. pagamento de teste;
5. webhook com assinatura válida;
6. notificação `pending` reconhecida sem fabricar resultado financeiro terminal;
7. `approved`/estado terminal confirmado por readback do provider;
8. persistência do verified payment result;
9. ledger/accounting derivado somente do resultado verificado;
10. polling do browser convergindo para resultado persistido;
11. refund controlado, quando aplicável;
12. reconciliation GET confirmando identidade, valor, moeda e estado;
13. replay de webhook idempotente;
14. assinatura inválida negada;
15. `external_reference` substituída negada.

### 9. Promover nomes canônicos

Depois do E2E:

- confirme `MERCADO_PAGO_ACCESS_TOKEN` configurado;
- confirme `MERCADO_PAGO_WEBHOOK_SECRET` configurado;
- remova `BUSINESS_PAYMENT_API_TOKEN` da V2;
- remova `BUSINESS_PAYMENT_WEBHOOK_SECRET` da V2.

A V1 pode continuar com seus próprios nomes enquanto permanecer disponível para rollback.

### 10. Produção

Somente depois de provider E2E, banco/migrations, smoke browser, observabilidade e rollback aprovados:

```text
MERCADO_PAGO_CHECKOUT_MODE=production
```

Revalide o `init_point`, a allowlist, o webhook e o readback com o ambiente de produção antes do GO.

## Critérios de rollback

Retorne tráfego para a V1 ou desabilite o checkout V2 se ocorrer qualquer um dos seguintes:

- assinatura de webhook não validável;
- divergência entre `external_reference` e Payment V2;
- divergência de valor/moeda;
- Payment marcado como confirmado sem verified result persistido;
- replay gerando dupla contabilização;
- refund não idempotente;
- provider readback indisponível de forma persistente;
- segredo visível em log/browser;
- readiness/dependências V2 indisponíveis.

Não apague Payments, ledger, webhooks ou evidências financeiras durante rollback.

## Encerramento da migração

A V1 só deve ser aposentada depois de uma janela operacional estável da V2, com provider real validado, observabilidade ativa e rollback testado. Até lá, V1 e V2 permanecem serviços distintos e nenhum segredo precisa passar pelo repositório.
