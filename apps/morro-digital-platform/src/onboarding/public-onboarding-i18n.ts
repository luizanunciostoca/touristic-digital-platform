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
        step: (current: number, total: number) =>
          `Passo ${current} de ${total}`,
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
            title: "Pergunte do seu jeito",
            description:
              "Use o composer persistente para perguntar sobre lugares, rotas, passeios e o que fazer agora.",
            hint: "Digite naturalmente; o mapa continua visível enquanto você conversa.",
          }),
          Object.freeze({
            title: "Use sua voz quando quiser",
            description:
              "Fale com o Assistant sem perder o contexto do mapa quando for mais prático do que digitar.",
            hint: "A voz é opcional e pode ser usada diretamente no composer.",
          }),
          Object.freeze({
            title: "Ajuste o Assistant",
            description:
              "As configurações de voz e preferências ficam acessíveis junto ao composer, sem ocupar a Home o tempo todo.",
            hint: "Ajuste somente o que precisar e volte à exploração.",
          }),
          Object.freeze({
            title: "Mude a perspectiva do mapa",
            description:
              "Use a visão global para ampliar o contexto geográfico e retorne à exploração local quando quiser.",
            hint: "O mapa continua sendo o ambiente principal da experiência.",
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
            title: "Ask in your own way",
            description:
              "Use the persistent composer to ask about places, routes, tours and what to do next.",
            hint: "Type naturally; the map stays visible while you talk.",
          }),
          Object.freeze({
            title: "Use your voice when it helps",
            description:
              "Talk to the Assistant without losing map context when speaking is easier than typing.",
            hint: "Voice is optional and available directly from the composer.",
          }),
          Object.freeze({
            title: "Tune the Assistant",
            description:
              "Voice and preference settings stay beside the composer instead of occupying the Home surface.",
            hint: "Adjust only what you need and return to exploring.",
          }),
          Object.freeze({
            title: "Change the map perspective",
            description:
              "Use global view to widen the geographic context and return to local exploration whenever you want.",
            hint: "The map remains the main environment of the experience.",
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
            title: "Pregunta a tu manera",
            description:
              "Usa el composer persistente para preguntar por lugares, rutas, paseos y qué hacer ahora.",
            hint: "Escribe con naturalidad; el mapa sigue visible mientras conversas.",
          }),
          Object.freeze({
            title: "Usa tu voz cuando te resulte útil",
            description:
              "Habla con el Assistant sin perder el contexto del mapa cuando sea más práctico que escribir.",
            hint: "La voz es opcional y está disponible directamente en el composer.",
          }),
          Object.freeze({
            title: "Ajusta el Assistant",
            description:
              "Las preferencias y la configuración de voz están junto al composer sin ocupar la Home todo el tiempo.",
            hint: "Ajusta solo lo necesario y vuelve a explorar.",
          }),
          Object.freeze({
            title: "Cambia la perspectiva del mapa",
            description:
              "Usa la vista global para ampliar el contexto geográfico y vuelve a la exploración local cuando quieras.",
            hint: "El mapa sigue siendo el entorno principal de la experiencia.",
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
        step: (current: number, total: number) =>
          `שלב ${current} מתוך ${total}`,
        skip: "דלגו על הסיור",
        back: "חזרה",
        next: "הבא",
        finish: "התחילו לחקור",
        done: "מוכנים! עכשיו אפשר להתחיל לחקור עם Morro Digital.",
        steps: Object.freeze([
          Object.freeze({
            title: "גלו את מורו דרך המפה",
            description:
              "המפה האינטראקטיבית היא מרכז החוויה. טיילו במורו דה סאו פאולו וגלו מקומות קרובים.",
            hint: "אפשר לגרור ולהתקרב במפה בכל רגע.",
          }),
          Object.freeze({
            title: "בדקו את מזג האוויר לפני היציאה",
            description:
              "מזג האוויר מלווה את החקירה ועוזר לתכנן חופים, סיורים והתניידות.",
            hint: "הקישו על מזג האוויר כדי לראות פרטים.",
          }),
          Object.freeze({
            title: "שאלו בדרך שלכם",
            description:
              "השתמשו בשדה הכתיבה הקבוע כדי לשאול על מקומות, מסלולים, סיורים ומה כדאי לעשות עכשיו.",
            hint: "כתבו באופן טבעי; המפה נשארת גלויה בזמן השיחה.",
          }),
          Object.freeze({
            title: "השתמשו בקול כשנוח",
            description:
              "דברו עם ה-Assistant בלי לאבד את הקשר המפה כאשר דיבור נוח יותר מהקלדה.",
            hint: "השימוש בקול הוא אופציונלי וזמין ישירות מאזור הכתיבה.",
          }),
          Object.freeze({
            title: "התאימו את ה-Assistant",
            description:
              "הגדרות הקול וההעדפות זמינות ליד אזור הכתיבה בלי להשתלט על מסך הבית.",
            hint: "שנו רק את מה שצריך וחזרו לחקירה.",
          }),
          Object.freeze({
            title: "שנו את נקודת המבט של המפה",
            description:
              "השתמשו בתצוגה הגלובלית כדי להרחיב את ההקשר הגיאוגרפי וחזרו לחקירה המקומית בכל עת.",
            hint: "המפה נשארת סביבת העבודה המרכזית של החוויה.",
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
