# Render + Mercado Pago — migração controlada da V1 para a V2

## Objetivo

Reutilizar a infraestrutura Render e as mesmas credenciais de pagamento já configuradas na V1 sem expor, duplicar manualmente ou rotacionar os valores secretos, sem interromper a V1 durante a validação e sem enfraquecer a autoridade financeira da V2.

A estratégia de migração aprovada é **no-rotation**: V1 e V2 usam a mesma identidade/credenciais do provider durante a janela de transição. A V1 permanece disponível como rollback até a conclusão dos gates da V2.

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

Os segredos permanecem em Environment/Secrets do Render.

## Reuso automático das credenciais da V1

A V1 declara no Render os nomes externos:

- `BUSINESS_PAYMENT_API_TOKEN`;
- `BUSINESS_PAYMENT_WEBHOOK_SECRET`;
- `BUSINESS_PAYMENT_API_URL`.

A V2 usa internamente os nomes canônicos:

- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `MERCADO_PAGO_CHECKOUT_ORIGINS`;
- `MERCADO_PAGO_CHECKOUT_MODE`.

O `render.yaml` da V2 usa `fromService.envVarKey` para obter os dois valores secretos diretamente do serviço Render V1 `morro-digital`:

```yaml
- key: MERCADO_PAGO_ACCESS_TOKEN
  fromService:
    type: web
    name: morro-digital
    envVarKey: BUSINESS_PAYMENT_API_TOKEN

- key: MERCADO_PAGO_WEBHOOK_SECRET
  fromService:
    type: web
    name: morro-digital
    envVarKey: BUSINESS_PAYMENT_WEBHOOK_SECRET
```

Portanto:

- o mesmo Access Token continua sendo a fonte da V1 e é injetado na V2 pelo Render;
- o mesmo segredo de webhook continua sendo a fonte da V1 e é injetado na V2 pelo Render;
- os valores não aparecem no Blueprint nem no GitHub;
- não é necessário copiar/colar os valores manualmente;
- não é necessário gerar credenciais novas apenas para a migração;
- a V1 permanece intacta e continua apta a rollback.

A referência automática depende de o serviço existente no mesmo workspace Render se chamar `morro-digital` e possuir as duas variáveis legadas configuradas. Se o nome real do serviço V1 for diferente, ajuste apenas `fromService.name`; nunca copie o valor secreto para o repositório.

`BUSINESS_PAYMENT_API_URL` não é usado pela implementação V2. O adapter Mercado Pago fixa a API server-side em `https://api.mercadopago.com/`, eliminando endpoint configurável no runtime V2.

## Sequência no Render

### 1. Preservar V1

Não altere nem desligue o serviço V1 antes do aceite completo da V2. Ele é o rollback operacional durante a migração.

### 2. Criar serviço V2 separado

Use `render.yaml` da V2 para criar `morro-digital-v2` no mesmo workspace Render da V1.

O serviço deve permanecer com uma única réplica enquanto o rate limit distribuído não estiver configurado.

Durante a criação/sync do Blueprint, o Render deve resolver automaticamente:

```text
morro-digital/BUSINESS_PAYMENT_API_TOKEN
        -> morro-digital-v2/MERCADO_PAGO_ACCESS_TOKEN

morro-digital/BUSINESS_PAYMENT_WEBHOOK_SECRET
        -> morro-digital-v2/MERCADO_PAGO_WEBHOOK_SECRET
```

Nenhum valor secreto deve ser digitado no GitHub ou incluído no YAML.

### 3. Configurar persistência e autoridade V2

Cadastre no serviço V2 os valores que não existem na V1 e são próprios da arquitetura V2:

- `ORDERING_DATABASE_URL`;
- `FINANCIAL_DATABASE_URL`;
- `ORDERING_PRICING_CATALOG_JSON`;
- `PAYMENTS_RETURN_URL_ORIGINS`;
- `DASHBOARD_USERS_JSON`;
- `DASHBOARD_AUTH_ORIGIN`;
- `MERCADO_PAGO_CHECKOUT_ORIGINS`;
- `PAYMENTS_WEBHOOK_URL`;
- demais valores server-only exigidos pelo Blueprint.

Ordering e Financial devem permanecer em bancos/usuários com ownership separado conforme o contrato de ambiente.

### 4. Confirmar herança dos segredos sem revelá-los

No serviço `morro-digital-v2`, confirme apenas que as variáveis abaixo estão resolvidas/configuradas:

- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`.

Não registre nem copie seus valores em evidências. O critério de aceite é presença + provider E2E bem-sucedido, não exposição visual do segredo.

Se o Blueprint não conseguir resolver uma variável `fromService`, trate isso como falha de configuração e não habilite checkout. Corrija o nome do serviço V1 ou da variável de origem; não substitua por segredo hard-coded.

### 5. Manter Checkout em teste

Configure inicialmente:

```text
PAYMENTS_PROVIDER_MODE=mercado_pago
MERCADO_PAGO_CHECKOUT_MODE=test
```

Não mude para `production` até concluir todos os gates deste documento.

### 6. Configurar allowlist do checkout

`MERCADO_PAGO_CHECKOUT_ORIGINS` deve conter somente origins HTTPS realmente retornadas pelo Mercado Pago para a conta/ambiente validado.

Não use wildcard. Execute uma preferência controlada e registre apenas a origin do `sandbox_init_point`/`init_point` esperado.

### 7. Configurar callback

Configure:

```text
PAYMENTS_WEBHOOK_URL=https://<host-v2>/api/payments/v1/webhooks/sandbox
```

O pathname legado `webhooks/sandbox` é mantido temporariamente para preservar os contratos M141 existentes durante a substituição do adapter. Ele recebe assinatura Mercado Pago quando `PAYMENTS_PROVIDER_MODE=mercado_pago`.

A assinatura secreta do Mercado Pago pertence à aplicação de integração. A V2 reutiliza o mesmo segredo da aplicação já configurado na V1; o endpoint V2 deve ser validado com uma notificação real/simulada antes do GO.

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

### 9. Confirmar reuso da identidade do provider

Depois do E2E:

- confirme que V1 continua operacional;
- confirme que V2 usa o mesmo provider/account esperado;
- confirme `MERCADO_PAGO_ACCESS_TOKEN` resolvido por `fromService`;
- confirme `MERCADO_PAGO_WEBHOOK_SECRET` resolvido por `fromService`;
- confirme que nenhum segredo real foi adicionado ao repositório;
- mantenha a V1 intacta durante a janela de rollback.

### 10. Produção

Somente depois de provider E2E, banco/migrations, smoke browser, observabilidade e rollback aprovados:

```text
MERCADO_PAGO_CHECKOUT_MODE=production
```

Revalide o `init_point`, a allowlist, o webhook e o readback com o ambiente de produção antes do GO.

## Critérios de rollback

Retorne tráfego para a V1 ou desabilite o checkout V2 se ocorrer qualquer um dos seguintes:

- `fromService` não resolver um segredo obrigatório;
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

A V1 só deve ser aposentada depois de uma janela operacional estável da V2, com provider real validado, observabilidade ativa e rollback testado. Até lá, V1 e V2 permanecem serviços distintos, mas compartilham a mesma identidade/credenciais do provider dentro do Render sem expor os valores secretos.
