# ADR-001 — Estratégia de Repositório e Monorepo

## Status

Aceito.

## Contexto

A plataforma deixou de ser uma aplicação específica de Morro de São Paulo e passou a representar um produto reutilizável para múltiplos destinos turísticos. A base precisa compartilhar contratos, design system, módulos de domínio, infraestrutura e padrões sem duplicar código.

## Decisão

Adotar um monorepo no repositório `luizidebook/touristic-digital-platform`.

A organização principal será composta por:

- `apps/` para aplicações implantáveis;
- `packages/` para bibliotecas compartilhadas;
- `modules/` para bounded contexts e lógica de domínio;
- `destinations/` para configurações específicas de cada destino;
- `infra/` para infraestrutura e adapters;
- `docs/` para documentação técnica versionada;
- `tooling/` para automação e qualidade.

O Morro Digital será o primeiro destino configurado. O core não poderá conter nomes, regras ou condições específicas de cidades.

## Consequências

### Positivas

- reutilização real entre destinos;
- contratos e padrões centralizados;
- mudanças atômicas entre apps e módulos;
- pipeline de qualidade unificado;
- redução de duplicação e divergência arquitetural.

### Custos e riscos

- necessidade de regras rígidas de dependência;
- maior disciplina de ownership;
- pipelines devem suportar execução seletiva;
- pacotes compartilhados não podem se transformar em depósito genérico de lógica.

## Regras associadas

As fronteiras obrigatórias estão documentadas em `DEPENDENCY_RULES.md`.
