# Touristic Digital Platform — Platform Bible

## 1. Propósito

A Touristic Digital Platform é o núcleo reutilizável para criação, operação e evolução de ecossistemas digitais de destinos turísticos. Morro Digital é a primeira configuração oficial da plataforma e permanece como baseline funcional, visual e comportamental.

## 2. Missão

Conectar turistas, moradores, empresas, operadores, afiliados e administradores em uma experiência digital única, confiável, acessível, segura e extensível para múltiplos destinos.

## 3. Princípios imutáveis

1. Preservar a experiência validada da V1 antes de refatorar.
2. Nenhum destino deve exigir duplicação estrutural do produto.
3. O núcleo da plataforma não pode conter nomes, regras ou assets específicos de uma cidade.
4. Regras financeiras, de afiliados, autenticação e autorização permanecem no backend.
5. Toda alteração estrutural relevante exige ADR.
6. Toda migração exige contrato de equivalência, evidência e rollback.
7. Aplicações dependem de pacotes; pacotes não dependem de aplicações.
8. Domínios publicam contratos e eventos públicos, nunca detalhes internos.
9. Dados operacionais possuem `destinationId`; dados privados empresariais também possuem `tenantId`.
10. Segurança, LGPD, observabilidade e auditabilidade fazem parte da definição de pronto.

## 4. Modelo organizacional

A plataforma é organizada em aplicações, pacotes compartilhados, módulos de domínio, configurações de destino, infraestrutura e ferramentas internas.

- **Aplicações:** Marketplace, Business Portal, Admin CRM, API, Workers e CMS.
- **Pacotes:** contratos, UI, design tokens, autenticação, observabilidade e utilitários.
- **Domínios:** identidade, destino, tenancy, catálogo, pedidos, reservas, financeiro, afiliados, notificações, busca, IA e geoespacial.
- **Destinos:** configurações tipadas de marca, conteúdo, regras geográficas, módulos, integrações, planos e feature flags.

## 5. Destination e Tenant

- **Destination** representa uma unidade turística, geográfica, operacional e de marca.
- **Tenant** representa uma organização ou empresa que opera dentro de um destino.
- Um tenant não pode acessar dados de outro tenant.
- Acesso cross-destination deve ser explícito, autorizado e auditado.
- A resolução de destino segue: domínio/hostname, slug, sessão, geolocalização autorizada e seleção manual.

## 6. Multi-destino

Novos destinos são criados por configuração, sem duplicação de código. A configuração pode definir:

- identidade e branding;
- domínio e URLs;
- idiomas, moeda, timezone e formatos locais;
- limites geográficos e regras de inclusão;
- módulos habilitados;
- categorias e taxonomias;
- conteúdo, menus e páginas;
- planos, preços e documentos legais;
- integrações e feature flags.

## 7. Geoespacial

A plataforma deve ser neutra em relação a provedores externos. São definidos contratos separados para renderização de mapa, geocodificação, roteamento, matriz e busca geográfica.

PostgreSQL com PostGIS é a fonte de verdade para dados espaciais próprios. Polígonos e multipolígonos são preferidos para inclusão geográfica; raio é apenas fallback ou recurso de proximidade.

Rotas locais de pedestres, escadas, vielas, cais e trajetos marítimos podem exigir grafos próprios, independentemente do provedor comercial.

## 8. Marketplace

O Marketplace B2C oferece descoberta, conteúdo, empresas, produtos, serviços, eventos, passeios, hospedagem, reservas, pedidos e pagamentos. Ele consome contratos públicos e não acessa diretamente persistência, provedores financeiros ou APIs geoespaciais.

## 9. Business Portal

O Business Portal permite que empresas gerenciem dados próprios, conteúdo, produtos, agenda, reservas, ofertas, métricas e configurações autorizadas. Ele não administra afiliados da plataforma e não possui acesso cross-tenant.

## 10. Admin CRM

O Admin CRM administra destinos, tenants, usuários, catálogo, operações, conteúdo, afiliados, financeiro, auditoria e suporte. Deve consumir uma API administrativa versionada e nunca compartilhar banco diretamente com o Platform Core.

