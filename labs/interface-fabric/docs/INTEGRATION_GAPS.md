# Integration Gaps

## Regra

A Fabric isolada não transforma referência de endpoint em autoridade. Antes de qualquer binding real, cada contrato marcado como `EXISTING_CONTRACT_REFERENCE` precisa ser revalidado contra o exact-head que será integrado.

## Estado atual

- 112 contratos catalogados.
- 67 referências a contratos existentes, pendentes de revalidação exact-head.
- 10 superfícies client-local.
- 35 contratos ainda requeridos pelo owner.

## Gaps conhecidos por produto

- Tourist/Resident: locale e favoritos dedicados.
- Commerce: mesa/restaurante, transporte e hospedagem; histórico/cancelamento/reembolso consolidado.
- Business: dashboard metrics, localização, reservas, ticketing/check-in, financeiro, conteúdo, equipe, configurações e preview dedicado.
- Affiliate: entrada dedicada, self-onboarding, QR, analytics detalhado, statement, payout history e growth.
- Control Center: Content, Destinations, Integrations e Notifications.
- Growth: UI pode existir em fixture, mas binding depende da reconciliação com a frente concorrente de Growth contracts.

## Autoridade

Nenhuma interface pode tornar o browser autoridade de preço, inventário, pagamento, comissão, payout, XP, reward ou elegibilidade financeira.
