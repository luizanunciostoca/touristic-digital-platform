# Payments / Ordering / Financial — V1 Baseline (M135)

## Finalidade

Congelar o comportamento financeiro/comercial observável já existente na V1 antes de iniciar `FEATURE-0009`, separando claramente:

- o que precisa ser **preservado** por equivalência;
- o que pertence ao **Business** e já foi separado em M61/M62;
- o que pertence a **Payments/Ordering/Financial**;
- o que a arquitetura V2 exige como **novo hardening de produção**, mas a V1 não possuía.

Nenhum provider, SDK ou persistência financeira é portado neste milestone. M135 é documentação de baseline e dependency graph.

## Fontes congeladas

V1 oficial:

`luizidebook/morro-de-sao-paulo-digital@60746fd7fed97b805758b37adfdbe3bad2582bfe`

Arquivos auditados:

- `server/business-checkout.js`;
- `server/__tests__/business-checkout.test.js`;
- `js/onboarding/runtime/business-checkout-client.js`.

Seam V2 já existente:

- `docs/qa/BUSINESS-M61-EVIDENCE.md`;
- `@touristic/business/onboarding-commercial-conversion`;
- lifecycle browser comercial fechado em M62.

Checkpoint V2 de abertura da Wave 8:

`luizidebook/touristic-digital-platform@9ae94f64f7f644a480ae4313d7f2fca32b53c613`

Esse checkpoint contém M134 e Quality Gate pós-merge #1650 verde.

---

## 1. Ownership congelado

### Business continua responsável por

- recomendar/preparar o plano comercial;
- coletar e sanitizar dados do contratante;
- exigir aceites legais obrigatórios;
- transportar versões e timestamps dos aceites;
- produzir o handoff imutável para Payments;
- consumir somente um resultado de pagamento já verificado por Payments.

Business **não** pode:

- chamar provider financeiro;
- criar checkout;
- gerar autoridade de idempotência financeira;
- guardar token público de checkout como estado de domínio;
- abrir/pollar provider como regra de negócio;
- decidir que uma transação está paga;
- escrever ledger;
- calcular split/repasse.

### Payments / Ordering / Financial passa a ser responsável por

- criar e identificar a intenção/pedido financeiro;
- validar plano/preço oficial no servidor;
- criar checkout através de um provider port;
- garantir idempotência durable;
- persistir lifecycle financeiro;
- verificar webhooks/autenticidade do provider;
- decidir o estado financeiro autoritativo;
- publicar resultado verificado para Business;
- registrar eventos/ledger/reconciliação quando esses contratos forem introduzidos;
- nunca depender da UI para autoridade financeira.

---

## 2. Contrato de entrada V1

A V1 normaliza o handoff para:

```text
sessionId       <= 120 chars
planId          <= 80 chars
returnUrl       <= 1000 chars
contractor
  name          <= 160
  email         <= 200, lowercase
  phone         <= 40
  document      <= 40
businessDraft
  demoBusinessId <= 120
  displayName    <= 180
  categoryId     <= 80
  specialty      <= 180
  environment    <= 40
  publishable    boolean
acceptedTerms    max 8
  type           <= 40
  version        <= 100
  acceptedAt     <= 40
```

Regras obrigatórias V1:

1. `sessionId` e `planId` devem existir;
2. nome/e-mail/telefone/documento do contratante devem existir;
3. e-mail deve conter `@`;
4. o Business de origem deve permanecer `environment=sandbox`;
5. o draft de origem não pode ser `publishable`;
6. `terms` e `privacy` devem estar aceitos;
7. plano deve existir na configuração server-side oficial.

Mudanças de validação futura são permitidas como hardening, mas não podem enfraquecer essas garantias.

---

## 3. Pricing authority V1

O browser envia `planId`, mas não é autoridade do preço.

A V1 lê preços de configuração server-side (`BUSINESS_PLANS_JSON`) e resolve:

- `id`;
- `name`;
- `amount`;
- `currency` com fallback `BRL`.

Se o plano não estiver configurado, o checkout falha com `PLAN_NOT_CONFIGURED`/503.

### Decisão V2

Preservar o princípio, não necessariamente o formato de configuração. O servidor/Financial deve possuir a fonte autoritativa do preço; qualquer amount recebido do browser é não confiável.

