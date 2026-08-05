# Product Roadmap — Touristic Digital Platform

## 1. Direção

O roadmap organiza a evolução por resultados, não por datas rígidas. Cada release exige critérios de entrada e saída, evidências de qualidade e aprovação dos domínios afetados.

## 2. V2.0 — Equivalência e Foundation

Objetivo: reproduzir integralmente a experiência validada da V1 sobre a arquitetura multi-destino.

Marcos:

1. Foundation do monorepo e governança.
2. Auditoria executável e baselines da V1.
3. Design System preservado e tokenizado.
4. Core UI e shell responsivo.
5. Geospatial e navegação por adapters.
6. Marketplace público.
7. Business Portal.
8. Admin CRM integrado por API.
9. Segurança, observabilidade e go-live.

Critérios de saída:

- fluxos críticos com equivalência comportamental;
- regressão visual dentro da tolerância aprovada;
- nenhum acesso cross-tenant indevido;
- monitoramento, backup e rollback testados;
- performance igual ou superior à baseline acordada.

## 3. V2.1 — Transação e Receita

Objetivo: ativar monetização e operação transacional.

Entregas:

- reservas e disponibilidade;
- pedidos e checkout;
- Mercado Pago por adapter;
- assinaturas empresariais;
- split, repasses e estornos;
- ledger financeiro;
- programa de afiliados da plataforma;
- carteira, comissões e payouts;
- conciliação e auditoria financeira.

Critérios de saída:

- invariantes financeiras testadas;
- webhooks idempotentes;
- sandbox E2E aprovado;
- reconciliação e reversões validadas;
- nenhuma credencial real em ambientes não produtivos.

## 4. V2.2 — Operação e Inteligência

Objetivo: elevar eficiência operacional e decisão baseada em dados.

Entregas:

- Admin CRM expandido;
- CMS por destino;
- analytics de funil e conversão;
- observabilidade avançada;
- suporte e auditoria operacional;
- busca aprimorada;
- recomendações iniciais;
- automações e notificações.

## 5. V3.0 — Escala Multi-destino

Objetivo: operar múltiplos destinos com um único núcleo.

Entregas:

- onboarding de novos destinos;
- administração global e por destino;
- catálogo e conteúdo configuráveis;
- regras geográficas e service areas;
- isolamento e relatórios cross-destination autorizados;
- templates de implantação;
- white label;
- SDKs e integração de parceiros.

Critérios de saída:

- segundo destino lançado sem duplicação de aplicação;
- configuração validada por schema;
- observabilidade segmentada por destino;
- custos e capacidade medidos por destino.

## 6. V3.1 — Rede Regional

Objetivo: conectar destinos e operadores em uma malha regional.

Entregas:

- marketplace regional;
- itinerários multidestino;
- afiliados e aquisição cross-destination configuráveis;
- operações e relatórios consolidados;
- integrações de transporte e operadores.

## 7. V4.0 — Plataforma Internacional e Inteligente

Objetivo: internacionalização e experiência turística assistida por IA.

Entregas:

- múltiplas moedas e regras fiscais configuráveis;
- internacionalização avançada e RTL;
- IA multimodal;
- recomendação contextual;
- planejamento de viagem;
- turismo preditivo;
- otimização dinâmica de oferta e capacidade;
- APIs e ecossistema de terceiros.

## 8. KPIs técnicos

- disponibilidade e taxa de erro;
- Core Web Vitals;
- tempo de recuperação;
- cobertura de fluxos críticos;
- regressões por release;
- vulnerabilidades abertas por severidade;
- tempo de onboarding de um destino;
- custo de infraestrutura e providers por destino.

## 9. KPIs de produto e negócio

- usuários ativos e retenção;
- buscas com resultado útil;
- conversão de descoberta para contato, reserva ou compra;
- GMV e receita da plataforma;
- empresas ativas e churn;
- reservas e cancelamentos;
- conversão e custo de aquisição por afiliado;
- satisfação do turista e da empresa.

## 10. Gate de priorização

Uma iniciativa entra em sprint quando possui owner, Feature ID, capacidade correspondente, contrato, risco, critérios de aceite, dependências e métrica de sucesso.