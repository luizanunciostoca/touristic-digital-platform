# ADR-002 — Destination Core, Geolocalização e Geofencing

## Status

Aceito.

## Contexto

Cada destino precisa operar como experiência própria, com identidade, conteúdo, empresas, regras e alcance geográfico específicos, sem duplicar o núcleo da plataforma.

## Decisão

Criar um bounded context `Destination` responsável por:

- cadastro e ciclo de vida de destinos;
- resolução por domínio, slug, sessão, geolocalização autorizada ou seleção manual;
- identidade visual e configurações;
- geofences oficiais;
- áreas de atendimento;
- validação de pertencimento geográfico;
- feature flags e parâmetros por destino.

PostgreSQL com PostGIS será o padrão para persistência geoespacial.

Polígonos e multipolígonos serão a fonte oficial de pertencimento. Raios serão usados para descoberta aproximada, consultas de proximidade e fallback.

## Modelo mínimo

- `Destination`
- `DestinationDomain`
- `DestinationBoundary`
- `DestinationConfig`
- `DestinationFeatureFlag`
- `BusinessLocation`
- `ServiceArea`
- `DestinationContext`

## Regras

- Todo dado operacional relevante deve conter `destinationId`.
- Dados privados de empresas também devem conter `tenantId`.
- Acesso entre destinos exige autorização explícita e auditoria.
- O GPS do usuário nunca será a única forma de resolução.
- A sede de uma empresa e sua área de atendimento são conceitos distintos.
- Exceções geográficas administrativas devem ser auditáveis.

## Consequências

A plataforma poderá operar Morro Digital, Itacaré Digital e futuros destinos como experiências específicas sobre o mesmo núcleo, mantendo isolamento e governança central.
