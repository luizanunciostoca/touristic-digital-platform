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
- `services/`: adapters/processos server-side atualmente materializados para Auth, CRM, Ordering, Financial e Ticketing.
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
- `@touristic/ticketing`

`@touristic/financial` e `@touristic/ordering` começaram no M136 como packages de domínio/ports. O M137 adicionou `@touristic/financial-server` e `@touristic/ordering-server` com persistência MySQL durável. O M138 acrescentou o application service provider-neutral, revalidação do handoff, pricing authority server-only e composição recuperável entre os dois bancos. O M139 adicionou a fronteira HTTP versionada, Auth/CSRF/tenant, capability convidada assinada, status público hash-only, allowlist de retorno, auditoria e rate limiting conservador. O M140 acrescentou o adapter HTTP sandbox fail-closed. O M141 expôs webhook HMAC-SHA256 raw-body e claim deduplicado. O M142 aplicou eventos verificados pela state machine e persistiu o resultado autoritativo para Business. O M143 transforma apenas resultados `approved`/`refunded` em lançamentos double-entry determinísticos, recupera approval ausente antes da reversão e mantém falhas não monetárias. O M144 acrescenta comando de refund integral provider-neutral, claim/idempotência duráveis, adapter sandbox e boundary HTTP autenticado; a resposta do provider permanece não autoritativa, e somente o webhook verificado muda Payment e dispara a reversão. O M145 adiciona reconciliation read-only com snapshot de provider, comparação de Payment/resultados/ledger, runs/findings MySQL determinísticos e boundary admin auditado; acknowledgement nunca remedia nem altera autoridade financeira. O M146 acrescenta allocation/payable/settlement duráveis sobre autoridade financeira reconciliada, separa aceite de comando do settlement verificado, mantém idempotência estável por payable e registra split, settlement, reversão e refund pós-repasse por lançamentos double-entry imutáveis. Produção/dinheiro real, recorrência/assinaturas, browser checkout/confirmation, limiter distribuído e E2E implantado continuam bloqueados por seus próprios contratos.

`@touristic/ticketing` e `@touristic/ticketing-server` foram materializados no M147 para emissão pós-pagamento, QR assinado, check-in persistente e sincronização offline, com contrato permanente de integração MySQL. Ticketing permanece `migrating`: superfícies browser/operacionais e equivalência completa continuam separadas do núcleo backend já implementado.

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
