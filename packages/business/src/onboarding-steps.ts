import type { BusinessOnboardingStepId } from "./onboarding.js";

export interface BusinessOnboardingOption {
  readonly value: string;
  readonly label: string;
  readonly icon?: string;
}

export type BusinessOnboardingStepType =
  | "intro"
  | "choice"
  | "dynamic-choice"
  | "text"
  | "story"
  | "insight"
  | "tools"
  | "assistant"
  | "funnel"
  | "map"
  | "profile"
  | "reviews"
  | "metrics"
  | "finish";

export interface BusinessOnboardingStepDefinition {
  readonly id: BusinessOnboardingStepId;
  readonly type: BusinessOnboardingStepType;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly field?:
    "category" | "specialty" | "businessName" | "objective" | "audience";
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly primary?: string;
  readonly secondary?: string;
  readonly response?: string;
  readonly visual?: string;
  readonly items?: readonly string[];
  readonly options?: readonly BusinessOnboardingOption[];
  readonly metrics?: readonly Readonly<{ label: string; value: string }>[];
}

export const BUSINESS_ONBOARDING_CATEGORIES = Object.freeze([
  { value: "restaurant", icon: "🍽️", label: "Restaurante" },
  { value: "lodging", icon: "🏨", label: "Pousada ou hotel" },
  { value: "tour", icon: "🚤", label: "Agência de passeios" },
  { value: "transport", icon: "🚐", label: "Agência de transporte" },
  { value: "fashion", icon: "🛍️", label: "Roupas e acessórios" },
  { value: "market", icon: "🛒", label: "Supermercado" },
  { value: "events", icon: "🎉", label: "Casa de eventos" },
  { value: "other", icon: "🏪", label: "Outro negócio" },
] satisfies readonly BusinessOnboardingOption[]);

export const BUSINESS_ONBOARDING_SPECIALTIES = Object.freeze({
  restaurant: [
    "Frutos do mar",
    "Comida baiana",
    "Pizzaria",
    "Hamburgueria",
    "Romântico",
    "Vista para o mar",
    "Vegetariano",
  ],
  lodging: [
    "Beira-mar",
    "Luxo",
    "Econômica",
    "Famílias",
    "Casais",
    "Pet friendly",
    "Piscina",
  ],
  tour: [
    "Volta à ilha",
    "Mergulho",
    "Passeio privativo",
    "Garapuá",
    "Observação de baleias",
    "Aventura",
  ],
  transport: [
    "Transfer terrestre",
    "Lancha",
    "Táxi",
    "Aeroporto",
    "Salvador",
    "Transporte privativo",
  ],
  fashion: [
    "Moda praia",
    "Artesanato",
    "Joias",
    "Moda feminina",
    "Moda masculina",
    "Souvenires",
  ],
  market: [
    "Entrega",
    "Bebidas",
    "Café da manhã",
    "Produtos locais",
    "Conveniência",
    "Hortifruti",
  ],
  events: [
    "Festas",
    "Sunset",
    "Música ao vivo",
    "Casamentos",
    "Eventos privados",
    "Experiência noturna",
  ],
  other: [
    "Serviços",
    "Bem-estar",
    "Saúde",
    "Esporte",
    "Imobiliária",
    "Experiência local",
  ],
} as const);

export const BUSINESS_ONBOARDING_OBJECTIVES = Object.freeze([
  { value: "clients", label: "Mais clientes" },
  { value: "reservations", label: "Mais reservas" },
  { value: "whatsapp", label: "Mais mensagens no WhatsApp" },
  { value: "sales", label: "Mais vendas" },
  { value: "events", label: "Divulgar eventos e promoções" },
  { value: "brand", label: "Fortalecer minha marca" },
] satisfies readonly BusinessOnboardingOption[]);

export const BUSINESS_ONBOARDING_AUDIENCES = Object.freeze([
  { value: "couples", label: "Casais" },
  { value: "families", label: "Famílias" },
  { value: "young", label: "Jovens" },
  { value: "international", label: "Turistas internacionais" },
  { value: "premium", label: "Público premium" },
  { value: "all", label: "Todos os públicos" },
] satisfies readonly BusinessOnboardingOption[]);

