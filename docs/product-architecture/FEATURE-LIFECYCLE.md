# Feature Lifecycle — Touristic Digital Platform

## 1. Estados oficiais

```text
IDEA
DISCOVERY
DESIGN
ARCHITECTURE
READY
IMPLEMENTATION
VALIDATION
RELEASE_CANDIDATE
PRODUCTION
DEPRECATED
RETIRED
```

## 2. IDEA

Registra problema, oportunidade, público afetado e hipótese de valor. Não autoriza implementação.

Saída: Feature ID provisório e owner de discovery.

## 3. DISCOVERY

Valida problema, evidência, jornada atual, impacto, riscos, métricas e alternativas.

Saída: decisão de continuar, pausar ou cancelar.

## 4. DESIGN

Define experiência, acessibilidade, conteúdo, estados, responsividade, erro, vazio, loading e baseline visual.

Saída: especificação testável.

## 5. ARCHITECTURE

Define domínio owner, contratos, dados, APIs, eventos, permissões, integrações, observabilidade, risco e rollback.

Saída: Capability Matrix e ADR quando necessário.

## 6. READY

Pré-condições:

- escopo fechado;
- critérios de aceite;
- dependências resolvidas;
- segurança e LGPD avaliadas;
- testes planejados;
- métricas definidas.

## 7. IMPLEMENTATION

Código em branch protegida, commits rastreáveis, feature flag quando necessário e documentação atualizada.

## 8. VALIDATION

Executa testes unitários, integração, contratos, E2E, regressão visual/comportamental, segurança, performance e validação manual.

## 9. RELEASE CANDIDATE

Versão congelada para homologação, observabilidade ativa, rollback testado, migrações revisadas e go-live checklist preenchido.

## 10. PRODUCTION

Feature disponível conforme rollout definido. Métricas, alertas, erros e feedback são monitorados.

## 11. DEPRECATED

Uso novo é desencorajado. Deve existir alternativa, prazo, comunicação, telemetria de uso e plano de remoção.

## 12. RETIRED

A remoção somente ocorre após ausência de dependentes, migração concluída, evidências arquivadas, rollback desnecessário e aprovação registrada.

## 13. Regras especiais para a V1

Funcionalidade migrada da V1 não avança para produção sem:

- fluxo comportamental mapeado;
- arquivos e estilos de origem identificados;
- baseline visual;
- equivalência funcional;
- teste automatizado;
- decisão de preservação ou mudança documentada.

## 14. Responsabilidades

- Product owner: valor, escopo e métricas.
- Design: experiência e acessibilidade.
- Domain owner: invariantes e contratos.
- Engineering: implementação, testes e operação.
- Security/Privacy: risco, autorização e dados.
- Release owner: rollout, monitoramento e rollback.

## 15. Evidências obrigatórias

Cada estado deve deixar links rastreáveis no Feature Registry para documentação, PRs, testes, baselines, métricas, incidentes e decisões.