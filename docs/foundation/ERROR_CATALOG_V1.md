# Error Catalog V1

## Padrão

Cada erro público usa:

- código estável `<DOMAIN>-<NNN>`;
- título curto;
- status HTTP quando aplicável;
- mensagem segura para cliente;
- causa operacional;
- estratégia de recuperação;
- flag de retry;
- nível de severidade.

Payload recomendado:

```json
{
  "type": "https://docs.example/errors/DEST-001",
  "title": "Destination not found",
  "status": 404,
  "code": "DEST-001",
  "detail": "The requested destination could not be resolved.",
  "correlationId": "..."
}
```

## System

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| SYS-001 | 500 | Internal error | Sim, controlado | Alta | Registrar correlationId; não expor detalhes internos |
| SYS-002 | 503 | Service unavailable | Sim | Alta | Retry com backoff e circuit breaker |
| SYS-003 | 504 | Upstream timeout | Sim | Média | Retry idempotente; degradar quando possível |
| SYS-004 | 409 | Idempotency conflict | Não | Média | Reutilizar resposta original ou nova chave válida |
| SYS-005 | 429 | Rate limit exceeded | Sim | Média | Respeitar `Retry-After` |

## Authentication and authorization

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| AUTH-001 | 401 | Authentication required | Não | Média | Autenticar novamente |
| AUTH-002 | 401 | Session expired | Não | Média | Renovar sessão ou login |
| AUTH-003 | 403 | Permission denied | Não | Alta | Solicitar papel adequado; auditar tentativa |
| AUTH-004 | 403 | MFA required | Não | Alta | Executar step-up authentication |
| AUTH-005 | 403 | Cross-destination access denied | Não | Crítica | Bloquear e auditar |
| AUTH-006 | 403 | Cross-tenant access denied | Não | Crítica | Bloquear e auditar |

## Destination and geography

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| DEST-001 | 404 | Destination not found | Não | Média | Solicitar seleção manual |
| DEST-002 | 409 | Destination ambiguous | Não | Média | Apresentar destinos candidatos |
| DEST-003 | 422 | Invalid coordinates | Não | Baixa | Corrigir latitude/longitude |
| DEST-004 | 422 | Location outside boundary | Não | Média | Revisão ou exceção administrativa auditada |
| DEST-005 | 409 | Overlapping destination boundary | Não | Alta | Resolver prioridade e geometria |
| DEST-006 | 503 | Geolocation provider unavailable | Sim | Média | Usar domínio, slug, sessão ou seleção manual |
| DEST-007 | 422 | Invalid destination configuration | Não | Alta | Corrigir configuração antes de ativar |

## Tenancy and business

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| TEN-001 | 404 | Tenant not found | Não | Média | Validar tenantId |
| TEN-002 | 409 | Tenant inactive | Não | Média | Reativação administrativa |
| BUS-001 | 404 | Business not found | Não | Baixa | Validar businessId |
| BUS-002 | 409 | Business not active | Não | Média | Concluir aprovação ou reativação |
| BUS-003 | 422 | Invalid service area | Não | Média | Corrigir geometria |
| BUS-004 | 409 | Business already exists | Não | Baixa | Reutilizar cadastro existente |

## Catalog and ordering

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| CAT-001 | 404 | Offer not found | Não | Baixa | Atualizar catálogo |
| CAT-002 | 409 | Offer unavailable | Não | Baixa | Escolher alternativa |
| ORD-001 | 404 | Order not found | Não | Média | Validar orderId |
| ORD-002 | 409 | Order state conflict | Não | Média | Recarregar estado atual |
| ORD-003 | 422 | Invalid order item | Não | Média | Corrigir item ou quantidade |
| ORD-004 | 409 | Price changed | Não | Média | Recalcular e solicitar confirmação |

## Booking and ticketing

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| BOOK-001 | 409 | Availability conflict | Não | Média | Selecionar novo slot |
| BOOK-002 | 409 | Hold expired | Não | Baixa | Criar novo hold |
| BOOK-003 | 422 | Capacity exceeded | Não | Média | Reduzir quantidade |
| BOOK-004 | 409 | Reservation cannot be cancelled | Não | Média | Aplicar política vigente |
| TICK-001 | 404 | Ticket not found | Não | Média | Validar credencial |
| TICK-002 | 409 | Ticket already used | Não | Alta | Bloquear entrada e auditar |
| TICK-003 | 409 | Ticket revoked | Não | Alta | Orientar suporte |
| TICK-004 | 422 | Invalid ticket signature | Não | Crítica | Bloquear e registrar fraude potencial |

## Financial

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| FIN-001 | 409 | Payment already processed | Não | Média | Retornar resultado idempotente |
| FIN-002 | 402 | Payment declined | Não | Média | Usar outro meio de pagamento |
| FIN-003 | 503 | Payment provider unavailable | Sim | Alta | Retry idempotente ou provedor alternativo |
| FIN-004 | 409 | Ledger imbalance detected | Não | Crítica | Bloquear transação e acionar incidente |
| FIN-005 | 409 | Insufficient available balance | Não | Média | Aguardar liquidação ou reduzir payout |
| FIN-006 | 409 | Settlement mismatch | Não | Alta | Abrir conciliação |
| FIN-007 | 409 | Refund not allowed | Não | Média | Aplicar política vigente |
| FIN-008 | 409 | Duplicate financial operation | Não | Alta | Retornar operação original |

## Affiliate

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| AFF-001 | 404 | Affiliate not found | Não | Média | Validar affiliateId |
| AFF-002 | 409 | Affiliate inactive | Não | Média | Reativação administrativa |
| AFF-003 | 409 | Attribution already exists | Não | Baixa | Aplicar regra vigente |
| AFF-004 | 422 | Attribution not eligible | Não | Média | Informar regra aplicável |
| AFF-005 | 409 | Commission reversal required | Não | Alta | Criar lançamento compensatório |
| AFF-006 | 403 | Suspected affiliate fraud | Não | Crítica | Bloquear, auditar e revisar manualmente |

## Notifications and integrations

| Código | HTTP | Título | Retry | Severidade | Recuperação |
|---|---:|---|---|---|---|
| NOTIF-001 | 422 | Invalid notification recipient | Não | Baixa | Corrigir destino |
| NOTIF-002 | 503 | Notification provider unavailable | Sim | Média | Retry e fallback de canal |
| INT-001 | 401 | Integration credentials invalid | Não | Alta | Rotacionar credencial |
| INT-002 | 429 | Integration rate limited | Sim | Média | Respeitar janela e backoff |
| INT-003 | 502 | Invalid upstream response | Sim, limitado | Alta | Registrar payload sanitizado e abrir incidente |
| INT-004 | 409 | Webhook signature invalid | Não | Crítica | Rejeitar e auditar |

## Regras

1. Códigos nunca são reutilizados com outro significado.
2. Mensagens públicas não expõem stack, SQL, segredo, PII ou regra antifraude sensível.
3. Todo erro inesperado inclui `correlationId`.
4. Retries só ocorrem em operações comprovadamente idempotentes.
5. Novos erros exigem documentação e testes de contrato.
