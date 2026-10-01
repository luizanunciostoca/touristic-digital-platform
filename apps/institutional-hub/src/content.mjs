export const site = Object.freeze({
  name: "Touristic Digital Platform",
  positioning: "Destination Technology Infrastructure Platform",
  tagline: "Tecnologia para destinos conectados.",
  bigIdea: "Uma plataforma comum. Cada destino, uma experiência própria.",
  language: "pt-BR",
  releaseState: "PREVIEW / NÃO PRODUÇÃO",
});

export const navigation = Object.freeze([
  ["/platform/", "Platform"],
  ["/product/", "Produto"],
  ["/destinations/", "Destinos"],
  ["/business/", "Negócios"],
  ["/market/", "Mercado"],
  ["/destination-partners/", "Parceiros"],
  ["/governance/", "Governança"],
]);

const authority = Object.freeze({
  baseline: "Wave 2 Institutional Baseline V1 · FROZEN",
  masterBook: "Institutional Master Book V3.1",
  product: "Product Visual Evidence Index V1.1",
  brand: "Brand Family V2 · Concept 02",
});

const section = (heading, body, evidence) => ({
  heading,
  body,
  ...(evidence ? { evidence } : {}),
});

const page = ({
  path,
  title,
  description,
  eyebrow,
  heading,
  lede,
  source,
  sections,
  theme = "platform",
  ctas = [],
}) => ({
  path,
  title,
  description,
  eyebrow,
  heading,
  lede,
  source,
  sections,
  theme,
  ctas,
});

