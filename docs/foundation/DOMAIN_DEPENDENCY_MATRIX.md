# Domain Dependency Matrix

## Legenda

- `A`: dependência permitida por API pública.
- `P`: dependência permitida somente via port/contract.
- `E`: comunicação somente por evento.
- `X`: dependência proibida.

## Matriz

| Origem \ Destino | Identity | Tenancy | Destination | Catalog | Ordering | Booking | Ticketing | Financial | Affiliate | Notifications | Search | Audit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Identity | — | P | P | X | X | X | X | X | X | E | X | E |
| Tenancy | P | — | A | X | X | X | X | X | X | E | X | E |
| Destination | P | P | — | E | E | E | E | E | E | E | E | E |
| Catalog | P | P | P | — | E | E | E | X | X | E | E | E |
| Ordering | P | P | P | P | — | P | P | P | P | E | X | E |
| Booking | P | P | P | P | E | — | P | P | X | E | X | E |
| Ticketing | P | P | P | P | E | P | — | P | X | E | X | E |
| Financial | P | P | P | X | E | E | E | — | P | E | X | E |
| Affiliate | P | P | P | X | E | X | X | P | — | E | X | E |
| Notifications | P | P | P | X | X | X | X | X | X | — | X | E |
| Search | P | P | P | E | X | X | X | X | X | X | — | E |
| Audit | P | P | P | X | X | X | X | X | X | X | X | — |

## Regras por domínio

### Identity
Pode expor identidade, autenticação, sessão e autorização. Não conhece regras de negócio de marketplace, booking, ticketing ou financeiro.

### Tenancy
Gerencia organizações, memberships e escopo de tenant. Não implementa autorização específica de outros domínios.

### Destination
É autoridade sobre destinos, resolução, configuração e geografia. Outros domínios podem consultar sua API pública ou reagir a eventos.

### Catalog
É autoridade sobre ofertas publicáveis, categorias e atributos. Não calcula pagamentos nem comissões.

### Ordering
Coordena carrinho, checkout e pedidos. Orquestra Booking, Ticketing, Financial e Affiliate por contracts ou eventos; não acessa internals.

### Booking
É autoridade sobre disponibilidade, holds e reservas. Não calcula ledger nem atribuição afiliada.

### Ticketing
É autoridade sobre emissão e validação de credenciais. Recebe confirmação comercial e financeira por contratos ou eventos.

### Financial
É autoridade sobre ledger, payment, split, commission posting, settlement e payout. Não depende de UIs ou catálogo.

### Affiliate
É autoridade sobre affiliate, attribution e regras de elegibilidade. A materialização financeira de comissão pertence ao Financial.

### Notifications
Recebe intents ou eventos e entrega mensagens. Não decide estados de negócio.

### Search
Indexa projeções de dados públicos. Não é fonte de verdade de nenhum domínio.

### Audit
Recebe eventos e registros técnicos. Não participa de decisões transacionais.

## Regras de implementação

1. Dependências `A` usam apenas exports públicos de `index.ts`.
2. Dependências `P` usam interfaces em `contracts` ou ports definidos pelo consumidor.
3. Dependências `E` não autorizam import direto entre módulos.
4. Nenhum módulo importa adapters concretos.
5. Nenhum domínio depende de apps.
6. Infraestrutura pode depender de ports que implementa, nunca o inverso.
7. Dependências não listadas são proibidas por padrão.
8. Exceções exigem ADR e atualização desta matriz.
