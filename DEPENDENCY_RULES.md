# Dependency Rules

## Regras obrigatórias

1. `apps/*` não podem importar outros `apps/*`.
2. Frontends podem importar apenas contratos, UI, clientes autorizados, observabilidade e utilitários aprovados.
3. `platform-api` e `workers` podem importar módulos de domínio.
4. Módulos de domínio não podem importar apps nem infraestrutura concreta.
5. Infraestrutura implementa portas definidas pelos módulos.
6. Imports entre módulos devem usar exclusivamente a API pública exportada por `index.ts`.
7. Dependências cíclicas são proibidas.
8. Lógica financeira e de afiliação autoritativa é exclusivamente backend.
9. Código específico de cidades não pode existir em `packages/*` ou `modules/*` compartilhados.
10. Configurações específicas de destino vivem em `destinations/<slug>/`.

## Matriz resumida

| Origem | Pode depender de |
|---|---|
| `apps/marketplace` | `packages/contracts`, `packages/ui`, `packages/auth-client`, `packages/observability` |
| `apps/business-portal` | mesmos pacotes de frontend e SDKs aprovados |
| `apps/platform-admin` | mesmos pacotes de frontend e SDKs administrativos |
| `apps/platform-api` | módulos de domínio, contratos, observabilidade e infraestrutura via adapters |
| `apps/workers` | módulos de domínio, eventos, observabilidade e infraestrutura via adapters |
| `modules/*` | contratos compartilhados, value objects e ports |
| `infra/*` | módulos e ports que implementa |
| `destinations/*` | contratos de configuração e design tokens |

A validação automática deverá ser executada no CI por ferramenta de análise de dependências.
