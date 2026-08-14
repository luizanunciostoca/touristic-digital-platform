# Touristic Digital Platform

Plataforma multi-destino que evolui a V1 do Morro Digital sem reconstruí-la de forma desconectada.

## Princípios obrigatórios

1. Preservar antes de substituir.
2. Transformar a V1 na plataforma, mantendo equivalência visual, funcional e comportamental.
3. Novos destinos entram por configuração, não por duplicação de código.
4. Mapbox permanece como engine geoespacial principal; OpenRouteService e Leaflet compõem a estratégia de resiliência.
5. Nenhuma remoção ocorre sem inventário, ADR, testes e evidência de equivalência.

## Estrutura física atual

- `apps/`: produtos executáveis por público e operação, incluindo Morro Digital e Admin CRM.
- `packages/`: capacidades reutilizáveis e contratos de domínio.
- `services/`: adapters/processos server-side atualmente materializados para Auth, CRM, Ordering e Financial.
- `tooling/`: enforcement arquitetural, inventários e engenharia de suporte.
- `docs/`: constituição, arquitetura, handbook, ADRs, QA, operações e migração.
- `.github/workflows/`: Quality Gate e contratos automatizados especializados.

`infrastructure/` faz parte do boundary arquitetural desejado para deploy, ambientes e observabilidade, mas **ainda não existe como diretório físico no `main`**. Até que esse boundary seja materializado, não deve ser apresentado como implementação concluída; automação de CI/release e parte do runtime operacional permanecem distribuídas entre `.github/workflows/`, `tooling/`, `apps/*/tooling` e `docs/operations`.

## Packages atuais

- `@touristic/assistant`
- `@touristic/auth`
- `@touristic/auth-browser`
- `@touristic/business`
- `@touristic/core`
- `@touristic/crm`
- `@touristic/design-system`
- `@touristic/financial`
- `@touristic/geospatial`
- `@touristic/navigation`
- `@touristic/ordering`
- `@touristic/search`
- `@touristic/shared`

 `@touristic/financial` e `@touristic/ordering` começaram no M136 como packages de domínio/ports. O M137 adicionou `@touristic/financial-server` e `@touristic/ordering-server` com persistência MySQL durável. O M138 acrescentou o application service provider-neutral, revalidação do handoff, pricing authority server-only e composição recuperável entre os dois bancos. O M139 adicionou a fronteira HTTP versionada, Auth/CSRF/tenant, capability convidada assinada, status público hash-only, allowlist de retorno, auditoria e rate limiting conservador. O M140 acrescentou o adapter HTTP sandbox fail-closed atrás de `FinancialCheckoutProviderPort`, preservando a idempotência financeira. O M141 agora expõe o webhook sandbox versionado, verifica HMAC-SHA256 sobre os bytes crus com janela temporal e persiste cada evento em claim append-only deduplicado. Eventos válidos desconhecidos recebem ACK não revelador; replay exato é seguro e colisão divergente não sobrescreve evidência. O M141 ainda não aplica o resultado ao Payment, não ativa Business e não movimenta dinheiro; isso permanece no milestone seguinte.

Packages-alvo ainda não materializados, como `@touristic/affiliates`, não devem ser tratados como implementados até existirem fisicamente com contratos e evidência executável.

## Comandos

```bash
corepack enable
pnpm install
pnpm check
```

## Estado canônico

O status funcional deve ser lido em conjunto com:

- `docs/features/registry.json`;
- `docs/migration/MASTER-MIGRATION-TRACKER.md`;
- matrizes de migração por feature;
- evidências permanentes em `docs/qa/`;
- Quality Gate do head correspondente.

`equivalent` não significa `released`. A V1 continua como baseline para as ondas ainda não fechadas, enquanto rollout e produção obedecem ao processo separado de release.
