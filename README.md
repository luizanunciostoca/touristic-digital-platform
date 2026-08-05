# Touristic Digital Platform

Plataforma digital multi-destino para ecossistemas turísticos.

## Visão

A Touristic Digital Platform fornece um núcleo único e reutilizável para operar múltiplos destinos turísticos com isolamento de dados, identidade visual própria, regras configuráveis, geolocalização, geofencing e módulos compartilhados.

Morro Digital é o primeiro destino implementado sobre a plataforma. Futuramente, Itacaré Digital e outros destinos utilizarão a mesma base tecnológica sem duplicação de código.

## Princípios

- O core não conhece cidades específicas.
- `Destination` representa a unidade turística, geográfica, operacional e de marca.
- `Tenant` representa uma empresa ou organização dentro de um destino.
- Todo dado operacional relevante deve carregar `destinationId`.
- Dados privados de empresas também devem carregar `tenantId`.
- A resolução de destino pode ocorrer por domínio, slug, sessão, geolocalização autorizada ou seleção manual.
- Polígonos e multipolígonos são a fonte oficial de pertencimento geográfico; raios são suporte e fallback.
- Afiliados pertencem à plataforma, nunca às empresas.
- O Financial Core é ledger-first.
- Integrações internas e administrativas usam APIs versionadas e eventos; não há acesso direto entre bancos.

## Estrutura

```text
apps/
packages/
services/
destinations/
infra/
docs/
tooling/
.github/
```

## Governança documental

O GitHub é a fonte oficial para código, arquitetura, ADRs, contratos, padrões técnicos, segurança, testes e operação. O Google Drive permanece como fonte principal para estratégia, negócio, planejamento, materiais operacionais e colaboração executiva.

## Primeiro destino

```text
destinations/
└── morro-digital/
```

A configuração de Morro Digital deve conter apenas branding, menus, conteúdo, categorias, feature flags, domínios e parâmetros específicos do destino. Nenhuma regra de negócio específica de Morro de São Paulo pode ser embutida no core compartilhado.