const STEPS: readonly BusinessOnboardingStepDefinition[] = Object.freeze([
  {
    id: "welcome",
    type: "intro",
    eyebrow: "Morro Digital Empresas",
    title: "Veja como turistas encontram e escolhem o seu negócio",
    description:
      "Você acompanhará uma jornada prática usando as ferramentas reais do Morro Digital.",
    primary: "Começar demonstração",
  },
  {
    id: "category",
    type: "choice",
    field: "category",
    eyebrow: "1 de 5 · Seu negócio",
    title: "Qual é a categoria principal?",
    description:
      "O menu, as buscas e as recomendações serão adaptados à sua categoria.",
    options: BUSINESS_ONBOARDING_CATEGORIES,
  },
  {
    id: "specialty",
    type: "dynamic-choice",
    field: "specialty",
    eyebrow: "2 de 5 · Especialidade",
    title: "O que melhor diferencia o negócio?",
    description: "Escolha o atributo que deve ganhar destaque.",
  },
  {
    id: "name",
    type: "text",
    field: "businessName",
    eyebrow: "3 de 5 · Identidade",
    title: "Como sua empresa se chama?",
    description:
      "Procuraremos o negócio no mapa e usaremos o nome nas buscas reais.",
    placeholder: "Ex.: Toca do Morcego",
    maxLength: 80,
  },
  {
    id: "objective",
    type: "choice",
    field: "objective",
    eyebrow: "4 de 5 · Objetivo",
    title: "Qual resultado você mais deseja?",
    description: "A demonstração destacará as ações mais ligadas ao objetivo.",
    options: BUSINESS_ONBOARDING_OBJECTIVES,
  },
  {
    id: "audience",
    type: "choice",
    field: "audience",
    eyebrow: "5 de 5 · Público",
    title: "Quem você mais deseja alcançar?",
    description:
      "A IA utiliza intenção, contexto, localização e perfil do visitante.",
    options: BUSINESS_ONBOARDING_AUDIENCES,
  },
  {
    id: "ready",
    type: "story",
    eyebrow: "Empresa preparada",
    title: "Agora vamos mostrar como um turista encontra {businessName}",
    description:
      "Primeiro localizamos o negócio. Depois testamos menu, texto, nome, voz e recomendação da IA.",
    visual: "business-card",
  },
  {
    id: "arrival",
    type: "story",
    eyebrow: "Jornada do turista",
    title: "O turista precisa de ajuda, mas ainda não conhece {businessName}",
    description:
      "O Morro Digital gera valor primeiro: orienta, responde e facilita decisões.",
    visual: "arrival",
  },
  {
    id: "trust-cycle",
    type: "insight",
    eyebrow: "Confiança antes da venda",
    title: "O guia ajuda antes de recomendar",
    description:
      "A recomendação comercial ganha força porque surge depois de informações úteis, orientação e decisões facilitadas.",
  },
  {
    id: "menu-discovery",
    type: "tools",
    eyebrow: "1 · Menu interativo",
    title: "Descoberta sem digitar",
    description:
      "O turista toca na categoria {category}. O sistema abre a opção real do menu e apresenta negócios compatíveis.",
    items: [
      "Menu real do assistente",
      "Categoria personalizada",
      "Descoberta para quem ainda não conhece o nome",
    ],
  },
  {
    id: "text-discovery",
    type: "assistant",
    eyebrow: "2 · Busca por texto",
    title: "O turista escreve uma necessidade",
    description: "“{generic}”",
    response:
      "O assistente interpreta a categoria e procura opções relevantes próximas.",
    primary: "Executar busca real",
  },
  {
    id: "name-discovery",
    type: "assistant",
    eyebrow: "3 · Busca direta",
    title: "Quem já ouviu falar encontra pelo nome",
    description: "“{businessName}”",
    response:
      "O nome é enviado ao mesmo pipeline real de busca e detalhes do local.",
    primary: "Procurar {businessName}",
  },
  {
    id: "voice-discovery",
    type: "tools",
    eyebrow: "4 · Busca por voz",
    title: "Agora teste sem digitar",
    description:
      "Toque no microfone real do assistente e diga: “{generic}”. A próxima etapa será liberada quando a voz for reconhecida.",
    items: [
      "Toque no microfone",
      "Diga a frase sugerida",
      "Confira o resultado",
    ],
  },
  {
    id: "multilingual",
    type: "tools",
    eyebrow: "Quatro idiomas",
    title: "O Morro Digital fala com o turista por você",
    description:
      "A mesma necessidade será apresentada em português, inglês, espanhol e hebraico, mantendo uma única presença comercial.",
    items: ["Português", "English", "Español", "עברית"],
  },
  {
    id: "always-on",
    type: "funnel",
    eyebrow: "Operação contínua",
    title: "Marketing inteligente ao longo de todo o dia",
    description:
      "O guia permanece disponível digitalmente para responder, orientar e identificar oportunidades em diferentes momentos da viagem.",
    items: [
      "08:00 · café e passeios",
      "12:00 · almoço",
      "16:00 · pôr do sol",
      "20:00 · jantar",
      "23:30 · eventos e transporte",
    ],
  },
  {
    id: "assistant-query",
    type: "assistant",
    eyebrow: "5 · Recomendação inteligente",
    title: "A IA conecta intenção e oportunidade",
    description: "“{query}”",
    response:
      "{icon} {businessName} pode ser recomendada por combinar com a intenção e com {specialty}.",
    primary: "{cta}",
  },
  {
    id: "ranking-explanation",
    type: "insight",
    eyebrow: "Marketing contextual",
    title: "Veja por que o negócio foi considerado relevante",
    description:
      "Categoria, especialidade, localização, público e intenção formam uma explicação transparente da recomendação.",
  },
  {
    id: "context",
    type: "insight",
    eyebrow: "Marketing com confiança",
    title: "Valor gera confiança; confiança gera oportunidades",
    description:
      "O Morro Digital não promete posição ou venda. Ele reduz atrito e apresenta negócios quando existe compatibilidade com a necessidade do turista.",
  },
  {
    id: "map",
    type: "map",
    eyebrow: "Presença geográfica",
    title: "{businessName} aparece no mapa real",
    description:
      "O local confirmado fica visível e conectado às informações e ações do assistente.",
    primary: "{cta}",
  },
  {
    id: "profile",
    type: "profile",
    eyebrow: "Vitrine digital",
    title: "O perfil transforma interesse em decisão",
    description:
      "A prévia reúne dados disponíveis e indica com transparência o que ainda deverá ser completado no cadastro.",
  },
  {
    id: "route",
    type: "funnel",
    eyebrow: "Da intenção à porta",
    title: "O turista inicia uma rota real",
    description:
      "A rota é calculada no mapa ativo e confirmada antes de o fluxo avançar.",
    items: ["Descoberta", "Perfil", "Como chegar", "Rota", "Visita"],
  },
  {
    id: "conversion",
    type: "insight",
    eyebrow: "Resultado",
    title: "Cada ação vira um sinal mensurável",
    description:
      "Menu, busca, voz, perfil e rota são registrados na sessão demonstrativa sem contaminar métricas comerciais.",
  },
  {
    id: "reputation",
    type: "reviews",
    eyebrow: "Confiança contínua",
    title: "Boas experiências fortalecem futuras escolhas",
    description:
      "Avaliações reais serão exibidas quando existirem; a demonstração não cria reputação fictícia.",
  },
  {
    id: "promotions",
    type: "tools",
    eyebrow: "Próxima fase",
    title: "Promoções e eventos serão controlados pelo painel",
    description:
      "O proprietário criará uma ação no painel real e verá o resultado na visão do turista.",
    items: ["Promoções", "Eventos", "Produtos", "Disponibilidade"],
  },
  {
    id: "analytics",
    type: "metrics",
    eyebrow: "Sessão demonstrativa",
    title: "O painel mostrará apenas o que aconteceu aqui",
    description: "As métricas serão derivadas dos eventos reais desta sessão.",
    metrics: [
      { label: "Menu", value: "1" },
      { label: "Texto", value: "1" },
      { label: "Nome", value: "1" },
      { label: "Voz", value: "1" },
      { label: "Idiomas", value: "4" },
      { label: "Rota", value: "1" },
    ],
  },
  {
    id: "partner-panel",
    type: "tools",
    eyebrow: "Modo parceiro",
    title: "O painel real será a central de controle",
    description:
      "A próxima fase abrirá o workspace verdadeiro do proprietário com dados da sessão.",
    items: ["Perfil", "Promoções", "Eventos", "Métricas"],
  },
  {
    id: "ecosystem",
    type: "funnel",
    eyebrow: "Aquisição inteligente",
    title: "O guia ajuda, entende, recomenda e mede",
    description:
      "O Morro Digital trabalha para conectar a pessoa certa ao negócio certo.",
    items: [
      "Ajuda útil",
      "Confiança",
      "Intenção",
      "{businessName}",
      "Ação",
      "Venda",
    ],
  },
  {
    id: "finish",
    type: "finish",
    eyebrow: "Demonstração concluída",
    title: "{businessName} foi encontrada e explicada com transparência",
    description:
      "Descoberta, confiança, quatro idiomas, recomendação, perfil e rota agora fazem parte da mesma sessão.",
    primary: "Continuar para cadastro",
    secondary: "Rever demonstração",
  },
]);

