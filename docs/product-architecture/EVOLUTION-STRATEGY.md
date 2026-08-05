# Evolution Strategy — Touristic Digital Platform

## 1. Objetivo

Definir quando preservar, adaptar, refatorar, substituir, criar adapter ou criar novo módulo.

## 2. Decisão padrão

Para código e comportamento validados da V1, a decisão padrão é preservar. Alteração exige evidência de benefício e contrato de equivalência.

## 3. Preservar

Escolher preservar quando:

- comportamento é correto e utilizado;
- risco de mudança supera benefício imediato;
- não há vulnerabilidade ou bloqueio estrutural;
- interface é parte da identidade validada;
- migração pode ser realizada por encapsulamento.

Ação: copiar de forma controlada, registrar origem/hash, criar testes e manter baseline.

## 4. Preservar e modularizar

Escolher quando a lógica é válida, mas mistura responsabilidades ou depende de globais.

Ação: criar façade/adapter, extrair contratos e migrar por etapas sem alterar resultado externo.

## 5. Generalizar por configuração

Escolher quando código contém dados ou regras específicas de destino que variam legitimamente.

Ação: mover branding, conteúdo, limites, categorias, feature flags, providers e políticas para configuração tipada.

Não generalizar invariantes universais apenas para criar flexibilidade artificial.

## 6. Criar adapter

Escolher quando a plataforma depende de SDK, API, storage, pagamento, mapa, IA ou mensageria externa.

Ação: definir port estável no domínio e implementar adapters substituíveis, com testes de contrato e fallback quando necessário.

## 7. Refatorar

Escolher quando:

- há duplicação com risco real;
- fronteiras impedem testes ou evolução;
- complexidade causa incidentes;
- segurança ou performance exigem mudança interna;
- contratos externos podem ser preservados.

Ação: refatoração incremental, protegida por testes e observabilidade.

## 8. Substituir

Somente quando:

- componente é inseguro, abandonado ou incompatível;
- custo total de preservação é maior que substituição;
- equivalência pode ser demonstrada;
- rollback e migração estão definidos.

A substituição exige ADR e não autoriza perda silenciosa de funcionalidade.

## 9. Criar novo módulo

Criar quando existe um conjunto coerente de invariantes, dados, lifecycle e linguagem de negócio com owner claro.

Não criar módulo apenas por pasta, tela ou tecnologia.

## 10. Incorporar em módulo existente

Escolher quando a nova capacidade compartilha owner, invariantes e lifecycle com um domínio atual e não aumenta acoplamento indevido.

## 11. Critérios de avaliação

Cada decisão considera:

- valor ao usuário e ao negócio;
- risco de regressão;
- segurança e privacidade;
- compatibilidade e migração;
- custo operacional e de providers;
- testabilidade;
- performance e escala;
- reutilização multi-destino;
- reversibilidade.

## 12. Processo

1. localizar Feature e Capability IDs;
2. identificar comportamento e código de origem;
3. medir dependências e uso;
4. escolher política de evolução;
5. registrar ADR quando estrutural;
6. implementar em fatias reversíveis;
7. validar equivalência e métricas;
8. remover legado somente após critérios de retirement.

## 13. Dívida técnica

Dívida é registrada com impacto, risco, owner, evidência e condição de pagamento. Não se reescreve código apenas por preferência estética.

## 14. Compatibilidade

APIs, eventos, configuração e dados seguem versionamento e depreciação. Mudanças expand/contract são preferidas para evitar indisponibilidade.

## 15. Regra final

Evoluir significa preservar o valor validado enquanto se reduz risco, acoplamento e custo. A arquitetura serve ao produto; não substitui evidência.