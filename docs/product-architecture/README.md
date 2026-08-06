# Programa BETA — Product Architecture

Este diretório contém os documentos oficiais que conectam visão de produto, regras de negócio, domínios e execução técnica da Touristic Digital Platform.

## Documentos

1. [Platform Bible](./PLATFORM-BIBLE.md)
2. [Domain Map](./DOMAIN-MAP.md)
3. [Capability Matrix](./CAPABILITY-MATRIX.md)
4. [Product Roadmap](./PRODUCT-ROADMAP.md)
5. [Module Contracts](./MODULE-CONTRACTS.md)
6. [Feature Lifecycle](./FEATURE-LIFECYCLE.md)
7. [Release Process](./RELEASE-PROCESS.md)
8. [Multi-Destination Strategy](./MULTI-DESTINATION-STRATEGY.md)
9. [Business Rules Catalog](./BUSINESS-RULES-CATALOG.md)
10. [Evolution Strategy](./EVOLUTION-STRATEGY.md)

## Hierarquia de autoridade

- A Platform Bible define princípios e limites.
- ADRs registram decisões estruturais específicas.
- Module Contracts e Domain Map definem fronteiras.
- Business Rules Catalog define invariantes de negócio.
- Capability Matrix conecta produto e implementação.
- Feature Lifecycle governa a evolução.
- Release Process governa entrega em produção.
- Product Roadmap ordena resultados e releases.

Conflitos devem ser resolvidos pela regra mais específica, sem violar os princípios imutáveis da Platform Bible.