export const BUSINESS_ONBOARDING_STEPS = STEPS;

export function getBusinessOnboardingStepDefinition(
  stepId: BusinessOnboardingStepId,
): BusinessOnboardingStepDefinition {
  const step = STEPS.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown Business onboarding step: ${stepId}`);
  return step;
}

export function getBusinessOnboardingSpecialties(
  category: string,
): readonly BusinessOnboardingOption[] {
  const values =
    BUSINESS_ONBOARDING_SPECIALTIES[
      category as keyof typeof BUSINESS_ONBOARDING_SPECIALTIES
    ] ?? BUSINESS_ONBOARDING_SPECIALTIES.other;
  return Object.freeze(values.map((label) => ({ value: label, label })));
}

export function validateBusinessOnboardingStepInput(
  stepId: BusinessOnboardingStepId,
  value: unknown,
  context: Readonly<Record<string, unknown>> = {},
): boolean {
  if (stepId === "category")
    return BUSINESS_ONBOARDING_CATEGORIES.some(
      (option) => option.value === value,
    );
  if (stepId === "specialty")
    return getBusinessOnboardingSpecialties(
      typeof context.category === "string" ? context.category : "other",
    ).some((option) => option.value === value);
  if (stepId === "name")
    return (
      typeof value === "string" &&
      value.trim().length > 0 &&
      value.trim().length <= 80
    );
  if (stepId === "objective")
    return BUSINESS_ONBOARDING_OBJECTIVES.some(
      (option) => option.value === value,
    );
  if (stepId === "audience")
    return BUSINESS_ONBOARDING_AUDIENCES.some(
      (option) => option.value === value,
    );
  return true;
}
