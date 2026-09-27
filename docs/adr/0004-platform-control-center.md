# ADR 0004 — Control Center com autoridade por capability e domínio owner

- Status: Accepted
- Data original: 2026-09-20
- Reconciliação: 2026-09-27
- Issue: #152
- Baseline original de admissão: `05f7df04eaee94de9bf894f75f6842ba6f0c3731`
- Exact main reconciliado: `df18e8d2ee329ed9d01f37389e52b95e7e96fc0d`

## 1. Contexto e problema

O Morro Digital possui superfícies e serviços administrativos distribuídos entre Identity/Auth, Business Portal, CRM, Affiliates, Ticketing, Ordering, Financial, Content, Destinations e observabilidade. O proprietário da plataforma precisa de uma aplicação administrativa central sem transformar a UI em acesso direto a bancos/tabelas ou em bypass das invariantes dos domínios.

## 2. Decisão

O **Morro Digital Control Center** é a aplicação dedicada em `apps/control-center/`, consumindo uma camada versionada `/api/admin/v1/`.

A autoridade administrativa é modelada por:

1. papéis canônicos;
2. capabilities explícitas;
3. escopo de tenant/destino quando aplicável;
4. autenticação e sessão existentes;
5. contratos administrativos dos domínios owners;
6. auditoria administrativa durável.

Papéis canônicos:

- `PLATFORM_OWNER`
- `PLATFORM_ADMIN`
- `SUPPORT`
- `AUDITOR`
- `BUSINESS_OWNER`
- `BUSINESS_MANAGER`
- `BUSINESS_VIEWER`
- `AFFILIATE`

O vocabulário legado permanece compatível durante a migração. `admin` mapeia para `PLATFORM_ADMIN`; ele não é promovido implicitamente para `PLATFORM_OWNER`.

`PLATFORM_OWNER` recebe o conjunto máximo de capabilities conhecidas, mas toda operação continua sujeita às validações de sessão, CSRF/origin, capability, scope, invariantes do domínio, step-up quando aplicável e auditoria.

## 3. Admin API

A Admin API é uma camada de orquestração. Ela pode compor projeções e encaminhar operações para adapters oficiais, mas não adquire autoridade de persistência pertencente a outro domínio.

Quando não existir contrato administrativo registrado, a API falha fechada com `DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED`. A ausência de adapter nunca autoriza consulta ou mutation direta à tabela do domínio.

A reconciliação de 2026-09-27 confirma owner adapters atuais para Business/Place, CRM, Affiliates, Ticketing, Ordering/Financial, Content, Destinations e Commerce/Catalog onde aplicável. O residual de #152 não é restaurar arquitetura V1, mas completar/provar somente a abrangência atual ainda ausente.

## 4. Support Session

Support Mode preserva duas identidades:

- `actor`: operador autenticado real;
- `effectiveUser`: identidade cuja experiência está sendo reproduzida.

A sessão de suporte:

- usa token assinado separado;
- é vinculada ao `actorSessionId`;
- expira em janela curta;
- requer `support.impersonate`;
- requer motivo;
- não permite impersonar identidades platform-wide;
- não substitui credenciais;
- mantém o actor na auditoria;
- não concede autoridade para ações críticas que explicitamente falham fechadas em Support Mode.

## 5. Auditoria e estado administrativo

A decisão original previa que uma projeção somente-runtime não seria suficiente. Esse ponto foi posteriormente concluído.

O estado atual usa:

- auditoria administrativa MySQL append-only;
- falha fechada de mutations quando a auditoria obrigatória está indisponível;
- Auth security state durável para sessões, revogações, status de principal e role overrides quando `AUTH_DATABASE_URL` está configurado;
- produção falha fechada sem estado de segurança durável.

Portanto, o GAP histórico de “persistência administrativa durável” está superseded.

## 6. Ações críticas

Ações críticas implementadas incluem, conforme o domínio:

- revogação de sessão;
- block/reactivate de principal;
- alteração de role;
- suspensão/reactivação de membership de Affiliate;
- refund/reconciliation/acknowledgement Financial.

Essas ações permanecem sujeitas a capability, CSRF/origin, step-up, motivo/confirmation quando definido pelo contrato e auditoria. Financial/provider authority continua pertencendo ao domínio owner e nenhuma autorização real-money é criada por esta ADR.

O hardening residual de #152 inclui proteção mais ampla de replay/rate-limit na Admin API sem duplicar ou substituir idempotência já pertencente aos domínios.

## 7. Alternativas consideradas

### Expandir `apps/admin-crm`

Rejeitada. CRM continuaria acumulando responsabilidades alheias ao seu domínio.

### Dar acesso direto do Control Center aos bancos

Rejeitada. Quebra ownership, invariantes, auditabilidade, isolamento de tenant e rollback.

### Tornar `admin` um bypass global

Rejeitada. Mantém verificações dispersas e aumenta risco de privilege escalation.

## 8. Consequências

### Positivas

- autorização centralizada e testável;
- compatibilidade gradual;
- separação clara entre UI, orquestração e autoridade do domínio;
- suporte auditável;
- evolução incremental dos adapters;
- estado administrativo durável sem transformar o Control Center em owner de outros domínios.

### Resíduos operacionais

A aceitação da arquitetura não significa que FEATURE-0012 esteja concluída. O ledger atual mantém como `VALID_MISSING` somente:

- breadth final de Dashboard;
- breadth final de Universal Search;
- eventual residual real de Business admin após reconciliação;
- hardening amplo de Admin API replay/rate-limit;
- final qualification dedicada em um exact head;
- aceitação dedicada de Control Center em staging.

## 9. Preservação e evolução

Comportamentos equivalentes e domínios owners não devem ser substituídos por código histórico. Requisitos antigos devem ser classificados semanticamente como `PRESENT_IN_MAIN`, `SUPERSEDED`, `VALID_MISSING` ou `OBSOLETE`.

## 10. Rollback

Rollback do Control Center deve remover/reverter a camada de apresentação/orquestração sem migrar autoridade para acesso direto a bancos. Estado append-only e trilhas de auditoria não devem ser apagados por rollback.

## 11. Evidências relacionadas

- Issue #152
- `docs/control-center/IMPLEMENTATION.md`
- `docs/features/registry.json` — FEATURE-0012
- `docs/product-architecture/CAPABILITY-MATRIX.md`
- `packages/auth/src/index.ts`
- `apps/morro-digital-platform/tooling/auth-api.mjs`
- `apps/morro-digital-platform/tooling/admin-api.mjs`
- `apps/morro-digital-platform/tooling/admin-domain-adapters.mjs`
- `apps/control-center/public/`
- workflows `control-center-*-contract.yml`
