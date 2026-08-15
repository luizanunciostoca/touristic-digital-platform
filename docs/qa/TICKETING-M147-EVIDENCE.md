# M147 — Ticketing e Check-in

## Objetivo

Criar o módulo nativo `@touristic/ticketing` para venda de ingressos e passeios na plataforma turística, integrado a Ordering e Financial, com emissão de tickets, QR assinado, código alfanumérico único, check-in persistente e suporte a sincronização offline.

## Escopo entregue

- Pacote de domínio `@touristic/ticketing` com identidades, lifecycle e validações.
- Serviço `@touristic/ticketing-server` com persistência MySQL para tickets, check-ins e envelopes offline.
- Emissão de ticket somente após `Payment` confirmado e `Order` correspondente.
- QR payload versionado `tck.v1.<ticketId>.<hmac>` com assinatura HMAC-SHA256.
- Código alfanumérico humano no formato `XXXX-XXXX-XXXX-XXXX`.
- Check-in persistente com estados `issued → validated → used → cancelled`.
- Fila offline assinada para sincronização posterior de operações de validação, uso e cancelamento.
- Integração por contratos com Ordering e Financial, sem acoplar o domínio a UI ou providers.

## Decisões arquiteturais

- Ticketing é um domínio separado e provider-neutral.
- A emissão de tickets depende da autoridade financeira persistida; nenhum ticket é emitido a partir de resposta de provider.
- O QR Code transporta apenas identidade e assinatura, sem dados pessoais.
- O modo offline usa envelope assinado e idempotente, permitindo reconciliação posterior sem reprocessamento divergente.
- O módulo é multi-destino por `destinationId` e aceita produtos turísticos por referência estável (`tour`, `business_experience`).

## Evidências

- Testes unitários de domínio em `packages/ticketing/src/index.test.ts`.
- Testes de aplicação em `services/ticketing/src/ticketing-application-service.test.ts`.
- Teste de integração MySQL em `services/ticketing/src/mysql-integration.test.ts`.
- Schema durável em `services/ticketing/src/schema.ts`.

## Limites deste milestone

- Não inclui UI de venda ou check-in.
- Não inclui geração visual de imagem QR.
- Não inclui settlement, subscriptions ou Affiliates.
- Não promove `FEATURE-0011` para `equivalent`; o status inicial é `migrating`.
