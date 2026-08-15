# M147 — Ticketing e Check-in

## Objetivo

Criar a fundação nativa `@touristic/ticketing` para ingressos e passeios da plataforma turística, integrada por contratos a Ordering e Financial, com ticket lifecycle, QR assinado, código alfanumérico, persistência de check-in e base de sincronização offline.

M147 é uma nova capacidade V2 e não declara que M146 foi concluído. O milestone financeiro M146 — split/repasse/settlement — continua pendente e mantém sua numeração canônica.

## Escopo entregue

- Pacote de domínio `@touristic/ticketing` com identidades, lifecycle e validações.
- Serviço `@touristic/ticketing-server` com persistência MySQL para tickets, check-ins e envelopes offline.
- Emissão condicionada a `Order` correspondente e `Payment` persistido em `confirmed`.
- Validação da autoridade monetária: valor/moeda do request, `Order.pricing.amount` e `Payment.amount` precisam convergir; o ticket persiste o valor autoritativo do Payment.
- IDs determinísticos de ticket e códigos humanos derivados por SHA-256, evitando depender de prefixos previsíveis do Order ID.
- QR payload versionado `tck.v1.<ticketId>.<hmac>` com assinatura HMAC-SHA256 e sem PII.
- Check-in persistente com estados `issued → validated → used → cancelled`.
- Envelope offline assinado e idempotente; o sync também verifica que o payload interno é um QR válido do mesmo ticket.
- Correção do repositório offline para validar IDs `toe_*` com `normalizeTicketOfflineEnvelopeId`, separadamente de IDs de check-in `tci_*`.
- Integração por contratos com Ordering e Financial, sem acoplar o domínio a UI ou provider financeiro.

## Decisões arquiteturais

- Ticketing é um domínio separado e provider-neutral.
- A emissão depende de autoridade financeira persistida; resposta direta de provider nunca autoriza ticket.
- `Order` e `Payment` precisam concordar sobre a autoridade monetária antes da emissão.
- O QR Code transporta apenas identidade e assinatura, sem nome, documento, e-mail ou outros dados pessoais.
- O código humano é derivado de hash e não de truncamento de identificadores previsíveis.
- O modo offline usa envelope assinado e idempotente e não aceita um payload QR pertencente a outro ticket.
- O módulo é multi-destino por `destinationId` e admite referências estáveis de produto `tour` e `business_experience`.
- Nenhum segredo de assinatura é exposto a browser neste milestone. Provisionamento de credencial de dispositivo/offline deve ser fechado antes de uma superfície cliente offline real.

## Evidências executáveis

- Testes unitários de domínio em `packages/ticketing/src/index.test.ts`.
- Testes de aplicação em `services/ticketing/src/ticketing-application-service.test.ts`, incluindo rejeição de divergência financeira e payload offline incompatível.
- Integração MySQL real em `services/ticketing/src/mysql-integration.test.ts`, exercitando persistência de ticket, histórico de check-in, envelope `toe_*` e marcação de sincronização.
- Schema durável em `services/ticketing/src/schema.ts`.
- Workflow permanente `.github/workflows/ticketing-m147-contract.yml` com MySQL 8.4, lint, typecheck, testes de domínio/aplicação, integração e build.
- Quality Gate e regressões permanentes de Auth, Business, CRM e Payments permanecem obrigatórios no head final.

## Limites deste milestone

- Não inclui API/HTTP pública ou autenticada de Ticketing.
- Não inclui UI de venda ou check-in.
- Não inclui geração visual da imagem QR.
- Não provisiona segredo HMAC para navegador ou dispositivo offline.
- A orquestração de mudança de estado do ticket + append de check-in ainda precisa de boundary transacional único antes da ativação operacional concorrente; M147 não expõe esse fluxo em runtime público.
- Não inclui settlement, subscriptions ou Affiliates.
- Não promove `FEATURE-0011` para `equivalent`; o status inicial permanece `migrating`.

## Relação M146 × M147

M147 ter sido criado antes do fechamento de M146 não promove nem substitui o milestone financeiro. A sequência documental fica explícita:

1. M145 — reconciliation financeira durável — concluído em `main`.
2. M146 — split/repasse/settlement — pendente.
3. M147 — fundação Ticketing/Check-in — desenvolvimento independente, sem settlement e sem payout.

Ticketing não pode assumir capabilities de settlement nem liberar Affiliates enquanto M146 não estiver implementado e validado.
