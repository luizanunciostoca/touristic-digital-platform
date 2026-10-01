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

const source = Object.freeze({
  baseline: "Wave 2 Institutional Baseline V1 · FROZEN",
  masterBook: "Institutional Master Book V3.1",
  product: "Product Visual Evidence Index V1.1",
  brand: "Brand Family V2 · Concept 02",
});

export const pages = Object.freeze([
  {
    path: "/",
    title: "Touristic Digital Platform",
    description:
      "Infraestrutura tecnológica para conectar experiência, operação e ecossistemas de destinos com identidade local preservada.",
    eyebrow: "REDE · Destination Technology Infrastructure Platform",
    heading: "Tecnologia compartilhada. Destinos que continuam sendo eles mesmos.",
    lede: site.bigIdea,
    theme: "platform",
    ctas: [
      ["/platform/", "Conheça a plataforma"],
      ["/destinations/", "Explore os destinos"],
    ],
    sections: [
      {
        heading: "Uma infraestrutura comum, experiências locais próprias",
        body:
          "A Touristic Digital Platform reúne tecnologia, governança, negócio e propriedade intelectual em um Platform Core comum. Morro Digital e Itacaré Digital são destination brands pares sob essa arquitetura.",
        cards: [
          ["REDE", "Touristic Digital Platform", "Master brand e Platform Core."],
          ["PERCURSO", "Morro Digital", "Ecossistema digital de Morro de São Paulo."],
          ["FLUXO", "Itacaré Digital", "Ecossistema digital de Itacaré."],
        ],
      },
      {
        heading: "O que a baseline permite afirmar",
        body:
          "As métricas abaixo descrevem arquitetura e capacidades canônicas. Elas não representam adoção, receita ou implantação em produção.",
        metrics: [
          ["12", "Feature Registry entries", "status equivalent"],
          ["36", "capacidades canônicas", "arquitetura"],
          ["19", "domínios do Platform Core", "arquitetura"],
          ["4", "locales turísticos", "pt-BR · en · es · he"],
        ],
      },
      {
        heading: "Produto com evidência, conceito com rótulo",
        body:
          "Superfícies atuais são apresentadas apenas quando existe evidência visual governada. Arquitetura futura e propriedades comerciais aparecem como framework ou conceito, nunca como interface ativa.",
        evidence: "CURRENT PRODUCT EVIDENCE · ver /product/",
      },
      {
        heading: "Caminhos por stakeholder",
        cards: [
          ["/destination-partners/", "Destinos", "Framework governado para novos ecossistemas."],
          ["/business/", "Negócios", "Superfícies operacionais e arquitetura econômica."],
          ["/investors/", "Investidores", "Tese pública e acesso controlado à diligência."],
          ["/sponsorship/", "Marcas", "Arquitetura conceitual de sponsorship contextual."],
        ],
      },
    ],
    source: source.baseline,
  },
  {
    path: "/platform/",
    title: "Platform Core | Touristic Digital Platform",
    description:
      "Conheça a arquitetura multi-destino, os domínios do Platform Core e as fronteiras que preservam identidade e operação local.",
    eyebrow: "PLATFORM · REDE",
    heading: "Um core compartilhado. Fronteiras explícitas. Configuração local.",
    lede:
      "A plataforma conecta experiência do viajante, oferta local, operação do destino e dados/integrações sem centralizar toda a autoridade em uma única superfície.",
    theme: "platform",
    ctas: [
      ["/product/", "Ver produto"],
      ["/technology/", "Entenda a tecnologia"],
    ],
    sections: [
      {
        heading: "One Platform, Many Destinations",
        body:
          "Arquitetura, contratos, segurança, governança e padrões são reutilizáveis. Marca, território, conteúdo, categorias, regras operacionais e configuração permanecem locais.",
      },
      {
        heading: "Platform Core",
        body:
          "A arquitetura auditada nomeia 19 domínios, incluindo Identity, Destination, Search, Marketplace, Ordering, Financial, Business, Assistant, Analytics e Observability. A contagem descreve estrutura arquitetural.",
        metrics: [
          ["19", "domínios nomeados", "estrutura arquitetural"],
          ["36", "capacidades canônicas", "baseline pública"],
        ],
      },
      {
        heading: "Autoridade antes de conveniência",
        cards: [
          ["Identity", "Identidade", "Autenticação e identidade permanecem em fronteiras explícitas."],
          ["Destination", "Escopo local", "Cada instância preserva configuração e contexto próprios."],
          ["Ordering + Financial", "Dinheiro", "Commerce orquestra sem assumir autoridade financeira."],
        ],
      },
    ],
    source: source.masterBook,
  },
  {
    path: "/product/",
    title: "Produto | Touristic Digital Platform",
    description:
      "Veja superfícies comprovadas para viajantes, negócios e operação de destinos, com evidência visual e guardrails claros.",
    eyebrow: "CURRENT PRODUCT EVIDENCE",
    heading: "Três perspectivas do mesmo ecossistema digital.",
    lede:
      "A evidência atual cobre experiência turística, operação de negócios e operação da plataforma. Uma tela comprova superfície e capacidade; não comprova tração ou resultado comercial.",
    theme: "platform",
    ctas: [
      ["/business/", "Ver negócios"],
      ["/governance/", "Ver critérios de evidência"],
    ],
    sections: [
      {
        heading: "Tourist Experience",
        cards: [
          ["Descoberta", "Home · Map · Search · Categories · Place", "Superfícies current-main verificadas."],
          ["Assistência", "Assistant · Navigation", "Contexto de destino e navegação verificados."],
          ["Ação", "Commerce · Reservation · Ticketing · QR", "Fluxos e estados comprovados por evidência governada."],
        ],
        evidence: "CURRENT PRODUCT EVIDENCE",
      },
      {
        heading: "Business",
        body:
          "Dashboard, onboarding, perfil, localização, fotos, produtos, ofertas, menu, reservas, ticketing/check-in, financeiro, conteúdo, preview e CRM possuem evidência atual.",
        evidence: "CURRENT PRODUCT EVIDENCE",
      },
      {
        heading: "Platform Operations",
        body:
          "O Control Center possui evidência para Overview, Businesses, Users, Affiliates, CRM, Products & Offers, Reservations, Ticketing, Orders, Financial, Content, Destinations, Audit, System/Health e Settings.",
        evidence: "CURRENT PRODUCT EVIDENCE",
      },
      {
        heading: "Limites visuais",
        body:
          "Growth/Journey/Rewards não são promovidos como telas standalone atuais. Analytics existe como domínio/capacidade, sem uma tela standalone inventada no Control Center.",
        evidence: "EVIDENCE BOUNDARY",
      },
    ],
    source: source.product,
  },
  {
    path: "/destinations/",
    title: "Destinos | Touristic Digital Platform",
    description:
      "Morro Digital e Itacaré Digital são ecossistemas de destino pares construídos sobre um Platform Core comum.",
    eyebrow: "DESTINATION ECOSYSTEMS",
    heading: "O core é comum. O destino continua próprio.",
    lede:
      "A família visual e a arquitetura institucional compartilham DNA sem transformar destinos diferentes em cópias do mesmo produto.",
    theme: "platform",
    ctas: [
      ["/destinations/morro-digital/", "Morro Digital"],
      ["/destinations/itacare-digital/", "Itacaré Digital"],
    ],
    sections: [
      {
        heading: "Destinos pares sob a master brand",
        cards: [
          ["/destinations/morro-digital/", "Morro Digital · PERCURSO", "Morro de São Paulo."],
          ["/destinations/itacare-digital/", "Itacaré Digital · FLUXO", "Itacaré."],
        ],
      },
      {
        heading: "Expansão por configuração",
        body:
          "Novos destinos seguem um framework governado de diagnóstico, brand fit, geografia, configuração, conteúdo, places, negócios, commerce, parceiros, sponsorship, analytics, go-to-market, operações e lifecycle.",
      },
    ],
    source: source.baseline,
  },
  {
    path: "/destinations/morro-digital/",
    title: "Morro Digital | Ecossistema digital de Morro de São Paulo",
    description:
      "Conheça o ecossistema digital de Morro de São Paulo conectado ao Platform Core da Touristic Digital Platform.",
    eyebrow: "MORRO DIGITAL · PERCURSO",
    heading: "Um ecossistema pensado para o percurso de Morro de São Paulo.",
    lede:
      "Morro Digital representa Morro de São Paulo e é a primeira configuração oficial/baseline descrita pela arquitetura atual.",
    theme: "morro",
    ctas: [
      ["/product/", "Ver superfícies comprovadas"],
      ["/platform/", "Entender o Platform Core"],
    ],
    sections: [
      {
        heading: "Contexto local",
        body:
          "O destino combina praias, hospitalidade, gastronomia, lazer, vida noturna, descoberta a pé e uma logística própria de acesso. A identidade local permanece distinta da entidade-mãe.",
      },
      {
        heading: "PERCURSO",
        body:
          "A linguagem de percurso traduz descoberta, movimento e continuidade local sem alterar a autoridade da Touristic Digital Platform como master brand.",
      },
      {
        heading: "Produto e evidência",
        body:
          "As telas usadas institucionalmente para Morro Digital vêm da biblioteca current-main governada. Catálogos e mappings técnicos não são convertidos em contagens de parceiros.",
        evidence: "CURRENT PRODUCT EVIDENCE",
      },
    ],
    source: source.masterBook,
  },
  {
    path: "/destinations/itacare-digital/",
    title: "Itacaré Digital | Ecossistema digital de Itacaré",
    description:
      "Itacaré Digital é a destination brand de Itacaré, parte da arquitetura multi-destino da Touristic Digital Platform.",
    eyebrow: "ITACARÉ DIGITAL · FLUXO",
    heading: "A mesma infraestrutura precisa comportar uma lógica territorial diferente.",
    lede:
      "Itacaré Digital representa Itacaré como destination ecosystem par de Morro Digital. A marca é canônica; equivalência de runtime com Morro permanece não verificada.",
    theme: "itacare",
    ctas: [
      ["/destinations/", "Ver arquitetura de destinos"],
      ["/destination-partners/", "Entender expansão"],
    ],
    sections: [
      {
        heading: "Contexto territorial",
        body:
          "O contexto inclui praias urbanas e rurais, surf, trilhas, cachoeiras, Rio de Contas, natureza e aventura em um território mais distribuído.",
      },
      {
        heading: "FLUXO",
        body:
          "A identidade FLUXO expressa uma dinâmica territorial própria e mantém o vínculo com a REDE sem copiar PERCURSO.",
      },
      {
        heading: "Estado de evidência",
        body:
          "Esta página não apresenta Itacaré como runtime-equivalent a Morro Digital. A tagline de Itacaré permanece omitida enquanto a validação humana específica segue aberta.",
        evidence: "EVIDENCE BOUNDARY",
      },
    ],
    source: source.baseline,
  },
  {
    path: "/business/",
    title: "Negócios | Touristic Digital Platform",
    description:
      "Entenda as superfícies para negócios locais e a arquitetura econômica da plataforma, sem confundir capacidade com resultados.",
    eyebrow: "BUSINESS",
    heading: "Operação local conectada ao contexto do destino.",
    lede:
      "O Business Portal e o CRM organizam presença, oferta e relacionamento. O modelo econômico é uma arquitetura de mecanismos; valores comerciais dependem de evidência própria.",
    theme: "platform",
    ctas: [
      ["/product/", "Ver produto"],
      ["/contact/", "Canais de conversa"],
    ],
    sections: [
      {
        heading: "Superfícies verificadas",
        body:
          "A evidência atual cobre operações como produtos, ofertas, menu, reservas, ticketing/check-in, financeiro, conteúdo, preview e CRM.",
        evidence: "CURRENT PRODUCT EVIDENCE",
      },
      {
        heading: "Arquitetura econômica",
        body:
          "O modelo organiza transações, receitas recorrentes/serviços e monetização estratégica em 13 streams estruturados, com regras para evitar dupla contagem.",
      },
      {
        heading: "Dados comerciais",
        body:
          "Valores atuais de receita, volume transacionado, preços, unit economics e termos comerciais não são apresentados nesta superfície institucional sem fonte aprovada.",
        evidence: "DATA REQUIRED",
      },
    ],
    source: source.baseline,
  },
  {
    path: "/market/",
    title: "Mercado e oportunidade | Touristic Digital Platform",
    description:
      "Contexto de turismo, modelo count-based de TAM/SAM/SOM e princípios de impacto com fontes, períodos e qualificadores explícitos.",
    eyebrow: "MARKET / OPPORTUNITY",
    heading: "Contexto de mercado precisa carregar período e metodologia.",
    lede:
      "A baseline usa um modelo count-based de destinos. Ele organiza escopo de planejamento e não é um modelo monetário de tamanho de mercado.",
    theme: "platform",
    ctas: [
      ["/investors/", "Ver tese para investidores"],
      ["/governance/", "Ver governança de claims"],
    ],
    sections: [
      {
        heading: "Mapa do Turismo · snapshot Q1 2026",
        metrics: [
          ["3.102", "TAM · municípios no recorte", "snapshot Q1 2026"],
          ["689", "SAM · municípios categorizados", "snapshot Q1 2026"],
          ["2", "SOM · geografias beachhead", "escopo de planejamento"],
        ],
        body:
          "TAM e SAM permanecem snapshots datados porque a base oficial é atualizada continuamente. SOM representa escopo de planejamento; não representa participação de mercado, contratos ou previsão.",
      },
      {
        heading: "Por que agora",
        body:
          "A tese institucional combina escala do turismo, conectividade ampla e agenda pública de transformação digital. Indicadores históricos preservam o seu período original e não são tratados como receita endereçável da plataforma.",
      },
      {
        heading: "Impacto: medir antes de afirmar",
        body:
          "Valor local, acessibilidade, confiança e turismo responsável formam uma agenda de mensuração. Resultados só devem ser publicados quando houver baseline, método, fonte e período comparável.",
      },
    ],
    source: "Publication Acceptance V1 · market refresh + " + source.baseline,
  },
  {
    path: "/investors/",
    title: "Investidores | Touristic Digital Platform",
    description:
      "Conheça a tese institucional, evidências e arquitetura de expansão da Touristic Digital Platform.",
    eyebrow: "INVESTORS",
    heading: "Uma tese institucional baseada em arquitetura, evidência e expansão configurável.",
    lede:
      "O Hub apresenta apenas a tese pública. Materiais de diligência e informações comerciais controladas permanecem em canais separados.",
    theme: "platform",
    ctas: [
      ["/market/", "Ver mercado"],
      ["/resources/", "Ver recursos públicos"],
    ],
    sections: [
      {
        heading: "Pilares da tese",
        cards: [
          ["Core", "Arquitetura multi-destino", "Infraestrutura reutilizável com identidade local preservada."],
          ["Produto", "Evidência atual", "Superfícies comprovadas para turista, negócios e operação."],
          ["Mercado", "Unidades de destino", "Modelo count-based, datado e qualificado."],
          ["Modelo", "Múltiplos mecanismos", "13 streams estruturados sem promover actuals ausentes."],
        ],
      },
      {
        heading: "Diligência controlada",
        body:
          "Informações financeiras, termos de captação, projeções e outros dados não públicos não são publicados no Hub. O acesso depende de classificação e governança próprias.",
        evidence: "CONTROLLED MATERIAL",
      },
    ],
    source: "Investor Deck V1.2 · controlled source",
  },
  {
    path: "/sponsorship/",
    title: "Patrocínio e marcas | Touristic Digital Platform",
    description:
      "Conheça a arquitetura conceitual de patrocínio contextual, com disclosure, readiness gates e separação entre produto atual e conceito.",
    eyebrow: "SPONSORSHIP · CONCEPT / NOT LIVE PRODUCT",
    heading: "Marcas entram onde podem adicionar utilidade, não apenas exposição.",
    lede:
      "A arquitetura organiza oportunidades por contexto, benefício, disclosure, mensuração e readiness. Conceito comercial não é inventário ativo.",
    theme: "platform",
    ctas: [
      ["/product/", "Ver produto atual"],
      ["/contact/", "Canais de conversa"],
    ],
    sections: [
      {
        heading: "Brand Journey",
        body:
          "Inspiration, Planning, Arrival, Mobility, Discovery, Transaction, Experience, Engagement e Post-trip são momentos de adequação contextual.",
        evidence: "CONCEPT / NOT LIVE PRODUCT",
      },
      {
        heading: "Propriedades conceituais",
        body:
          "O registro governa 44 conceitos em 17 superfícies, todos sujeitos a verificação de produto, direitos, contexto e readiness antes de qualquer uso externo como propriedade disponível.",
        evidence: "CONCEPT / NOT LIVE PRODUCT",
      },
      {
        heading: "Medição e transparência",
        body:
          "Disclosure, benefício ao usuário e método de mensuração são condições do framework. O Hub não publica preço, alcance, performance histórica, inventário garantido ou status de venda sem evidência aprovada.",
      },
    ],
    source: "Sponsorship Lane M V1.3",
  },
  {
    path: "/destination-partners/",
    title: "Parceiros de destino | Touristic Digital Platform",
    description:
      "Veja o framework governado para estruturar novos ecossistemas de destino sobre um Platform Core comum.",
    eyebrow: "DESTINATION PARTNERS",
    heading: "Expansão é configuração governada, não clonagem.",
    lede:
      "Prefeituras, secretarias, DMOs, associações, grupos privados e operadores podem avaliar o framework conforme autoridade, território e maturidade local.",
    theme: "platform",
    ctas: [
      ["/destinations/", "Ver destinos"],
      ["/contact/", "Canais de conversa"],
    ],
    sections: [
      {
        heading: "Framework em 14 etapas",
        body:
          "Diagnóstico, brand fit, geografia, configuração, conteúdo, places, negócios, commerce, parceiros, sponsorship, analytics, go-to-market, operações e lifecycle estruturam a avaliação e os gates.",
      },
      {
        heading: "O que permanece local",
        body:
          "Identidade, território, conteúdo, categorias, participantes, regras operacionais e governança local não são apagados pela reutilização do Platform Core.",
      },
      {
        heading: "Sem promessa automática de rollout",
        body:
          "O framework define processo e qualidade. Prazo, custo e status de implantação dependem de escopo e evidência específicos.",
        evidence: "FACTUAL FRAMEWORK",
      },
    ],
    source: "Destination Expansion Lane N V1.1",
  },
  {
    path: "/technology/",
    title: "Tecnologia | Touristic Digital Platform",
    description:
      "Arquitetura, domínios reutilizáveis e fronteiras de autoridade que sustentam a plataforma multi-destino.",
    eyebrow: "TECHNOLOGY",
    heading: "Reutilizar o que é comum. Explicitar o que tem autoridade.",
    lede:
      "A vantagem arquitetural proposta está na combinação de configuração multi-destino, contratos explícitos, domínios reutilizáveis e governança de evidência.",
    theme: "platform",
    ctas: [
      ["/platform/", "Ver Platform Core"],
      ["/governance/", "Ver governança"],
    ],
    sections: [
      {
        heading: "Domínios e contratos",
        body:
          "Identity, Destination, Search, Marketplace, Ordering, Financial, Business, Assistant, Analytics e Observability estão entre os domínios nomeados da arquitetura.",
      },
      {
        heading: "Fronteiras críticas",
        cards: [
          ["Auth / IAM", "Acesso", "Identidade, autorização e escopo por destino/tenant permanecem explícitos."],
          ["Ordering / Financial", "Dinheiro", "Autoridade de transação e autoridade financeira não são confundidas."],
          ["Observability", "Operação", "Evidência operacional permanece separada de claims públicos."],
        ],
      },
      {
        heading: "Limite de publicação técnica",
        body:
          "Esta página não transforma arquitetura em certificação, SLA, benchmark de segurança ou afirmação de implantação em produção.",
        evidence: "EVIDENCE BOUNDARY",
      },
    ],
    source: source.masterBook,
  },
  {
    path: "/governance/",
    title: "Governança e confiança | Touristic Digital Platform",
    description:
      "Conheça os princípios de evidência, acessibilidade, privacidade, autoridade e controle de mudanças da plataforma.",
    eyebrow: "GOVERNANCE / TRUST",
    heading: "Evidência vem antes de claim.",
    lede:
      "Source acceptance, institutional freeze, public release e deployment são estados diferentes e permanecem governados separadamente.",
    theme: "platform",
    ctas: [
      ["/resources/", "Ver recursos"],
      ["/technology/", "Ver tecnologia"],
    ],
    sections: [
      {
        heading: "Disciplina de evidência",
        body:
          "Cada fato quantitativo deve preservar fonte, período, unidade e qualificador. Cada evidência de produto deve preservar provenance e estado.",
      },
      {
        heading: "Confiança estrutural",
        body:
          "Identidade, autorização, escopo por destino/tenant, privacidade, acessibilidade, auditabilidade e controle de mudanças fazem parte do desenho de confiança.",
      },
      {
        heading: "Classificação",
        cards: [
          ["PUBLIC-CANDIDATE", "Material preparado", "Ainda sujeito ao gate de publicação."],
          ["CONTROLLED", "Distribuição restrita", "Acesso conforme audiência e finalidade."],
          ["INTERNAL", "Governança", "Autoridade e detalhes não destinados à publicação aberta."],
        ],
      },
    ],
    source: source.baseline,
  },
  {
    path: "/about/",
    title: "Sobre | Touristic Digital Platform",
    description:
      "Propósito, missão, visão, valores e arquitetura institucional da Touristic Digital Platform.",
    eyebrow: "ABOUT",
    heading: "Conectar destinos sem apagar o destino.",
    lede:
      "A entidade-mãe reúne Platform Core, governança, negócio e propriedade intelectual; destination brands permanecem instâncias locais pares.",
    theme: "platform",
    ctas: [
      ["/platform/", "Conheça a plataforma"],
      ["/contact/", "Canais de conversa"],
    ],
    sections: [
      {
        heading: "Propósito",
        body:
          "Conectar destinos para que pessoas encontrem experiências mais simples e relevantes, enquanto agentes locais ganham infraestrutura digital comum para organizar, operar e evoluir o ecossistema.",
      },
      {
        heading: "Missão",
        body:
          "Construir e operar infraestrutura multi-destino com identidade local preservada, conectando experiência, operação e confiança.",
      },
      {
        heading: "Visão",
        body:
          "Construir uma rede de ecossistemas locais sobre um Platform Core comum. A visão é direção estratégica, não claim de liderança alcançada.",
      },
      {
        heading: "Valores",
        body:
          "Identidade local, utilidade real, confiança, evidência, acessibilidade e inclusão, interoperabilidade, responsabilidade local e evolução contínua.",
      },
    ],
    source: source.masterBook,
  },
  {
    path: "/resources/",
    title: "Recursos | Touristic Digital Platform",
    description:
      "Documentos, evidências e notas de fonte com classificação e status de publicação claramente identificados.",
    eyebrow: "RESOURCES",
    heading: "Documentos versionados. Estado de publicação explícito.",
    lede:
      "Este preview não expõe links privados nem transforma um candidato técnico em material publicado. Downloads públicos só são habilitados após o gate correspondente.",
    theme: "platform",
    sections: [
      {
        heading: "Catálogo de recursos",
        resources: [
          ["Institutional Master Book V3.1", "INTERNAL / FROZEN", "Autoridade editorial."],
          ["Interactive Institutional PDF V2.1", "PUBLIC-CANDIDATE", "Pacote técnico preparado; publicação ainda governada."],
          ["Destination Expansion Deck V1.1", "PUBLIC-CANDIDATE", "Material de destino sujeito ao gate de publicação."],
          ["Investor Deck V1.2", "CONTROLLED", "Distribuição controlada."],
          ["Sponsorship Deck V1.3", "CONTROLLED", "Distribuição depende também de confirmação de direitos."],
        ],
      },
      {
        heading: "Sem links privados no HTML",
        body:
          "Arquivos classificados como internos, controlados ou ainda não autorizados não recebem URL pública nesta implementação.",
        evidence: "PUBLICATION GATE ENFORCED",
      },
    ],
    source: "Wave 2 Final Artifact Index V1",
  },
  {
    path: "/contact/",
    title: "Contato | Touristic Digital Platform",
    description:
      "Canais de conversa para destinos, negócios, parcerias, investimento e tecnologia, sem inventar dados de contato.",
    eyebrow: "CONTACT",
    heading: "Escolha a conversa certa para cada contexto.",
    lede:
      "O Hub não publica um endpoint de contato até que canal, privacidade e ownership estejam formalmente configurados.",
    theme: "platform",
    sections: [
      {
        heading: "Rotas de conversa",
        cards: [
          ["Destinos", "Transformação e framework", "Escopo territorial, governança e readiness."],
          ["Negócios", "Participação e operação", "Superfícies e fluxos suportados."],
          ["Marcas", "Sponsorship", "Framework conceitual e readiness."],
          ["Investidores", "Tese e diligência", "Acesso controlado quando autorizado."],
          ["Tecnologia", "Integrações", "Arquitetura e contratos."],
        ],
      },
      {
        heading: "Canal ainda não habilitado neste preview",
        body:
          "Nenhum e-mail, telefone, endereço, formulário ou prazo de resposta é inferido. A implementação aguarda a configuração de contato autorizada antes de ativar submissão.",
        evidence: "CONFIGURATION REQUIRED",
      },
    ],
    source: "Institutional CTA framework",
  },
]);

export const pageByPath = new Map(pages.map((page) => [page.path, page]));
