# Event Naming Bible

## 1. Princípio

Eventos representam fatos que já ocorreram. Por isso, seus nomes usam verbo no passado e linguagem de domínio explícita.

Correto:

- `BusinessCreated`
- `BusinessApproved`
- `OrderPlaced`
- `PaymentApproved`
- `ReservationCancelled`
- `AffiliateCommissionAccrued`

Incorreto:

- `CreateBusiness`
- `NewBusiness`
- `BusinessOK`
- `ProcessPayment`
- `ReservationUpdate`

## 2. Estrutura do nome

Formato recomendado:

```text
<AggregateOrConcept><PastTenseVerb>
```

Quando necessário, incluir contexto sem ambiguidade:

- `CustomerAttributedToAffiliate`
- `DestinationBoundaryUpdated`
- `LedgerEntryPosted`
- `PayoutFailed`

## 3. Categorias

### Eventos de domínio

Fatos relevantes para o bounded context e possíveis consumidores internos.

Exemplos:

- `OrderPlaced`
- `ReservationConfirmed`
- `BusinessActivated`

### Eventos de integração

Contratos estáveis publicados para outros módulos ou sistemas.

Podem derivar de eventos de domínio, mas precisam de payload e versão próprios.

### Eventos técnicos

Usados para observabilidade, processamento ou infraestrutura. Não devem substituir eventos de negócio.

Exemplos:

- `WebhookDeliveryRetried`
- `SearchIndexRebuilt`

## 4. Envelope obrigatório

```ts
interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  version: number;
  occurredAt: string;
  destinationId?: string;
  tenantId?: string;
  correlationId: string;
  causationId?: string;
  actor?: {
    type: 'USER' | 'SYSTEM' | 'INTEGRATION';
    id?: string;
  };
  payload: TPayload;
}
```

## 5. Versionamento

- A versão pertence ao contrato do evento.
- Mudança incompatível exige nova versão.
- Consumidores devem declarar versões suportadas.
- Campos opcionais podem ser adicionados quando não alterarem semântica.
- Campos existentes não podem mudar de significado silenciosamente.

Exemplo de identificação externa:

```text
order.placed.v1
payment.approved.v1
```

No TypeScript, o tipo pode permanecer `OrderPlacedV1` para contratos versionados.

## 6. Payload

O payload deve conter fatos necessários para consumo, sem expor internals ou dados sensíveis desnecessários.

Regras:

- usar IDs específicos;
- usar valores monetários em unidades mínimas;
- usar timestamps ISO 8601 em UTC;
- evitar objetos completos quando referências bastarem;
- não incluir segredos, tokens ou PII não essencial;
- não exigir consulta síncrona imediata para compreender o fato crítico.

## 7. Idempotência

Todo consumidor deve usar `eventId` ou chave de negócio apropriada para impedir efeitos duplicados.

Eventos podem ser entregues mais de uma vez. Exactly-once não deve ser presumido.

## 8. Ordenação

Ordenação global não é garantida. Quando necessária, usar:

- sequence por aggregate;
- versão de entidade;
- partition key explícita;
- validação de estado no consumidor.

## 9. Correlação e causalidade

- `correlationId`: liga toda a jornada.
- `causationId`: identifica comando ou evento que causou o fato.
- Eventos derivados preservam o mesmo `correlationId`.

## 10. Eventos iniciais obrigatórios

### Destination

- `DestinationCreated`
- `DestinationActivated`
- `DestinationConfigurationUpdated`
- `DestinationBoundaryUpdated`

### Business

- `BusinessCreated`
- `BusinessSubmittedForReview`
- `BusinessApproved`
- `BusinessActivated`
- `BusinessSuspended`
- `BusinessServiceAreaUpdated`

### Ordering

- `OrderPlaced`
- `OrderConfirmed`
- `OrderCancelled`

### Booking

- `BookingHoldCreated`
- `BookingHoldExpired`
- `ReservationConfirmed`
- `ReservationCancelled`
- `ReservationRescheduled`

### Ticketing

- `TicketIssued`
- `TicketValidated`
- `TicketRevoked`

### Financial

- `PaymentInitiated`
- `PaymentApproved`
- `PaymentDeclined`
- `LedgerEntryPosted`
- `SettlementCompleted`
- `PayoutCompleted`
- `RefundCompleted`
- `ChargebackReceived`

### Affiliate

- `CustomerAttributedToAffiliate`
- `AffiliateCommissionAccrued`
- `AffiliateCommissionReversed`

### Notifications

- `NotificationRequested`
- `NotificationDelivered`
- `NotificationDeliveryFailed`

## 11. Proibições

- Eventos com verbos no presente ou imperativo.
- Nomes genéricos como `Updated`, `Changed`, `Processed` sem conceito.
- Eventos usados como RPC disfarçado.
- Payload dependente de estrutura de banco.
- Reutilização do mesmo nome para semânticas diferentes.
- Publicação antes da transação ser confirmada.

## 12. Checklist de revisão

- [ ] O nome descreve fato passado?
- [ ] O owner do evento está claro?
- [ ] A versão está explícita?
- [ ] O payload é mínimo e suficiente?
- [ ] O evento preserva destinationId/tenantId quando aplicável?
- [ ] O consumidor pode ser idempotente?
- [ ] Há dados sensíveis desnecessários?
- [ ] O contrato possui teste de compatibilidade?