export const pages = Object.freeze([
  page({
    path: "/",
    title: "Touristic Digital Platform",
    description:
      "Infraestrutura tecnológica para conectar experiência, operação e ecossistemas de destinos com identidade local preservada.",
    eyebrow: "REDE · Destination Technology Infrastructure Platform",
    heading:
      "Tecnologia compartilhada. Destinos que continuam sendo eles mesmos.",
    lede: site.bigIdea,
    source: authority.baseline,
    ctas: [
      ["/platform/", "Conheça a plataforma"],
      ["/destinations/", "Explore os destinos"],
    ],
    sections: [
      {
        heading: "Uma infraestrutura comum, experiências locais próprias",
        body: "A Touristic Digital Platform reúne tecnologia, governança, negócio e propriedade intelectual em um Platform Core comum. Morro Digital e Itacaré Digital são destination brands pares sob essa arquitetura.",
        cards: [
          [
            "REDE",
            "Touristic Digital Platform",
            "Master brand e Platform Core.",
          ],
          [
            "PERCURSO",
            "Morro Digital",
            "Ecossistema digital de Morro de São Paulo.",
          ],
          ["FLUXO", "Itacaré Digital", "Ecossistema digital de Itacaré."],
        ],
      },
      {
        heading: "O que a baseline permite afirmar",
        body: "As métricas descrevem arquitetura e capacidades canônicas; não representam adoção, receita ou implantação em produção.",
        metrics: [
          ["12", "Feature Registry entries", "status equivalent"],
          ["36", "capacidades canônicas", "arquitetura"],
          ["19", "domínios do Platform Core", "arquitetura"],
          ["4", "locales turísticos", "pt-BR · en · es · he"],
        ],
      },
      section(
        "Produto com evidência, conceito com rótulo",
        "Superfícies atuais aparecem somente quando existe evidência visual governada. Arquitetura futura e propriedades comerciais são apresentadas como framework ou conceito.",
        "CURRENT PRODUCT EVIDENCE",
      ),
    ],
  }),
  page({
    path: "/platform/",
    title: "Platform Core | Touristic Digital Platform",
    description:
      "Conheça a arquitetura multi-destino, os domínios do Platform Core e as fronteiras que preservam identidade e operação local.",
    eyebrow: "PLATFORM · REDE",
    heading:
      "Um core compartilhado. Fronteiras explícitas. Configuração local.",
    lede: "A plataforma conecta experiência, oferta local, operação do destino e dados/integrações sem centralizar toda a autoridade em uma única superfície.",
    source: authority.masterBook,
    ctas: [
      ["/product/", "Ver produto"],
      ["/technology/", "Entenda a tecnologia"],
    ],
    sections: [
      section(
        "One Platform, Many Destinations",
        "Arquitetura, contratos, segurança, governança e padrões são reutilizáveis. Marca, território, conteúdo, categorias, regras operacionais e configuração permanecem locais.",
      ),
      {
        heading: "Platform Core",
        body: "A arquitetura auditada nomeia 19 domínios. A contagem descreve estrutura arquitetural, não adoção.",
        metrics: [
          ["19", "domínios nomeados", "estrutura arquitetural"],
          ["36", "capacidades canônicas", "baseline pública"],
        ],
      },
      section(
        "Autoridade antes de conveniência",
        "Identity, Destination, Ordering e Financial mantêm fronteiras explícitas; Commerce orquestra sem assumir autoridade financeira.",
      ),
    ],
  }),
  page({
    path: "/product/",
    title: "Produto | Touristic Digital Platform",
    description:
      "Veja superfícies comprovadas para viajantes, negócios e operação de destinos, com evidência visual e guardrails claros.",
    eyebrow: "CURRENT PRODUCT EVIDENCE",
    heading: "Três perspectivas do mesmo ecossistema digital.",
    lede: "A evidência atual cobre experiência turística, operação de negócios e operação da plataforma. Uma tela comprova superfície e capacidade; não comprova tração ou resultado comercial.",
    source: authority.product,
    sections: [
      section(
        "Tourist Experience",
        "Home, Map, Search/Explore, Categories, Place, Assistant, Navigation, Commerce, Reservation/Checkout, Ticketing, QR, Tours e Profile/Privacy possuem evidência current-main.",
        "CURRENT PRODUCT EVIDENCE",
      ),
      section(
        "Business + CRM",
        "Dashboard, onboarding, perfil, localização, fotos, produtos, ofertas, menu, reservas, ticketing/check-in, financeiro, conteúdo, preview e CRM possuem evidência atual.",
        "CURRENT PRODUCT EVIDENCE",
      ),
      section(
        "Platform Operations",
        "O Control Center possui evidência para Overview, Businesses, Users, Affiliates, CRM, Products & Offers, Reservations, Ticketing, Orders, Financial, Content, Destinations, Audit, System/Health e Settings.",
        "CURRENT PRODUCT EVIDENCE",
      ),
      section(
        "Limites visuais",
        "Growth/Journey/Rewards não são promovidos como telas standalone atuais. Analytics existe como domínio/capacidade, sem tela standalone inventada.",
        "EVIDENCE BOUNDARY",
      ),
    ],
  }),
  page({
    path: "/destinations/",
    title: "Destinos | Touristic Digital Platform",
    description:
      "Morro Digital e Itacaré Digital são ecossistemas de destino pares construídos sobre um Platform Core comum.",
    eyebrow: "DESTINATION ECOSYSTEMS",
    heading: "O core é comum. O destino continua próprio.",
    lede: "A família visual e a arquitetura institucional compartilham DNA sem transformar destinos diferentes em cópias do mesmo produto.",
    source: authority.baseline,
    ctas: [
      ["/destinations/morro-digital/", "Morro Digital"],
      ["/destinations/itacare-digital/", "Itacaré Digital"],
    ],
    sections: [
      {
        heading: "Destinos pares sob a master brand",
        cards: [
          [
            "/destinations/morro-digital/",
            "Morro Digital · PERCURSO",
            "Morro de São Paulo.",
          ],
          [
            "/destinations/itacare-digital/",
            "Itacaré Digital · FLUXO",
            "Itacaré.",
          ],
        ],
      },
      section(
        "Expansão por configuração",
        "Novos destinos seguem um framework governado de diagnóstico, brand fit, geografia, configuração, conteúdo, places, negócios, commerce, parceiros, sponsorship, analytics, go-to-market, operações e lifecycle.",
      ),
    ],
  }),
  page({
    path: "/destinations/morro-digital/",
    title: "Morro Digital | Ecossistema digital de Morro de São Paulo",
    description:
      "Conheça o ecossistema digital de Morro de São Paulo conectado ao Platform Core da Touristic Digital Platform.",
    eyebrow: "MORRO DIGITAL · PERCURSO",
    heading: "Um ecossistema pensado para o percurso de Morro de São Paulo.",
    lede: "Morro Digital representa Morro de São Paulo e é a primeira configuração oficial/baseline descrita pela arquitetura atual.",
    source: authority.masterBook,
    theme: "morro",
    sections: [
      section(
        "Contexto local",
        "O destino combina praias, hospitalidade, gastronomia, lazer, vida noturna, descoberta a pé e uma logística própria de acesso. A identidade local permanece distinta da entidade-mãe.",
      ),
      section(
        "PERCURSO + evidência",
        "A linguagem PERCURSO traduz descoberta e continuidade local. As telas institucionais vêm da biblioteca current-main governada; mappings técnicos não são convertidos em contagens de parceiros.",
        "CURRENT PRODUCT EVIDENCE",
      ),
    ],
  }),
  page({
    path: "/destinations/itacare-digital/",
    title: "Itacaré Digital | Ecossistema digital de Itacaré",
    description:
      "Itacaré Digital é a destination brand de Itacaré, parte da arquitetura multi-destino da Touristic Digital Platform.",
    eyebrow: "ITACARÉ DIGITAL · FLUXO",
    heading:
      "A mesma infraestrutura precisa comportar uma lógica territorial diferente.",
    lede: "Itacaré Digital representa Itacaré como destination ecosystem par de Morro Digital. A marca é canônica; equivalência de runtime com Morro permanece não verificada.",
    source: authority.baseline,
    theme: "itacare",
    sections: [
      section(
        "Contexto territorial",
        "O contexto inclui praias urbanas e rurais, surf, trilhas, cachoeiras, Rio de Contas, natureza e aventura em um território mais distribuído.",
      ),
      section(
        "FLUXO + limite de evidência",
        "A identidade FLUXO mantém o vínculo com a REDE sem copiar PERCURSO. A página não apresenta Itacaré como runtime-equivalent a Morro Digital e a tagline permanece omitida enquanto a validação humana específica segue aberta.",
        "EVIDENCE BOUNDARY",
      ),
    ],
  }),
  page({
    path: "/business/",
    title: "Negócios | Touristic Digital Platform",
    description:
      "Entenda as superfícies para negócios locais e a arquitetura econômica da plataforma, sem confundir capacidade com resultados.",
    eyebrow: "BUSINESS",
    heading: "Operação local conectada ao contexto do destino.",
    lede: "O Business Portal e o CRM organizam presença, oferta e relacionamento. O modelo econômico é uma arquitetura de mecanismos; valores comerciais dependem de evidência própria.",
    source: authority.baseline,
    sections: [
      section(
        "Superfícies verificadas",
        "A evidência atual cobre produtos, ofertas, menu, reservas, ticketing/check-in, financeiro, conteúdo, preview e CRM.",
        "CURRENT PRODUCT EVIDENCE",
      ),
      section(
        "Arquitetura econômica",
        "O modelo organiza transações, receitas recorrentes/serviços e monetização estratégica em 13 streams estruturados, com regras para evitar dupla contagem.",
      ),
      section(
        "Dados comerciais",
        "Valores atuais de receita, volume transacionado, preços, unit economics e termos comerciais não são apresentados sem fonte aprovada.",
        "DATA REQUIRED",
      ),
    ],
  }),
  page({
    path: "/market/",
    title: "Mercado e oportunidade | Touristic Digital Platform",
    description:
      "Contexto de turismo, modelo count-based de TAM/SAM/SOM e princípios de impacto com fontes, períodos e qualificadores explícitos.",
    eyebrow: "MARKET / OPPORTUNITY",
    heading: "Contexto de mercado precisa carregar período e metodologia.",
    lede: "A baseline usa um modelo count-based de destinos. Ele organiza escopo de planejamento e não é um modelo monetário de tamanho de mercado.",
    source:
      "Publication Acceptance V1 · market refresh + " + authority.baseline,
    sections: [
      {
        heading: "Mapa do Turismo · snapshot Q1 2026",
        body: "TAM e SAM permanecem snapshots datados porque a base oficial é atualizada continuamente. SOM representa escopo de planejamento; não representa participação de mercado, contratos ou previsão.",
        metrics: [
          ["3.102", "TAM · municípios no recorte", "snapshot Q1 2026"],
          ["689", "SAM · municípios categorizados", "snapshot Q1 2026"],
          ["2", "SOM · geografias beachhead", "escopo de planejamento"],
        ],
      },
      section(
        "Impacto: medir antes de afirmar",
        "Valor local, acessibilidade, confiança e turismo responsável formam uma agenda de mensuração. Resultados só devem ser publicados com baseline, método, fonte e período comparável.",
      ),
    ],
  }),
  page({
    path: "/investors/",
    title: "Investidores | Touristic Digital Platform",
    description:
      "Conheça a tese institucional, evidências e arquitetura de expansão da Touristic Digital Platform.",
    eyebrow: "INVESTORS",
    heading:
      "Uma tese institucional baseada em arquitetura, evidência e expansão configurável.",
    lede: "O Hub apresenta apenas a tese pública. Materiais de diligência e informações comerciais controladas permanecem em canais separados.",
    source: "Investor Deck V1.2 · controlled source",
    sections: [
      section(
        "Pilares da tese",
        "Core multi-destino, produto com evidência atual, mercado por unidades de destino, 13 streams estruturados e expansão por configuração formam a tese pública.",
      ),
      section(
        "Diligência controlada",
        "Informações financeiras, termos de captação, projeções e outros dados não públicos não são publicados no Hub.",
        "CONTROLLED MATERIAL",
      ),
    ],
  }),
  page({
    path: "/sponsorship/",
    title: "Patrocínio e marcas | Touristic Digital Platform",
    description:
      "Conheça a arquitetura conceitual de patrocínio contextual, com disclosure, readiness gates e separação entre produto atual e conceito.",
    eyebrow: "SPONSORSHIP · CONCEPT / NOT LIVE PRODUCT",
    heading:
      "Marcas entram onde podem adicionar utilidade, não apenas exposição.",
    lede: "A arquitetura organiza oportunidades por contexto, benefício, disclosure, mensuração e readiness. Conceito comercial não é inventário ativo.",
    source: "Sponsorship Lane M V1.3",
    sections: [
      section(
        "Brand Journey",
        "Inspiration, Planning, Arrival, Mobility, Discovery, Transaction, Experience, Engagement e Post-trip organizam momentos de adequação contextual.",
        "CONCEPT / NOT LIVE PRODUCT",
      ),
      section(
        "Propriedades e medição",
        "O registro governa 44 conceitos em 17 superfícies, sujeitos a verificação de produto, direitos, contexto e readiness. O Hub não publica preço, alcance, performance histórica, inventário garantido ou status de venda sem evidência aprovada.",
        "CONCEPT / NOT LIVE PRODUCT",
      ),
    ],
  }),
  page({
    path: "/destination-partners/",
    title: "Parceiros de destino | Touristic Digital Platform",
    description:
      "Veja o framework governado para estruturar novos ecossistemas de destino sobre um Platform Core comum.",
    eyebrow: "DESTINATION PARTNERS",
    heading: "Expansão é configuração governada, não clonagem.",
    lede: "Prefeituras, secretarias, DMOs, associações, grupos privados e operadores podem avaliar o framework conforme autoridade, território e maturidade local.",
    source: "Destination Expansion Lane N V1.1",
    sections: [
      section(
        "Framework em 14 etapas",
        "Diagnóstico, brand fit, geografia, configuração, conteúdo, places, negócios, commerce, parceiros, sponsorship, analytics, go-to-market, operações e lifecycle estruturam a avaliação e os gates.",
      ),
      section(
        "Sem promessa automática de rollout",
        "O framework define processo e qualidade. Prazo, custo e status de implantação dependem de escopo e evidência específicos.",
        "FACTUAL FRAMEWORK",
      ),
    ],
  }),
  page({
    path: "/technology/",
    title: "Tecnologia | Touristic Digital Platform",
    description:
      "Arquitetura, domínios reutilizáveis e fronteiras de autoridade que sustentam a plataforma multi-destino.",
    eyebrow: "TECHNOLOGY",
    heading: "Reutilizar o que é comum. Explicitar o que tem autoridade.",
    lede: "Configuração multi-destino, contratos explícitos, domínios reutilizáveis e governança de evidência formam a fundação técnica descrita pela baseline.",
    source: authority.masterBook,
    sections: [
      section(
        "Domínios e contratos",
        "Identity, Destination, Search, Marketplace, Ordering, Financial, Business, Assistant, Analytics e Observability estão entre os domínios nomeados.",
      ),
      section(
        "Limite de publicação técnica",
        "Arquitetura não é apresentada como certificação, SLA, benchmark de segurança ou afirmação de implantação em produção.",
        "EVIDENCE BOUNDARY",
      ),
    ],
  }),
  page({
    path: "/governance/",
    title: "Governança e confiança | Touristic Digital Platform",
    description:
      "Conheça os princípios de evidência, acessibilidade, privacidade, autoridade e controle de mudanças da plataforma.",
    eyebrow: "GOVERNANCE / TRUST",
    heading: "Evidência vem antes de claim.",
    lede: "Source acceptance, institutional freeze, public release e deployment são estados diferentes e permanecem governados separadamente.",
    source: authority.baseline,
    sections: [
      section(
        "Disciplina de evidência",
        "Cada fato quantitativo preserva fonte, período, unidade e qualificador; cada evidência de produto preserva provenance e estado.",
      ),
      section(
        "Confiança estrutural",
        "Identidade, autorização, escopo por destino/tenant, privacidade, acessibilidade, auditabilidade e controle de mudanças fazem parte do desenho.",
      ),
    ],
  }),
  page({
    path: "/about/",
    title: "Sobre | Touristic Digital Platform",
    description:
      "Propósito, missão, visão, valores e arquitetura institucional da Touristic Digital Platform.",
    eyebrow: "ABOUT",
    heading: "Conectar destinos sem apagar o destino.",
    lede: "A entidade-mãe reúne Platform Core, governança, negócio e propriedade intelectual; destination brands permanecem instâncias locais pares.",
    source: authority.masterBook,
    sections: [
      section(
        "Propósito e missão",
        "Conectar destinos para tornar experiências mais simples e relevantes e construir infraestrutura multi-destino com identidade local preservada.",
      ),
      section(
        "Visão e valores",
        "A visão é uma rede de ecossistemas locais sobre um Platform Core comum. Identidade local, utilidade, confiança, evidência, acessibilidade, interoperabilidade, responsabilidade local e evolução contínua orientam o sistema.",
      ),
    ],
  }),
  page({
    path: "/resources/",
    title: "Recursos | Touristic Digital Platform",
    description:
      "Documentos, evidências e notas de fonte com classificação e status de publicação claramente identificados.",
    eyebrow: "RESOURCES",
    heading: "Documentos versionados. Estado de publicação explícito.",
    lede: "Este preview não expõe links privados nem transforma um candidato técnico em material publicado.",
    source: "Wave 2 Final Artifact Index V1",
    sections: [
      {
        heading: "Catálogo de recursos",
        resources: [
          [
            "Institutional Master Book V3.1",
            "INTERNAL / FROZEN",
            "Autoridade editorial.",
          ],
          [
            "Interactive Institutional PDF V2.1",
            "PUBLIC-CANDIDATE",
            "Pacote técnico preparado.",
          ],
          [
            "Destination Expansion Deck V1.1",
            "PUBLIC-CANDIDATE",
            "Material de destino.",
          ],
          ["Investor Deck V1.2", "CONTROLLED", "Distribuição controlada."],
          ["Sponsorship Deck V1.3", "CONTROLLED", "Direitos ainda governados."],
        ],
      },
      section(
        "Sem links privados no HTML",
        "Arquivos internos, controlados ou ainda não autorizados não recebem URL pública nesta implementação.",
        "PUBLICATION GATE ENFORCED",
      ),
    ],
  }),
  page({
    path: "/contact/",
    title: "Contato | Touristic Digital Platform",
    description:
      "Canais de conversa para destinos, negócios, parcerias, investimento e tecnologia, sem inventar dados de contato.",
    eyebrow: "CONTACT",
    heading: "Escolha a conversa certa para cada contexto.",
    lede: "O Hub não publica um endpoint de contato até que canal, privacidade e ownership estejam formalmente configurados.",
    source: "Institutional CTA framework",
    sections: [
      {
        heading: "Rotas de conversa",
        cards: [
          [
            "Destinos",
            "Framework",
            "Escopo territorial, governança e readiness.",
          ],
          ["Negócios", "Operação", "Superfícies e fluxos suportados."],
          ["Marcas", "Sponsorship", "Framework conceitual e readiness."],
          [
            "Investidores",
            "Diligência",
            "Acesso controlado quando autorizado.",
          ],
          ["Tecnologia", "Integrações", "Arquitetura e contratos."],
        ],
      },
      section(
        "Canal ainda não habilitado neste preview",
        "Nenhum e-mail, telefone, endereço, formulário ou prazo de resposta é inferido. A implementação aguarda uma configuração autorizada antes de ativar submissão.",
        "CONFIGURATION REQUIRED",
      ),
    ],
  }),
]);

export const pageByPath = new Map(pages.map((item) => [item.path, item]));