## 11. Afiliados

Afiliados pertencem exclusivamente à plataforma. Empresas não criam, controlam ou liquidam afiliados próprios.

A atribuição segue o vínculo Afiliado → Cliente → compras no Marketplace. A plataforma define regras de comissão, carteira, auditoria e pagamentos.

## 12. Financeiro

O domínio financeiro é a fonte de verdade para dinheiro, ledger, pagamentos, split, repasses, estornos e comissões. Valores monetários são representados em unidades mínimas e moeda ISO.

Mercado Pago, Stripe, Asaas ou outros provedores são adapters; nenhuma regra de negócio deve ficar acoplada ao SDK do provedor.

## 13. Segurança e LGPD

- privilégio mínimo;
- autenticação e sessões seguras;
- autorização por papel e escopo;
- criptografia em trânsito e em repouso quando aplicável;
- validação de entrada e saída;
- proteção contra CSRF, XSS, injeção, abuso e vazamento de segredos;
- retenção e descarte definidos por categoria de dado;
- trilhas de auditoria para ações sensíveis;
- segregação por destino e tenant.

## 14. Eventos e integrações

Eventos de domínio usam envelope versionado com `eventId`, `type`, `version`, `occurredAt`, `destinationId`, `tenantId` quando aplicável, `correlationId`, `causationId` quando aplicável e `payload`.

O contrato executável canônico é `PLATFORM-EVENT-ENVELOPE`, registrado em `docs/contracts/registry.json` e descrito por `docs/contracts/platform-event-envelope.v1.schema.json`. O runtime correspondente pertence a `@touristic/core`; produtores não devem criar envelopes paralelos incompatíveis.

Integrações externas devem ser idempotentes, observáveis e resilientes. Webhooks exigem assinatura, replay protection e processamento seguro.

## 15. Qualidade

A Definition of Done exige:

- formatação, lint e typecheck;
- testes unitários e de integração;
- E2E para jornadas críticas;
- regressão visual e comportamental quando aplicável;
- validação de fronteiras arquiteturais;
- análise de segurança e dependências;
- documentação atualizada;
- observabilidade e rollback definidos;
- contratos canônicos reconciliados entre registry, schema, runtime e evidência.

O Quality Gate transversal executa `pnpm platform:contracts:check` para impedir drift dos contratos de plataforma.

## 16. Versionamento

APIs, eventos, contratos, configurações e SDKs são versionados. Alterações incompatíveis exigem nova versão, política de depreciação e janela de migração.

## 17. Migração da V1

A V1 é referência de produto e baseline de equivalência. A migração é realizada por ondas e domínios, preservando primeiro e modernizando depois.

Nenhum item é removido sem:

- origem e dependências mapeadas;
- evidência de equivalência;
- testes aprovados;
- decisão registrada;
- estratégia de rollback.

## 18. Governança

- decisões estruturais: ADR;
- funcionalidades: Feature Registry;
- capacidades: Capability Matrix;
- dependências entre domínios: Domain Map e Module Contracts;
- contratos transversais: `docs/contracts/registry.json`;
- regras: Business Rules Catalog;
- evolução: Product Roadmap e Evolution Strategy;
- releases: Release Process.

## 19. Observabilidade

Logs estruturados, métricas, traces, auditoria e alertas devem incluir contexto de destino, tenant quando aplicável e correlação. Pagamentos, reservas, afiliados, integrações, GIS e autenticação possuem monitoramento específico.

O envelope mínimo canônico é `PLATFORM-OBSERVATION`, descrito por `docs/contracts/platform-observation.v1.schema.json`. Ele padroniza identidade da observação, tipo, nome, severidade, timestamp, destino, correlação, causação opcional e atributos estruturados primitivos. Este contrato é a base transversal; cada domínio continua responsável por métricas, alertas, SLOs e políticas específicas.

## 20. Regra final

A plataforma deve crescer por contratos, configuração, adapters e módulos independentes. Preservar valor validado é a regra; reescrever sem evidência é exceção.
