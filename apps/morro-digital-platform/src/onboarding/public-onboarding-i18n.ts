export type PublicOnboardingLocale = "pt" | "en" | "es" | "he";

export interface PublicOnboardingTourStepCopy {
  readonly title: string;
  readonly description: string;
  readonly hint: string;
}

export interface PublicOnboardingTourCopy {
  readonly step: (current: number, total: number) => string;
  readonly skip: string;
  readonly back: string;
  readonly next: string;
  readonly finish: string;
  readonly done: string;
  readonly steps: readonly PublicOnboardingTourStepCopy[];
}

export interface PublicOnboardingCopy {
  readonly title: string;
  readonly description: string;
  readonly readyTitle: string;
  readonly readyDescription: string;
  readonly startTitle: string;
  readonly startDescription: string;
  readonly skip: string;
  readonly tour: PublicOnboardingTourCopy;
}

export function publicOnboardingLocale(
  locale?: string | null,
): PublicOnboardingLocale {
  const normalized = locale?.trim().toLowerCase().replaceAll("_", "-") ?? "";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (
    normalized === "he" ||
    normalized.startsWith("he-") ||
    normalized === "iw" ||
    normalized.startsWith("iw-")
  ) {
    return "he";
  }
  return "pt";
}

const COPY: Readonly<Record<PublicOnboardingLocale, PublicOnboardingCopy>> =
  Object.freeze({
    pt: Object.freeze({
      title: "Bem-vindo ao Morro Digital",
      description: "Seu guia inteligente para descobrir Morro de São Paulo.",
      readyTitle: "Pronto para explorar?",
      readyDescription:
        "Faça o tour interativo da V1 ou vá direto para o aplicativo.",
      startTitle: "Conhecer o App",
      startDescription:
        "Conheça o mapa, o clima, o assistente e os principais controles passo a passo.",
      skip: "Pular por agora",
      tour: Object.freeze({
        step: (current: number, total: number) => `Passo ${current} de ${total}`,
        skip: "Pular tour",
        back: "Voltar",
        next: "Próximo",
        finish: "Começar a explorar",
        done: "Pronto! Agora é só explorar o Morro Digital.",
        steps: Object.freeze([
          Object.freeze({
            title: "Explore Morro pelo mapa",
            description:
              "O mapa interativo é o centro da experiência. Navegue por Morro de São Paulo e descubra lugares próximos.",
            hint: "Arraste e aproxime o mapa quando quiser.",
          }),
          Object.freeze({
            title: "Veja o clima antes de sair",
            description:
              "O clima acompanha a sua exploração para ajudar a planejar praias, passeios e deslocamentos.",
            hint: "Toque no clima para consultar os detalhes.",
          }),
          Object.freeze({
            title: "Seu assistente está sempre por perto",
            description:
              "Este botão abre o guia virtual do Morro Digital sempre que você precisar de ajuda.",
            hint: "Use o assistente para descobrir o que fazer agora.",
          }),
          Object.freeze({
            title: "Bem-vindo ao seu guia virtual",
            description:
              "Aqui você recebe sugestões de praias, restaurantes, hospedagens, festas, passeios e serviços.",
            hint: "A mensagem de boas-vindas fica disponível ao iniciar o aplicativo.",
          }),
          Object.freeze({
            title: "Escolha um atalho",
            description:
              "Use as opções rápidas para explorar categorias sem precisar digitar uma pergunta.",
            hint: "Você também pode conversar livremente com o assistente.",
          }),
          Object.freeze({
            title: "Pergunte do seu jeito",
            description:
              "Digite uma pergunta, envie por voz ou abra as configurações do assistente diretamente nesta área.",
            hint: "Experimente perguntar o que fazer hoje em Morro de São Paulo.",
          }),
          Object.freeze({
            title: "Pronto para explorar",
            description:
              "Agora você conhece os principais controles. Continue pelo mapa e use o assistente sempre que precisar.",
            hint: "Você pode rever os recursos enquanto navega pelo aplicativo.",
          }),
        ]),
      }),
    }),
    en: Object.freeze({
      title: "Welcome to Morro Digital",
      description: "Your smart guide to discovering Morro de São Paulo.",
      readyTitle: "Ready to explore?",
      readyDescription:
        "Take the V1 interactive tour or go straight to the app.",
      startTitle: "Explore the App",
      startDescription:
        "Discover the map, weather, assistant and main controls step by step.",
      skip: "Skip for now",
      tour: Object.freeze({
        step: (current: number, total: number) => `Step ${current} of ${total}`,
        skip: "Skip tour",
        back: "Back",
        next: "Next",
        finish: "Start exploring",
        done: "Ready! Now explore Morro Digital.",
        steps: Object.freeze([
          Object.freeze({
            title: "Explore Morro on the map",
            description:
              "The interactive map is the center of the experience. Explore Morro de São Paulo and discover nearby places.",
            hint: "Drag and zoom the map whenever you want.",
          }),
          Object.freeze({
            title: "Check the weather before you go",
            description:
              "Weather follows your exploration to help you plan beaches, tours and getting around.",
            hint: "Tap the weather to see the details.",
          }),
          Object.freeze({
            title: "Your assistant is always nearby",
            description:
              "This button opens the Morro Digital virtual guide whenever you need help.",
            hint: "Use the assistant to discover what to do now.",
          }),
          Object.freeze({
            title: "Welcome to your virtual guide",
            description:
              "Here you get suggestions for beaches, restaurants, stays, parties, tours and services.",
            hint: "The welcome message is available when you start the app.",
          }),
          Object.freeze({
            title: "Choose a shortcut",
            description:
              "Use quick options to explore categories without having to type a question.",
            hint: "You can also chat freely with the assistant.",
          }),
          Object.freeze({
            title: "Ask in your own way",
            description:
              "Type a question, use your voice or open the assistant settings directly in this area.",
            hint: "Try asking what to do today in Morro de São Paulo.",
          }),
          Object.freeze({
            title: "Ready to explore",
            description:
              "Now you know the main controls. Keep exploring the map and use the assistant whenever you need it.",
            hint: "You can revisit these features while navigating the app.",
          }),
        ]),
      }),
    }),
    es: Object.freeze({
      title: "Bienvenido a Morro Digital",
      description: "Tu guía inteligente para descubrir Morro de São Paulo.",
      readyTitle: "¿Listo para explorar?",
      readyDescription:
        "Haz el tour interactivo de la V1 o entra directamente en la aplicación.",
      startTitle: "Conocer la App",
      startDescription:
        "Conoce el mapa, el clima, el asistente y los controles principales paso a paso.",
      skip: "Omitir por ahora",
      tour: Object.freeze({
        step: (current: number, total: number) => `Paso ${current} de ${total}`,
        skip: "Omitir tour",
        back: "Volver",
        next: "Siguiente",
        finish: "Empezar a explorar",
        done: "¡Listo! Ahora solo queda explorar Morro Digital.",
        steps: Object.freeze([
          Object.freeze({
            title: "Explora Morro en el mapa",
            description:
              "El mapa interactivo es el centro de la experiencia. Recorre Morro de São Paulo y descubre lugares cercanos.",
            hint: "Arrastra y acerca el mapa cuando quieras.",
          }),
          Object.freeze({
            title: "Consulta el clima antes de salir",
            description:
              "El clima acompaña tu exploración para ayudarte a planear playas, paseos y desplazamientos.",
            hint: "Toca el clima para consultar los detalles.",
          }),
          Object.freeze({
            title: "Tu asistente siempre está cerca",
            description:
              "Este botón abre la guía virtual de Morro Digital siempre que necesites ayuda.",
            hint: "Usa el asistente para descubrir qué hacer ahora.",
          }),
          Object.freeze({
            title: "Bienvenido a tu guía virtual",
            description:
              "Aquí recibes sugerencias de playas, restaurantes, alojamientos, fiestas, paseos y servicios.",
            hint: "El mensaje de bienvenida está disponible al iniciar la aplicación.",
          }),
          Object.freeze({
            title: "Elige un acceso rápido",
            description:
              "Usa las opciones rápidas para explorar categorías sin tener que escribir una pregunta.",
            hint: "También puedes conversar libremente con el asistente.",
          }),
          Object.freeze({
            title: "Pregunta a tu manera",
            description:
              "Escribe una pregunta, usa tu voz o abre la configuración del asistente directamente en esta área.",
            hint: "Prueba preguntar qué hacer hoy en Morro de São Paulo.",
          }),
          Object.freeze({
            title: "Listo para explorar",
            description:
              "Ya conoces los controles principales. Continúa por el mapa y usa el asistente siempre que lo necesites.",
            hint: "Puedes volver a consultar estos recursos mientras navegas por la aplicación.",
          }),
        ]),
      }),
    }),
    he: Object.freeze({
      title: "ברוכים הבאים ל-Morro Digital",
      description: "המדריך החכם שלכם לגילוי מורו דה סאו פאולו.",
      readyTitle: "מוכנים לצאת לדרך?",
      readyDescription:
        "אפשר לצאת לסיור האינטראקטיבי של V1 או להיכנס ישירות לאפליקציה.",
      startTitle: "הכירו את האפליקציה",
      startDescription:
        "הכירו שלב אחר שלב את המפה, מזג האוויר, העוזר והפקדים המרכזיים.",
      skip: "דלגו לעת עתה",
      tour: Object.freeze({
        step: (current: number, total: number) => `שלב ${current} מתוך ${total}`,
        skip: "דלגו על הסיור",
        back: "חזרה",
        next: "הבא",
        finish: "התחילו לחקור",
        done: "מוכנים! עכשיו אפשר להתחיל לחקור עם Morro Digital.",
        steps: Object.freeze([
          Object.freeze({
            title: "גלו את מורו על המפה",
            description:
              "המפה האינטראקטיבית היא מרכז החוויה. טיילו במורו דה סאו פאולו וגלו מקומות קרובים.",
            hint: "גררו והגדילו את המפה בכל עת.",
          }),
          Object.freeze({
            title: "בדקו את מזג האוויר לפני שיוצאים",
            description:
              "מזג האוויר מלווה את החיפוש ועוזר לתכנן חופים, סיורים ודרכי הגעה.",
            hint: "הקישו על מזג האוויר כדי לראות פרטים.",
          }),
          Object.freeze({
            title: "העוזר שלכם תמיד קרוב",
            description:
              "הכפתור הזה פותח את המדריך הווירטואלי של Morro Digital בכל פעם שצריך עזרה.",
            hint: "השתמשו בעוזר כדי לגלות מה אפשר לעשות עכשיו.",
          }),
          Object.freeze({
            title: "ברוכים הבאים למדריך הווירטואלי",
            description:
              "כאן תקבלו הצעות לחופים, מסעדות, מקומות לינה, מסיבות, סיורים ושירותים.",
            hint: "הודעת קבלת הפנים זמינה עם פתיחת האפליקציה.",
          }),
          Object.freeze({
            title: "בחרו קיצור דרך",
            description:
              "השתמשו באפשרויות המהירות כדי לגלות קטגוריות בלי להקליד שאלה.",
            hint: "אפשר גם לשוחח בחופשיות עם העוזר.",
          }),
          Object.freeze({
            title: "שאלו בדרך שלכם",
            description:
              "הקלידו שאלה, השתמשו בקול או פתחו את הגדרות העוזר ישירות באזור הזה.",
            hint: "נסו לשאול מה אפשר לעשות היום במורו דה סאו פאולו.",
          }),
          Object.freeze({
            title: "מוכנים לחקור",
            description:
              "עכשיו אתם מכירים את הפקדים המרכזיים. המשיכו במפה והיעזרו בעוזר בכל עת.",
            hint: "אפשר לחזור למשאבים האלה בזמן הניווט באפליקציה.",
          }),
        ]),
      }),
    }),
  });

export function getPublicOnboardingCopy(
  locale?: string | null,
): PublicOnboardingCopy {
  return COPY[publicOnboardingLocale(locale)];
}
