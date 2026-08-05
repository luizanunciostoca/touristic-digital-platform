# Architecture Decision Records

ADRs registram decisões arquiteturais relevantes, seu contexto, alternativas, consequências e estratégia de reversão.

## Status permitidos

- `Proposed`
- `Accepted`
- `Superseded`
- `Deprecated`
- `Rejected`

## Numeração

Use sequência de quatro dígitos:

```text
0001-titulo-curto.md
```

## Conteúdo obrigatório

1. Status e data.
2. Contexto e problema.
3. Decisão.
4. Alternativas consideradas.
5. Consequências positivas e negativas.
6. Impacto na preservação da V1.
7. Estratégia de migração e rollback.
8. Evidências e documentos relacionados.

## Regras

- Mudanças de fronteiras de módulos, providers, contratos públicos, persistência, segurança, pagamentos ou estratégia multi-destino exigem ADR.
- ADR aceito não é editado para alterar a decisão; uma nova decisão deve substituí-lo.
- Nenhuma substituição de comportamento da V1 é autorizada apenas por ADR: equivalência e rollback continuam obrigatórios.
