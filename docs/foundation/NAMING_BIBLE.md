# Platform Naming Bible

## 1. Idioma técnico

Código, nomes de arquivos, contratos, eventos e APIs usam inglês. Documentação pode ser escrita em português, preservando os termos oficiais em inglês.

## 2. Convenções gerais

- Pastas e arquivos Markdown: `kebab-case`.
- Pacotes: `@touristic/<name>`.
- Variáveis e funções: `camelCase`.
- Tipos, classes, interfaces e componentes: `PascalCase`.
- Constantes globais: `UPPER_SNAKE_CASE`.
- Tabelas e colunas: `snake_case`.
- Variáveis de ambiente: `UPPER_SNAKE_CASE`.
- Slugs: `kebab-case`.
- Identificadores públicos: prefixo de domínio + valor opaco quando necessário.

## 3. Termos canônicos

- `Destination`, nunca `City` como agregado principal.
- `Tenant`, nunca `Account` para organização operacional.
- `Business`, nunca `Merchant`, `Company`, `Enterprise` ou `Establishment` no domínio.
- `Customer`, nunca `Buyer` como identidade principal.
- `Order`, nunca `Purchase` como agregado comercial.
- `Booking` para processo; `Reservation` para registro resultante.
- `Payment` para obrigação/tentativa de pagamento.
- `Ledger` para fonte financeira; `Wallet` para projeção por parte.
- `Payout` para transferência ao recebedor.
- `Settlement` para liquidação e conciliação.
- `AffiliateAttribution` para o vínculo de aquisição.

## 4. Identificadores

Tipos devem ser específicos:

```ts
type DestinationId = Brand<string, 'DestinationId'>;
type TenantId = Brand<string, 'TenantId'>;
type BusinessId = Brand<string, 'BusinessId'>;
type CustomerId = Brand<string, 'CustomerId'>;
type OrderId = Brand<string, 'OrderId'>;
```

Evitar `string` genérico em fronteiras críticas.

## 5. Comandos, queries e eventos

- Comandos no imperativo: `CreateBusiness`, `ApproveBusiness`, `CancelReservation`.
- Queries como intenção de leitura: `GetBusinessById`, `ListNearbyExperiences`.
- Eventos no passado: `BusinessCreated`, `BusinessApproved`, `ReservationCancelled`.
- Handlers: `<CommandName>Handler`, `<EventName>Handler`.

## 6. APIs

- Recursos no plural: `/businesses`, `/orders`, `/destinations`.
- Hierarquia apenas quando expressa ownership real.
- Query parameters em `camelCase`.
- Headers customizados com prefixo `X-` apenas quando inevitável; preferir headers padronizados.
- Versão pública na URL: `/v1/...`.
- Operações idempotentes aceitam `Idempotency-Key`.

## 7. Banco

- Tabelas no plural: `businesses`, `orders`, `ledger_entries`.
- Chaves primárias: `id`.
- Chaves estrangeiras: `<entity>_id`.
- Timestamps: `created_at`, `updated_at`, `deleted_at`.
- Valores monetários: `<name>_minor` e `<name>_currency` quando não encapsulados.
- Geometrias: `location`, `boundary`, `service_area`.

## 8. Pacotes e módulos

- Pacote compartilhado: `packages/<name>`.
- Bounded context: `modules/<domain>`.
- Aplicação implantável: `apps/<app-name>`.
- Configuração de destino: `destinations/<destination-slug>`.
- Adapter: `<provider>-<capability>-adapter`.

## 9. Booleans e estados

Booleans começam com `is`, `has`, `can` ou `should`.

Estados usam enums explícitos:

```ts
type BusinessStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'SUSPENDED';
```

Evitar strings livres e flags sobrepostas.

## 10. Erros

Códigos usam `<DOMAIN>-<NNN>` em maiúsculas, por exemplo `AUTH-001`, `DEST-004`, `FIN-012`.

Classes internas usam `<Concept>Error`, como `DestinationNotFoundError`.

## 11. Proibições

- Abreviações ambíguas.
- Nomes genéricos como `data`, `item`, `manager`, `helper` sem contexto.
- Pastas `utils` como depósito irrestrito.
- Eventos no presente ou imperativo.
- Mistura de português e inglês em código.
- Termos diferentes para o mesmo conceito.

## 12. Processo de alteração

Novo termo de domínio exige atualização do Glossary e, quando estrutural, ADR. Renomeações incompatíveis exigem plano de migração.