---

## 4. Idempotência V1

O browser cria uma chave lógica determinística:

```text
business:<sessionId>:<planId>
```

O POST exige `Idempotency-Key`; ausência retorna `IDEMPOTENCY_KEY_REQUIRED`.

O service consulta idempotência **antes** de chamar o provider. Repetir a mesma chave retorna o mesmo checkout e não duplica a chamada externa.

### Limitação V1

A repository de referência é em memória. Idempotência não sobrevive restart/processo múltiplo.

### Decisão V2

A identidade lógica precisa ser preservada ou substituída por uma chave mais forte e documentada, mas o armazenamento deve ser durable e possuir constraint/atomicidade server-side antes de qualquer provider call.

---

## 5. Criação do checkout V1

Pré-condições:

- plano oficial existente;
- provider URL configurada;
- webhook secret configurado;
- fetch/provider adapter disponível.

Identidade interna criada:

```text
checkoutId = bco_<UUID>
publicToken = 24 random bytes → hex
status = PENDING
```

Payload externo V1:

```text
externalReference = checkoutId
amount             = preço oficial server-side
currency           = moeda oficial/fallback BRL
description        = nome do plano
payer              = contractor
returnUrl           = handoff validado
webhookUrl          = PUBLIC_BASE_URL + /api/business-checkout/webhook
metadata
  tutorialSessionId
  demoBusinessId
```

Headers:

- `Content-Type: application/json`;
- `Idempotency-Key` propagada ao provider;
- `Authorization: Bearer ...` somente quando provider token existe.

Provider não configurado → `PAYMENT_NOT_CONFIGURED`/503.

Provider recusa criação → `PAYMENT_PROVIDER_ERROR`/502.

---

## 6. Persistência observável V1

O record V1 possui:

- id interno;
- public token;
- idempotency key;
- tutorial session;
- plan;
- amount/currency;
- contractor;
- business draft;
- accepted terms;
- `PENDING`/`CONFIRMED`;
- provider reference;
- checkout URL;
- timestamps;
- provider payment reference após confirmação;
- conversion result.

### Limitação V1

A implementação de referência é memory-only.

### Decisão V2

Nenhum lifecycle financeiro pode ser considerado implementado até existir persistence durable com invariantes e transações apropriadas.

---

## 7. Consulta pública V1

Endpoint:

```text
GET /api/business-checkout/sessions/:id
```

Autorização pública bounded:

- `X-Checkout-Token` ou query `token`;
- comparação timing-safe;
- record inexistente ou token inválido retorna `404 CHECKOUT_NOT_FOUND`, evitando distinguir existência/autorização.

Projection retornada:

- checkoutId;
- tutorialSessionId;
- status;
- paymentReference;
- activationStatus;
- definitiveBusinessId.

Dados do contratante, preço interno completo, provider token e webhook secret não são expostos.

---

## 8. Webhook V1

Endpoint:

```text
POST /api/business-checkout/webhook
```

Assinatura:

```text
HMAC-SHA256(rawBody, BUSINESS_PAYMENT_WEBHOOK_SECRET)
X-Payment-Signature
```

O prefixo opcional `sha256=` é removido antes da comparação timing-safe.

Assinatura inválida:

```text
401 INVALID_WEBHOOK_SIGNATURE
```

Evento válido sem checkout correspondente:

```text
202 { received: true, matched: false }
```

Statuses considerados pagos:

- `paid`;
- `approved`;
- `confirmed`.

Outros status não promovem a transação.

Confirmação repetida quando record já está `CONFIRMED` é idempotente.

---

## 9. Autoridade de conversão V1

Somente após evento pago validado:

```text
checkout.status = CONFIRMED
providerPaymentReference = provider payment id
conversion.status = READY_FOR_REVIEW
definitiveBusinessId = biz_<UUID>
publishable = false
publicationStatus = PENDING_PROFILE_COMPLETION
```

Essa é uma invariante crítica: **pagamento confirmado não publica automaticamente um Business**.

A V2 Business consome um verified payment result de mesma sessão e permanece separada da verificação financeira.

---

## 10. Browser lifecycle V1

Criação:

