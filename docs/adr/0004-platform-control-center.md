# ADR 0004 — Control Center com autoridade por capability e domínio owner

- Status: Proposed
- Data: 2026-09-20
- Issue: #152
- Baseline de admissão: `05f7df04eaee94de9bf894f75f6842ba6f0c3731`

## 1. Contexto e problema

O Morro Digital possui superfícies e serviços administrativos distribuídos entre Identity/Auth, Business Portal, CRM, Affiliates, Ticketing, Ordering, Financial, Content e observabilidade. O papel legado `admin` concede alcance global em alguns boundaries e coexistem referências arquiteturais a `SUPER_ADMIN`, sem um modelo runtime canônico único.

O proprietário da plataforma precisa de uma aplicação administrativa central sem transformar a UI em acesso direto a bancos/tabelas ou em bypass das invariantes dos domínios.

## 2. Decisão

Criar o **Morro Digital Control Center** como aplicação dedicada em `apps/control-center/`, consumindo uma camada versionada `/api/admin/v1/`.

A autoridade administrativa passa a ser modelada por:

1. papéis canônicos;
2. capabilities explícitas;
3. escopo de tenant/destino quando aplicável;
4. autenticação e sessão existentes;
5. contratos administrativos dos domínios owners;
6. auditoria administrativa.

Papéis canônicos:

- `PLATFORM_OWNER`
- `PLATFORM_ADMIN`
- `SUPPORT`
- `AUDITOR`
- `BUSINESS_OWNER`
- `BUSINESS_MANAGER`
- `BUSINESS_VIEWER`
- `AFFILIATE`

O vocabulário legado `owner/manager/viewer/admin` permanece compatível durante a migração. `admin` mapeia para `PLATFORM_ADMIN`; ele não é promovido implicitamente para `PLATFORM_OWNER`.

`PLATFORM_OWNER` recebe o conjunto máximo de capabilities conhecidas, mas toda operação continua sujeita às validações de sessão, CSRF/origin, capability, scope, invariantes do domínio e auditoria.

## 3. Admin API

A Admin API é uma camada de orquestração. Ela pode compor projeções e encaminhar operações para adapters oficiais, mas não adquire autoridade de persistência pertencente a outro domínio.

Quando não existir contrato administrativo registrado, a API deve falhar fechada com `DOMAIN_ADMIN_CONTRACT_NOT_REGISTERED`. A ausência de adapter nunca autoriza consulta ou mutation direta à tabela do domínio.

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
- deve manter o actor na auditoria.

## 5. Auditoria

A implementação inicial produz eventos administrativos append-only para o pipeline de observabilidade já existente e mantém uma projeção somente-runtime para consulta pela UI.

Essa projeção **não** satisfaz o critério final de auditoria imutável durável. FEATURE-0012 permanece `partial` até existir persistência administrativa append-only durável, com política de retenção e leitura autorizada.

## 6. Ações críticas

Refund, alteração de privilégio administrativo, suspensão, exclusão, política financeira e mudanças globais exigirão capability específica e contrato de step-up. Nenhuma ação financeira real é habilitada por esta ADR.

## 7. Alternativas consideradas

### Expandir `apps/admin-crm`

Rejeitada. CRM continuaria acumulando responsabilidades alheias ao seu domínio e ficaria difícil aplicar segregação e navegação central.

### Dar acesso direto do Control Center aos bancos

Rejeitada. Quebra ownership, invariantes, auditabilidade, isolamento de tenant e capacidade de rollback.

### Tornar `admin` um bypass global

Rejeitada. Mantém verificações dispersas, aumenta risco de privilege escalation e conflita com a exigência de autoridade máxima sem bypass de segurança.

## 8. Consequências

### Positivas

- autorização centralizável e testável;
- compatibilidade gradual;
- separação clara entre UI, orquestração e autoridade do domínio;
- suporte auditável;
- evolução incremental dos adapters sem inventar funcionalidade.

### Negativas

- durante a migração existirão módulos `PARTIAL/GAP`;
- alguns boundaries legados ainda precisarão ser convertidos para capabilities;
- audit persistente e step-up exigem trabalho adicional;
- integrações administrativas precisam ser implementadas domínio a domínio.

## 9. Preservação da V1

A decisão não substitui comportamento funcional já equivalente da V1. Os papéis legados permanecem aceitos e os painéis existentes continuam sendo owners de suas jornadas até a migração validada.

## 10. Migração e rollback

1. adicionar papéis/capabilities mantendo roles legadas;
2. migrar verificações administrativas gradualmente;
3. montar Admin API e Control Center sem remover painéis existentes;
4. registrar adapters oficiais por domínio;
5. provar security negative cases;
6. somente depois considerar remoção de compatibilidade legada em ADR posterior.

Rollback da primeira fase é remover a montagem do Admin API/Control Center e reverter os commits capability-first; não há migration destrutiva nem alteração de dados nesta fase.

## 11. Evidências relacionadas

- Issue #152
- `docs/features/registry.json` — FEATURE-0012
- `docs/product-architecture/CAPABILITY-MATRIX.md` — CAP-0031..CAP-0036
- `packages/auth/src/index.ts`
- `apps/morro-digital-platform/tooling/admin-api.mjs`
- `apps/control-center/public/`
