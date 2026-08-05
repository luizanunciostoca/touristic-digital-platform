# ADR-0002 — Destinos definidos por configuração

- Status: Accepted
- Data: 2026-08-05

## Contexto

A Touristic Digital Platform deve atender Morro de São Paulo, Itacaré e futuros destinos sem duplicar o núcleo de software.

## Decisão

Cada destino será representado por configuração tipada contendo identidade, branding, localização, raio operacional, idiomas, moeda, fuso horário, conteúdo e módulos habilitados. Regras comuns permanecem em `packages/*`; diferenças locais não devem criar forks da aplicação.

Configurações devem ser validadas antes do build e em runtime quando vierem de fonte externa. Segredos e tokens não pertencem à configuração versionada.

## Alternativas consideradas

- Uma aplicação independente por destino: rejeitada por duplicação, divergência e custo operacional.
- Condicionais espalhadas no código: rejeitadas por baixa rastreabilidade.

## Consequências

### Positivas

- Entrada de novos destinos com menor custo.
- Núcleo compartilhado e evolução uniforme.
- Feature flags e conteúdo local rastreáveis.

### Negativas

- O modelo de configuração precisa de versionamento e validação rigorosos.
- Exceções realmente locais exigirão adapters explícitos.

## Preservação da V1

Morro de São Paulo permanece como primeira configuração e baseline. A parametrização não pode modificar silenciosamente layout, fluxos ou lógica existentes.

## Rollback

A aplicação poderá voltar à configuração anterior versionada sem reverter os pacotes compartilhados.
