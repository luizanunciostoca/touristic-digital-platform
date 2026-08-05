# Multi-Destination Strategy — Touristic Digital Platform

## 1. Objetivo

Permitir que a mesma plataforma opere Morro de São Paulo, Itacaré, Boipeba e futuros destinos sem duplicação estrutural de aplicações, regras ou infraestrutura.

## 2. Unidade de configuração

Cada destino possui configuração validada e versionada contendo:

- `id`, nome, slug e status;
- domínios e aliases;
- país, locale, idiomas e timezone;
- moeda e formatos locais;
- branding, assets e design tokens;
- centro, boundaries, áreas operacionais e service areas;
- módulos, planos e feature flags;
- categorias, menus e conteúdo inicial;
- integrações, secrets referenciados e limites de consumo;
- documentos legais e políticas.

## 3. Resolução de destino

Ordem:

1. hostname/domínio;
2. slug explícito da URL;
3. sessão previamente salva;
4. geolocalização autorizada;
5. seleção manual.

A resolução deve ser determinística, observável e segura contra spoofing de contexto.

## 4. Isolamento

- todo dado operacional contém `destinationId`;
- todo dado empresarial privado contém `destinationId` e `tenantId`;
- queries exigem escopo explícito;
- cache, índices, filas, logs e métricas preservam o contexto;
- acesso cross-destination é restrito, explícito e auditado.

## 5. Geografia

PostGIS é a fonte de verdade para boundaries, pontos, linhas, polígonos, multipolígonos e service areas.

- inclusão territorial prefere polígonos;
- raio serve para proximidade ou fallback;
- `BusinessLocation` representa localização física;
- `ServiceArea` representa área atendida;
- provedores externos podem operar por exceção auditada quando atendem o destino.

## 6. Branding e Design System

O Design System possui camada base compartilhada e tema por destino. A configuração pode substituir tokens e assets permitidos, sem duplicar componentes.

## 7. Conteúdo e taxonomia

Categorias globais podem ser habilitadas, traduzidas ou especializadas por destino. Conteúdo editorial, menus e páginas são versionados e publicados por destino.

## 8. Integrações

Providers são configurados por capabilities. Um destino pode usar adapters distintos, desde que respeitem os contratos comuns.

Secrets não ficam no arquivo de configuração; são referenciados por identificadores seguros de ambiente.

## 9. Afiliados

Afiliados permanecem globais e pertencentes à plataforma. Devem ser registrados destino de aquisição, destino atual e regras configuráveis de comissão cross-destination.

## 10. Administração

O Admin CRM oferece:

- visão global;
- visão por destino;
- comparação autorizada;
- delegação de papéis por escopo;
- auditoria de mudanças de configuração;
- lifecycle do destino.

## 11. Lifecycle de um destino

```text
DRAFT
→ VALIDATION
→ STAGING
→ ACTIVE
→ SUSPENDED
→ ARCHIVED
```

Ativação exige domínio, configuração, limites geográficos, conteúdo mínimo, responsáveis, observabilidade, políticas legais e testes.

## 12. Onboarding de novo destino

1. criar registro e configuração;
2. cadastrar boundary e parâmetros locais;
3. aplicar branding e conteúdo inicial;
4. configurar módulos, planos e integrações;
5. importar ou cadastrar catálogo;
6. validar segurança, isolamento e performance;
7. executar E2E e regressão visual;
8. lançar progressivamente.

## 13. Proibições

- clonar o código da aplicação para um novo destino;
- inserir condicionais por cidade no Core;
- usar hostname sem validação como autorização;
- compartilhar dados privados entre destinos por padrão;
- criar schema incompatível sem versionamento.

## 14. Métrica de sucesso

Um novo destino deve ser lançado principalmente por configuração, conteúdo e operação, com mudanças de Core apenas quando surgir capacidade realmente reutilizável.