```text
POST /api/business-checkout/sessions
Idempotency-Key: business:<sessionId>:<planId>
```

Após receber `checkoutUrl`:

1. tenta abrir popup com `noopener,noreferrer`;
2. se popup estiver bloqueado, faz `window.location.assign(checkoutUrl)`.

Polling:

```text
intervalo = 2500 ms
máximo = 240 tentativas
janela máxima nominal = 10 minutos
```

Em `CONFIRMED`, browser emite:

```text
businessPaymentVerified
  verified: true
  sessionId
  reference
  definitiveBusinessId
  activationStatus
```

Em `FAILED`, `CANCELLED` ou `EXPIRED`, encerra com falha.

Após timeout, emite falha de verificação.

Evento browser de falha:

```text
businessPaymentVerificationFailed
  sessionId
  message
```

### Decisão V2

Preservar o resultado observável necessário pelo Business, mas polling não é requisito arquitetural obrigatório se outro transporte seguro substituir o mecanismo. Autoridade financeira continua server-side.

---

## 11. Rate limiting V1

Create/status usam limiter quando fornecido:

```text
window = 60 s
max = 12
namespace = business-checkout
```

O webhook não usa o mesmo limiter porque precisa receber delivery do provider; sua proteção principal é autenticação criptográfica do payload.

### Decisão V2

Rate limits devem ser explícitos por superfície e não podem causar perda silenciosa de webhook legítimo. Webhook exige política própria de replay/idempotência e proteção de disponibilidade.

---

# 12. Lacunas de produção que NÃO devem ser copiadas da V1

A arquitetura V2 é maior que a equivalência do checkout V1. Os itens abaixo são novos requisitos/fortalecimentos e devem ser implementados progressivamente:

1. repository durable de orders/payments/idempotency;
2. estados financeiros formalizados;
3. webhook event identity e deduplicação durable;
4. out-of-order/replay handling;
5. ledger financeiro autoritativo;
6. refund/reversal semantics;
7. chargeback/dispute semantics quando suportadas;
8. reconciliation provider × ledger;
9. split/repasse;
10. settlement/transfer lifecycle;
11. subscription/renewal/cancellation quando o produto exigir recorrência;
12. audit trail imutável;
13. observabilidade financeira e alertas;
14. sandbox provider contract;
15. retry/backoff/circuit-breaker do provider;
16. migrations/backup/rollback;
17. tratamento de PII/LGPD e retenção;
18. versionamento de preço/plano para preservar a condição contratada.

Nenhum desses itens deve ser falsamente marcado como V1 parity; eles são necessários para a definição arquitetural completa de `FEATURE-0009`.

---

# 13. Dependency graph da Wave 8

Ordem obrigatória recomendada:

```text
M135 — freeze V1 + matrix + ownership
  ↓
Payments/Ordering domain vocabulary
  ↓
Durable Order/Payment/Idempotency repository
  ↓
Authenticated/public HTTP contracts
  ↓
Provider port + sandbox adapter
  ↓
Webhook verification + durable event dedup
  ↓
Payment state machine
  ↓
Ledger + financial invariants
  ↓
Refund/reversal
  ↓
Reconciliation
  ↓
Split/transfer/settlement
  ↓
Business checkout browser adapter
  ↓
E2E/sandbox/recovery
  ↓
FEATURE-0009 equivalent
  ↓
Affiliate attribution/commission/wallet/payout
```

Affiliates não deve ser implementado antes de eventos financeiros autoritativos, porque comissão/payout dependem de conversão financeira confirmada e de reversão.

---

# 14. Definition of equivalent para FEATURE-0009

A feature não deve ser promovida apenas porque checkout abre e confirma.

Para `equivalent` no escopo arquitetural atual, devem existir evidências executáveis para:

- handoff Business → Payments;
- pricing server-authoritative;
- order/payment identity;
- durable idempotency;
- checkout provider port;
- bounded public status;
- webhook authenticity + replay safety;
- authoritative payment transitions;
- durable persistence;
- ledger/reconciliation necessários às capabilities financeiras declaradas;
- refund/reversal quando aplicável;
- Business activation somente após verified financial result;
- sandbox browser/E2E;
- observability;
- rollback/migration evidence.

`equivalent` continua diferente de `released`.
