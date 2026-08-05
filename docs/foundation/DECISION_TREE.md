# Architecture Decision Tree

## 1. Novo código

### O código é implantável de forma independente?

- Sim → avalie criar `app` ou serviço implantável.
- Não → continue.

### O código representa regras e linguagem próprias de um domínio?

- Sim → crie ou evolua um `module`.
- Não → continue.

### O código será reutilizado por dois ou mais consumidores reais?

- Sim → avalie um `package`.
- Não → mantenha local ao consumidor.

## 2. App ou serviço

Crie `app` quando existir uma interface de entrada ou processo implantável próprio, como frontend, API ou worker.

Extraia serviço separado somente quando houver evidência de escala, segurança, isolamento, ownership ou tecnologia independente. Sem evidência, mantenha como módulo no monólito modular.

## 3. Module ou package

- Possui invariantes, entidades, aggregates e linguagem própria? → `module`.
- Oferece capacidade técnica reutilizável sem domínio próprio? → `package`.
- Apenas reduz duplicação pequena? → permaneça local.

## 4. Aggregate, entity ou value object

- Precisa de identidade e ciclo de vida? → `entity`.
- É definido apenas por seu valor e validação? → `value object`.
- Coordena invariantes transacionais de várias entidades? → `aggregate`.

## 5. Domain Service ou Application Service

- Regra pura de negócio sem dono natural em entidade? → `domain service`.
- Orquestra caso de uso, autorização, transação, ports e eventos? → `application service`.

## 6. Port, adapter ou plugin

- O domínio precisa de capacidade externa? → defina um `port`.
- Há uma implementação concreta para provedor ou tecnologia? → crie `adapter`.
- A implementação é opcional, ativável e possui lifecycle configurável? → avalie `plugin`.

## 7. Command, query ou event

- Solicita mudança de estado? → `command`.
- Solicita leitura sem efeito colateral? → `query`.
- Representa fato já ocorrido? → `event`.

Não use evento como substituto de uma resposta síncrona obrigatória.

## 8. Workflow

Use workflow quando houver múltiplos estados, responsáveis, aprovações, SLAs, etapas assíncronas ou compensações. Para uma única transação, use application service.

## 9. Código específico de destino

- É branding, conteúdo, domínio, categoria, feature flag ou parâmetro local? → `destinations/<slug>/`.
- É regra comum a todos os destinos? → módulo compartilhado.
- É variação autorizada de regra comum? → configuração validada por contrato.
- Exige condição `if destination === ...` no core? → decisão rejeitada; redesenhar.

## 10. Integração

- A capacidade pertence ao domínio? → port definido pelo domínio.
- É detalhe de provedor? → adapter em infraestrutura.
- Precisa comunicação desacoplada? → evento.
- Precisa resposta imediata e consistente? → chamada síncrona por contrato.

## 11. Persistência

- A informação é fonte de verdade do domínio? → persistência no ownership do módulo.
- É projeção para leitura ou busca? → read model ou índice derivado.
- É registro financeiro ou auditoria? → append-only.
- É geoespacial? → PostGIS e tipos espaciais adequados.

## 12. Decisão estrutural

Crie ADR quando a mudança:

- afetar múltiplos módulos;
- alterar fronteiras;
- introduzir tecnologia estrutural;
- modificar segurança, persistência ou integração;
- criar incompatibilidade pública;
- gerar custo operacional de longo prazo.

## 13. Pergunta final

Antes de criar qualquer nova unidade, responda:

1. Qual responsabilidade única ela possui?
2. Quem é o owner?
3. Quem pode depender dela?
4. Como será testada?
5. Como será observada?
6. Como será substituída ou removida?
7. A alternativa mais simples foi descartada com evidência?
