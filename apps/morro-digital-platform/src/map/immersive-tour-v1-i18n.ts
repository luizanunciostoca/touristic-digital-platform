import {
  normalizeTourLocale,
  type TourLocale,
} from "../config/tour-localization.js";

export interface V1ImmersiveTourCopy {
  readonly start: string;
  readonly seeStops: string;
  readonly cancel: string;
  readonly next: string;
  readonly previous: string;
  readonly finish: string;
  readonly exit: string;
  readonly narration: string;
  readonly stopNarration: string;
  readonly seeTours: string;
  readonly exploreMap: string;
  readonly mainMenu: string;
  readonly viewStop: string;
  readonly tipsLabel: string;
  readonly completedTitle: string;
  readonly completedCta: string;
  readonly notFound: string;
  stopLabel(current: number, total: number): string;
  stopsLabel(count: number): string;
  stopsOf(title: string): string;
  endedMessage(title: string): string;
  completedDescription(count: number, title: string): string;
}

const COPY: Readonly<Record<TourLocale, V1ImmersiveTourCopy>> = Object.freeze({
  "pt-BR": Object.freeze({
    start: "▶️ Iniciar o tour",
    seeStops: "📋 Ver todas as paradas",
    cancel: "❌ Cancelar",
    next: "➡️ Próxima parada",
    previous: "⬅️ Parada anterior",
    finish: "🏁 Finalizar tour",
    exit: "❌ Sair do tour",
    narration: "🔊 Ouvir narração",
    stopNarration: "⏹️ Parar narração",
    seeTours: "⛵ Ver outros passeios",
    exploreMap: "🗺️ Explorar o mapa",
    mainMenu: "🏠 Menu principal",
    viewStop: "📍 Ver esta parada",
    tipsLabel: "💡 Dicas:",
    completedTitle: "Tour Concluído!",
    completedCta: "Gostou? Compartilhe com seus amigos e volte sempre! 🌊",
    notFound:
      "Desculpe, não encontrei o roteiro para este passeio. Tente novamente ou escolha outro passeio.",
    stopLabel: (current: number, total: number) => `Parada ${current} de ${total}`,
    stopsLabel: (count: number) => `${count} paradas:`,
    stopsOf: (title: string) => `Paradas do ${title}:`,
    endedMessage: (title: string) =>
      `🏁 Tour encerrado! Espero que tenha curtido o roteiro do ${title}. Como posso ajudar?`,
    completedDescription: (count: number, title: string) =>
      `Você explorou todas as ${count} paradas do ${title}! Esperamos que tenha aproveitado cada momento desta experiência.`,
  }),
  en: Object.freeze({
    start: "▶️ Start tour",
    seeStops: "📋 See all stops",
    cancel: "❌ Cancel",
    next: "➡️ Next stop",
    previous: "⬅️ Previous stop",
    finish: "🏁 Finish tour",
    exit: "❌ Exit tour",
    narration: "🔊 Listen to narration",
    stopNarration: "⏹️ Stop narration",
    seeTours: "⛵ See other tours",
    exploreMap: "🗺️ Explore map",
    mainMenu: "🏠 Main menu",
    viewStop: "📍 View this stop",
    tipsLabel: "💡 Tips:",
    completedTitle: "Tour Completed!",
    completedCta: "Liked it? Share with your friends and come back soon! 🌊",
    notFound:
      "Sorry, I couldn't find the itinerary for this tour. Please try again or choose another tour.",
    stopLabel: (current: number, total: number) => `Stop ${current} of ${total}`,
    stopsLabel: (count: number) => `${count} stops:`,
    stopsOf: (title: string) => `Stops of ${title}:`,
    endedMessage: (title: string) =>
      `🏁 Tour ended! Hope you enjoyed the ${title} itinerary. How can I help?`,
    completedDescription: (count: number, title: string) =>
      `You explored all ${count} stops of ${title}! We hope you enjoyed every moment of this experience.`,
  }),
  es: Object.freeze({
    start: "▶️ Iniciar tour",
    seeStops: "📋 Ver todas las paradas",
    cancel: "❌ Cancelar",
    next: "➡️ Siguiente parada",
    previous: "⬅️ Parada anterior",
    finish: "🏁 Finalizar tour",
    exit: "❌ Salir del tour",
    narration: "🔊 Escuchar narración",
    stopNarration: "⏹️ Detener narración",
    seeTours: "⛵ Ver otros paseos",
    exploreMap: "🗺️ Explorar el mapa",
    mainMenu: "🏠 Menú principal",
    viewStop: "📍 Ver esta parada",
    tipsLabel: "💡 Consejos:",
    completedTitle: "¡Tour Completado!",
    completedCta:
      "¿Te gustó? ¡Comparte con tus amigos y vuelve pronto! 🌊",
    notFound:
      "Lo siento, no encontré el itinerario para este paseo. Por favor, inténtalo de nuevo o elige otro paseo.",
    stopLabel: (current: number, total: number) => `Parada ${current} de ${total}`,
    stopsLabel: (count: number) => `${count} paradas:`,
    stopsOf: (title: string) => `Paradas de ${title}:`,
    endedMessage: (title: string) =>
      `🏁 ¡Tour finalizado! Espero que hayas disfrutado el itinerario de ${title}. ¿Cómo puedo ayudarte?`,
    completedDescription: (count: number, title: string) =>
      `¡Exploraste las ${count} paradas de ${title}! Esperamos que hayas disfrutado cada momento de esta experiencia.`,
  }),
  he: Object.freeze({
    start: "▶️ התחל סיור",
    seeStops: "📋 ראה את כל העצירות",
    cancel: "❌ ביטול",
    next: "➡️ עצירה הבאה",
    previous: "⬅️ עצירה קודמת",
    finish: "🏁 סיים סיור",
    exit: "❌ צא מהסיור",
    narration: "🔊 האזן לנרטיב",
    stopNarration: "⏹️ עצור נרטיב",
    seeTours: "⛵ ראה סיורים אחרים",
    exploreMap: "🗺️ חקור את המפה",
    mainMenu: "🏠 תפריט ראשי",
    viewStop: "📍 צפה בעצירה זו",
    tipsLabel: "💡 טיפים:",
    completedTitle: "הסיור הושלם!",
    completedCta: "אהבת? שתף עם חבריך וחזור בקרוב! 🌊",
    notFound:
      "מצטער, לא מצאתי את המסלול לסיור זה. אנא נסה שוב או בחר סיור אחר.",
    stopLabel: (current: number, total: number) => `עצירה ${current} מתוך ${total}`,
    stopsLabel: (count: number) => `${count} עצירות:`,
    stopsOf: (title: string) => `עצירות של ${title}:`,
    endedMessage: (title: string) =>
      `🏁 הסיור הסתיים! מקווה שנהנית מהמסלול של ${title}. איך אני יכול לעזור?`,
    completedDescription: (count: number, title: string) =>
      `חקרת את כל ${count} העצירות של ${title}! אנו מקווים שנהנית מכל רגע בחוויה הזו.`,
  }),
});

export function getV1ImmersiveTourCopy(
  locale?: string | null,
): V1ImmersiveTourCopy {
  return COPY[normalizeTourLocale(locale)];
}
