# Paid Provider Governance — M134

## Objetivo

Impedir que a simples presença de uma credencial paga habilite consumo externo sem um orçamento operacional explícito, e produzir telemetria estruturada suficiente para identificar reservas, consumo, bloqueios, erros, latência e aproximação dos limites.

Este contrato começa pelo OpenAI Assistant porque é o provider pago server-side já presente no runtime. O mecanismo de governor é provider-agnostic e pode ser reutilizado por futuros adapters pagos.

## Princípios

1. **API key não é autorização de gasto.**
2. **Billing externo e guard interno são camadas diferentes.** O provider deve possuir seu próprio hard limit; o runtime mantém um teto adicional.
3. **Fail closed.** Se limites, tarifas ou confirmação operacional não estiverem configurados, nenhuma chamada paga é enviada.
4. **Reserva antes da chamada.** Cada request reserva um valor conservador antes de acessar o provider.
5. **Liquidação pelo uso real.** Quando o provider retorna tokens de uso, o runtime calcula o custo com as tarifas configuradas.
6. **Uso ausente não significa custo zero.** Uma resposta sem telemetria de uso consome a reserva conservadora.
7. **Falha após tentativa externa é custo incerto.** Depois que a chamada foi tentada, timeout/429/5xx também consomem a reserva quando não há prova de custo real, evitando subcontagem e tempestades de retry.
8. **Concorrência é limitada separadamente do orçamento.**
9. **Preços não são hard-coded.** O operador deve usar as tarifas vigentes do modelo configurado.
10. **Observabilidade não expõe segredos.** Eventos estruturados contêm provider, custo, tokens, latência, reason e metadata segura; nunca API keys.

## Gate de ativação

O Assistant pago somente pode chamar o provider quando todos os requisitos abaixo forem verdadeiros:

```text
OPENAI_API_KEY presente
+
OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED=true
+
OPENAI_INPUT_USD_PER_1M_TOKENS > 0
+
OPENAI_OUTPUT_USD_PER_1M_TOKENS > 0
+
OPENAI_DAILY_COST_LIMIT_USD > 0
+
OPENAI_MONTHLY_COST_LIMIT_USD > 0
+
OPENAI_REQUEST_RESERVE_USD > 0
```

Se qualquer item estiver ausente, o endpoint responde `503 assistant_billing_guard_not_configured` antes de enviar tráfego ao provider.

`OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED=true` significa que o operador confirmou a existência de um limite de cobrança/gasto configurado na conta do provider. A flag não substitui esse limite externo.

## Fluxo

```text
Assistant request
→ IP rate limit
→ API key check
→ paid-provider configuration gate
→ daily/monthly budget preflight
→ concurrency preflight
→ reserve OPENAI_REQUEST_RESERVE_USD
→ provider request
→ provider usage quando disponível
→ prompt/completion cost calculation ou reserva conservadora
→ settle
→ structured observability event
→ response
```

Uma reserva pode ser liberada quando uma integração futura conseguir provar que nenhuma tentativa faturável ocorreu. No Assistant atual, depois que a chamada ao provider foi tentada, sucesso sem `usage`, timeout, 429 e 5xx são tratados conservadoramente: sem custo real comprovado, a reserva é liquidada integralmente. Isso pode superestimar gasto interno, mas nunca subestima silenciosamente consumo potencial.

## Eventos estruturados

O governor e a integração produzem eventos com prefixo lógico `provider.*`:

- `provider.request.reserved`;
- `provider.request.denied`;
- `provider.request.settled`;
- `provider.request.released`;
- `provider.request.failed`;
- `provider.budget.threshold`;
- `provider.billing_guard.denied` na integração do Assistant.

Os thresholds padrão são 50%, 75%, 90% e 100% do orçamento diário/mensal e são emitidos uma vez por janela de processo.

## Limites interno × externo

O M134 introduz um governor em memória no processo Node. Ele protege uma instância contra gasto inesperado e concorrência local, mas **não deve ser confundido com um ledger financeiro distribuído**.

Em múltiplas réplicas, cada processo possui seu próprio contador. Por isso:

- o hard limit do provider permanece obrigatório;
- produção com múltiplas réplicas deve evoluir o state store para Redis/SQL/serviço equivalente ou impor um budget por réplica compatível com o teto global;
- a futura implementação de `FEATURE-0009 — Payments/Financial` não deve reutilizar esse contador como ledger financeiro. Billing de providers é governança operacional; Financial é fonte de verdade monetária do produto.

## Respostas de proteção

| Condição                                               | HTTP | Erro                                     |
| ------------------------------------------------------ | ---: | ---------------------------------------- |
| API key ausente                                        |  503 | `assistant_not_configured`               |
| billing guard incompleto                               |  503 | `assistant_billing_guard_not_configured` |
| orçamento diário/mensal insuficiente para nova reserva |  429 | `assistant_budget_exhausted`             |
| concorrência local atingida                            |  429 | `assistant_concurrency_limited`          |
| rate limit por IP                                      |  429 | `assistant_rate_limited`                 |
| provider 429                                           |  429 | `assistant_provider_error`               |
| provider error                                         |  502 | `assistant_provider_error`               |
| timeout                                                |  504 | `assistant_timeout`                      |

## Operação antes de reativar billing

1. Configurar hard spending/billing limit na conta do provider.
2. Confirmar que a chave é server-only e possui privilégio mínimo aplicável.
3. Consultar o preço vigente do modelo escolhido.
4. Preencher as tarifas no ambiente.
5. Definir teto diário e mensal internos abaixo ou igual ao teto externo desejado.
6. Definir `OPENAI_REQUEST_RESERVE_USD` com margem conservadora para uma requisição no limite atual de tokens.
7. Começar com `OPENAI_MAX_CONCURRENCY` baixo.
8. Validar eventos `provider.*` no agregador de logs do ambiente.
9. Executar teste controlado antes de exposição pública.

## Próxima evolução de observabilidade

Antes de rollout amplo/multi-réplica:

- state store distribuído para budget e rate limiting;
- métricas exportáveis (requests, errors, latency, tokens, USD, denials);
- dashboard e alertas operacionais;
- correlation ID propagado até providers;
- SLOs por provider;
- agregação do critical provider gate no Go/No-Go de release.

O M134 é a camada de prevenção e telemetria local necessária para impedir billing acidental; não é o substituto de um sistema completo de FinOps/Observability distribuído.
