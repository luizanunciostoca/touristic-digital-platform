# Paid Provider Governance — M134 + durable runtime hardening

## Objetivo

Impedir que a simples presença de uma credencial paga habilite consumo externo sem um orçamento operacional explícito, preservar o estado de budget entre reinícios e produzir telemetria estruturada suficiente para identificar reservas, consumo, bloqueios, erros, recuperação conservadora, latência e aproximação dos limites.

Este contrato começa pelo OpenAI Assistant porque é o provider pago server-side já presente no runtime. O mecanismo de governor permanece separado de Payments/Financial: ele é um controle operacional de gasto de provider, não um ledger financeiro do produto.

## Princípios

1. **API key não é autorização de gasto.**
2. **Billing externo e guard interno são camadas diferentes.** O provider deve possuir seu próprio hard limit; o runtime mantém um teto adicional.
3. **Fail closed.** Se limites, tarifas, topologia, persistência ou confirmação operacional não estiverem configurados, nenhuma chamada paga é enviada.
4. **Reserva antes da chamada.** Cada request reserva um valor conservador antes de acessar o provider.
5. **Reserva durável antes do provider.** Quando persistência é obrigatória, a reserva precisa ser gravada com sucesso antes da chamada externa.
6. **Liquidação pelo uso real.** Quando o provider retorna tokens de uso, o runtime calcula o custo com as tarifas configuradas.
7. **Uso ausente não significa custo zero.** Uma resposta sem telemetria de uso consome a reserva conservadora.
8. **Falha após tentativa externa é custo incerto.** Depois que a chamada foi tentada, timeout/429/5xx também consomem a reserva quando não há prova de custo real.
9. **Crash não libera reserva silenciosamente.** Reservas persistidas e encontradas abertas no próximo boot são recuperadas como gasto conservador antes de aceitar novo tráfego.
10. **Concorrência é limitada separadamente do orçamento.** O limite atual é seguro somente dentro de uma única réplica paga ativa.
11. **Multi-réplica não é simulada.** Até existir um state store distribuído e atômico, o runtime pago exige `OPENAI_RUNTIME_REPLICA_COUNT=1` e falha fechado para qualquer outro valor.
12. **Preços não são hard-coded.** O operador deve usar as tarifas vigentes do modelo configurado.
13. **Observabilidade não expõe segredos.** Eventos estruturados carregam provider, custo, tokens, latência, reason e metadata segura; nunca API keys.

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
+
OPENAI_MAX_CONCURRENCY inteiro > 0
+
OPENAI_RUNTIME_REPLICA_COUNT=1
+
OPENAI_GOVERNANCE_STATE_FILE configurado e utilizável
```

`OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED=true` significa que o operador confirmou a existência de um limite de cobrança/gasto configurado na conta do provider. A flag não substitui esse limite externo.

`OPENAI_RUNTIME_REPLICA_COUNT=1` é uma declaração operacional de topologia. O deploy também deve garantir que exista no máximo uma réplica paga ativa; a aplicação não consegue provar, por si só, quantos processos/containers foram iniciados fora dela. Rolling deploy com sobreposição de réplicas pagas não é suportado por este governor.

`OPENAI_GOVERNANCE_STATE_FILE` deve apontar para storage server-side durável e gravável. O arquivo é atualizado por substituição atômica e não deve residir em `/tmp` ou outro filesystem efêmero em produção.

## Fluxo

```text
Assistant request
→ correlation ID
→ IP rate limit
→ API key check
→ single-replica runtime topology guard
→ paid-provider configuration + durable-state gate
→ daily/monthly budget preflight
→ local concurrency preflight
→ reserve OPENAI_REQUEST_RESERVE_USD
→ persist reservation durably
→ provider request
→ provider usage quando disponível
→ prompt/completion cost calculation ou reserva conservadora
→ settle
→ persist updated spend
→ structured observability event
→ response
```

Uma reserva pode ser liberada somente quando existir prova de que nenhuma tentativa faturável ocorreu. No Assistant atual, depois que a chamada ao provider foi tentada, sucesso sem `usage`, timeout, 429 e 5xx são tratados conservadoramente: sem custo real comprovado, a reserva é liquidada integralmente. Isso pode superestimar gasto interno, mas evita subcontagem silenciosa.

## Recuperação após reinício

O state store persiste:

- janela diária atual;
- janela mensal atual;
- gasto acumulado;
- contadores de requests/tokens;
- reservas ainda abertas;
- metadata operacional segura, incluindo `correlationId`, modelo e superfície.

Ao iniciar um novo governor:

1. o estado persistido é validado por versão e provider;
2. gasto da janela ainda vigente é restaurado;
3. cada reserva órfã é considerada tentativa externa potencialmente faturável;
4. a reserva é convertida em gasto conservador na janela diária/mensal ainda vigente;
5. `provider.request.recovered` é emitido;
6. o estado recuperado precisa ser persistido com sucesso antes do governor ser considerado saudável.

Estado corrompido, incompatível, ilegível ou não gravável deixa o governor indisponível e bloqueia tráfego pago.

## Eventos estruturados

O governor e a integração produzem eventos com prefixo lógico `provider.*`:

- `provider.request.reserved`;
- `provider.request.denied`;
- `provider.request.settled`;
- `provider.request.released`;
- `provider.request.failed`;
- `provider.request.recovered`;
- `provider.budget.threshold`;
- `provider.budget.overrun`;
- `provider.governance.persistence_failed`;
- `provider.runtime_guard.denied`;
- `provider.billing_guard.denied`.

Cada request recebe um `X-Request-ID` gerado no runtime. O mesmo `correlationId` é anexado à metadata dos eventos de reserva, bloqueio e falha ligados àquela chamada, permitindo reconstruir a sequência operacional sem registrar a API key.

Os thresholds padrão continuam em 50%, 75%, 90% e 100% do orçamento diário/mensal. Um custo real acima da reserva pode ultrapassar o teto após a liquidação; nesse caso o runtime registra `provider.budget.overrun` e chamadas seguintes ficam bloqueadas pelo budget.

## Limites interno × externo

O hardening durável elimina o reset silencioso do budget em reinícios normais da única réplica paga, mas **ainda não transforma o governor em um ledger distribuído**.

Garantias atuais:

- budget diário/mensal persiste entre reinícios quando o state file durável permanece disponível;
- uma reserva é gravada antes da chamada externa;
- crash com reserva aberta é recuperado conservadoramente;
- concorrência local é limitada antes do provider;
- configuração de multi-réplica é recusada explicitamente.

Não garantido nesta etapa:

- exclusão distribuída entre hosts/containers;
- budget global atômico com múltiplas réplicas;
- rate limiting distribuído;
- tolerância a duas réplicas simultâneas apontando para o mesmo arquivo.

Portanto, produção deve manter exatamente uma réplica paga ativa enquanto este backend de estado estiver em uso. Para HA/multi-réplica, a próxima evolução obrigatória é Redis/SQL/serviço equivalente com operações atômicas de reserve/settle/recovery.

## Respostas de proteção

| Condição | HTTP | Erro |
| --- | ---: | --- |
| API key ausente | 503 | `assistant_not_configured` |
| topologia ausente ou diferente de uma réplica | 503 | `assistant_runtime_governance_unsafe` |
| state store ausente, corrompido ou indisponível | 503 | `assistant_governance_state_unavailable` |
| billing guard incompleto | 503 | `assistant_billing_guard_not_configured` |
| orçamento diário/mensal insuficiente para nova reserva | 429 | `assistant_budget_exhausted` |
| concorrência local atingida | 429 | `assistant_concurrency_limited` |
| rate limit por IP | 429 | `assistant_rate_limited` |
| provider 429 | 429 | `assistant_provider_error` |
| provider error | 502 | `assistant_provider_error` |
| timeout | 504 | `assistant_timeout` |

## Operação antes de reativar billing

1. Configurar hard spending/billing limit na conta do provider.
2. Confirmar que a chave é server-only e possui privilégio mínimo aplicável.
3. Consultar o preço vigente do modelo escolhido.
4. Preencher as tarifas no ambiente.
5. Definir teto diário e mensal internos abaixo ou igual ao teto externo desejado.
6. Definir `OPENAI_REQUEST_RESERVE_USD` com margem conservadora para uma requisição no limite atual de tokens.
7. Definir `OPENAI_MAX_CONCURRENCY` explicitamente como inteiro positivo e começar baixo.
8. Garantir deploy com exatamente uma réplica paga ativa e configurar `OPENAI_RUNTIME_REPLICA_COUNT=1`.
9. Provisionar storage durável server-side e configurar `OPENAI_GOVERNANCE_STATE_FILE`.
10. Validar permissão de leitura/gravação e sobrevivência do arquivo a reinício/deploy.
11. Validar eventos `provider.*` e `X-Request-ID` no agregador de logs do ambiente.
12. Executar teste controlado de request, restart e recuperação antes de exposição pública.

## Próxima evolução obrigatória antes de multi-réplica

- state store distribuído com reserva/liquidação/recovery atômicos;
- rate limiting distribuído;
- métricas exportáveis de requests, errors, latency, tokens, USD, denials e recovery;
- dashboard e alertas operacionais;
- propagação segura de correlation ID até o provider quando suportada pelo contrato oficial adotado;
- SLOs por provider;
- agregação do critical provider gate no Go/No-Go de release.

Esta governança continua sendo prevenção operacional de billing e runtime safety. Ela não substitui Financial nem deve ser usada como fonte de verdade monetária do produto.
