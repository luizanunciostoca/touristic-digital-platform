# Package Creation Guide

## Objetivo

Definir quando criar `app`, `module`, `package`, `service`, `aggregate`, `adapter`, `plugin`, `SDK`, `workflow` ou `event`, evitando fragmentação e acoplamento.

## App

Crie em `apps/` quando houver unidade implantável com processo, interface de entrada, configuração e ciclo de release próprios.

Exemplos:

- `platform-admin`
- `marketplace`
- `business-portal`
- `platform-api`
- `workers`

Não crie um app apenas para organizar código.

## Module

Crie em `modules/` quando existir bounded context com linguagem, regras, invariantes e ownership próprios.

Critérios:

- possui modelo de domínio próprio;
- protege invariantes;
- expõe API pública explícita;
- pode emitir eventos;
- não depende de apps ou infraestrutura concreta.

## Package

Crie em `packages/` quando o código for reutilizável, tecnicamente coeso e não representar um bounded context.

Exemplos:

- contratos compartilhados;
- design tokens;
- UI;
- observabilidade;
- clientes de autenticação;
- configuração de lint e TypeScript;
- ferramentas de teste.

Não criar pacote para uma única função sem perspectiva real de reutilização.

## Service implantável

Crie serviço separado somente quando ao menos um critério for comprovado:

- escala independente;
- isolamento de falha;
- requisitos de segurança diferentes;
- ownership operacional próprio;
- tecnologia incompatível;
- ciclo de deploy independente indispensável.

A preferência inicial é modular monolith dentro do monorepo.

## Aggregate

Crie aggregate quando um conjunto de entidades e value objects precisar preservar invariantes transacionais sob uma raiz.

Não use aggregate como sinônimo de tabela ou DTO.

## Domain Service

Use quando uma regra de domínio não pertencer naturalmente a uma entidade ou aggregate, mas ainda for pura e independente de infraestrutura.

## Application Service

Use para orquestrar casos de uso, transações, ports, autorização contextual e publicação de eventos. Não deve conter regra de domínio essencial.

## Adapter

Crie quando implementar um port para banco, fila, pagamentos, mapas, storage, e-mail ou outro provedor.

Adapters ficam na infraestrutura e podem ser substituídos sem alterar o domínio.

## Plugin

Crie quando uma extensão opcional, habilitável por configuração, implementar contratos estáveis e possuir lifecycle próprio.

Plugins não podem alterar invariantes do core sem API explícita.

## SDK

Crie quando consumidores externos ou apps precisarem de cliente estável e versionado para APIs públicas. Evitar SDK antes de contrato público amadurecer.

## Workflow

Crie quando o processo possuir múltiplos estados, responsáveis, SLAs, compensações ou etapas assíncronas. Não usar workflow para uma única transação simples.

## Event

Crie evento quando um fato relevante já tiver ocorrido e outros consumidores puderem reagir sem acoplamento síncrono.

Não use evento para esconder comando síncrono obrigatório.

## Value Object

Crie quando um conceito for definido por valor, possuir validação própria e não precisar de identidade independente.

Exemplos: Money, GeoPoint, DateRange, EmailAddress.

## Shared code

Antes de mover para compartilhado, confirmar:

1. há ao menos dois consumidores reais;
2. o conceito tem nome e responsabilidade claros;
3. não contém regra específica de app ou destino;
4. a API pode permanecer pequena e estável;
5. a extração reduz acoplamento, não apenas duplicação visual.

## Checklist de criação

- [ ] O ownership está claro?
- [ ] Existe alternativa mais simples?
- [ ] A fronteira está documentada?
- [ ] A dependência respeita a matriz?
- [ ] A API pública está definida?
- [ ] Há testes adequados?
- [ ] Existe estratégia de versionamento?
- [ ] A observabilidade necessária foi considerada?
- [ ] O nome segue o Naming Bible?

## Regra final

Quando houver dúvida entre criar nova unidade ou manter código local, prefira manter local até existir responsabilidade e reutilização comprovadas.
