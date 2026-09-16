import {
  normalizeTourLocale,
  type TourLocale,
} from "../config/tour-localization.js";

export type ShellPresentationLocale = TourLocale;

export type V1ShellTranslationKey =
  | "welcome_message"
  | "ask_first_time"
  | "site_interactive_map_label"
  | "submenu_title_explore_places"
  | "submenu_close"
  | "assistant_minimize"
  | "assistant_input_placeholder"
  | "assistant_input_label"
  | "assistant_send_label"
  | "assistant_voice_label"
  | "assistant_settings_label"
  | "settings_close"
  | "navigation_continue_straight"
  | "navigation_minimize"
  | "navigation_distance_label"
  | "navigation_time_label"
  | "map_loading_morro_digital"
  | "navigation_stop"
  | "map_globe_toggle_title"
  | "settings_voice"
  | "settings_voice_speed"
  | "settings_language";

export interface ShellPresentationCopy {
  readonly legacy: Readonly<Record<V1ShellTranslationKey, string>>;
  readonly mapRegionLabel: string;
  readonly voiceSettingsCloseLabel: string;
  readonly voicePreferencesSaved: string;
  readonly voiceAutomatic: string;
  readonly voiceDefaultSuffix: string;
}

const COPY: Readonly<Record<ShellPresentationLocale, ShellPresentationCopy>> =
  Object.freeze({
    "pt-BR": Object.freeze({
      legacy: Object.freeze({
        welcome_message:
          "👋 Olá! Sou o assistente virtual do Morro Digital. Como posso ajudar você hoje?",
        ask_first_time:
          "É a sua primeira vez em Morro de São Paulo? Posso te mostrar os melhores lugares para visitar.",
        site_interactive_map_label: "Mapa interativo",
        submenu_title_explore_places: "Explorar locais",
        submenu_close: "Fechar menu",
        assistant_minimize: "Minimizar assistente",
        assistant_input_placeholder: "Digite sua pergunta...",
        assistant_input_label: "Mensagem para o assistente",
        assistant_send_label: "Enviar mensagem",
        assistant_voice_label: "Enviar mensagem por voz",
        assistant_settings_label: "Configurações do assistente",
        settings_close: "Fechar",
        navigation_continue_straight: "Siga em frente",
        navigation_minimize: "Minimizar instruções de navegação",
        navigation_distance_label: "Distância",
        navigation_time_label: "Tempo",
        map_loading_morro_digital: "Carregando Morro Digital...",
        navigation_stop: "Parar navegação",
        map_globe_toggle_title: "Alternar visão global do mapa",
        settings_voice: "Voz",
        settings_voice_speed: "Velocidade da voz",
        settings_language: "Idioma",
      }),
      mapRegionLabel: "Mapa interativo de Morro de São Paulo",
      voiceSettingsCloseLabel: "Fechar configurações de voz",
      voicePreferencesSaved: "As preferências são salvas neste navegador.",
      voiceAutomatic: "Automática",
      voiceDefaultSuffix: "padrão",
    }),
    en: Object.freeze({
      legacy: Object.freeze({
        welcome_message:
          "👋 Hello! I'm the Morro Digital virtual assistant. How can I help you today?",
        ask_first_time:
          "Is this your first time in Morro de São Paulo? I can show you the best places to visit.",
        site_interactive_map_label: "Interactive map",
        submenu_title_explore_places: "Explore places",
        submenu_close: "Close menu",
        assistant_minimize: "Minimize assistant",
        assistant_input_placeholder: "Type your question...",
        assistant_input_label: "Message to the assistant",
        assistant_send_label: "Send message",
        assistant_voice_label: "Send voice message",
        assistant_settings_label: "Assistant settings",
        settings_close: "Close",
        navigation_continue_straight: "Continue straight",
        navigation_minimize: "Minimize navigation instructions",
        navigation_distance_label: "Distance",
        navigation_time_label: "Time",
        map_loading_morro_digital: "Loading Morro Digital...",
        navigation_stop: "Stop navigation",
        map_globe_toggle_title: "Toggle global map view",
        settings_voice: "Assistant Voice",
        settings_voice_speed: "Speech Speed",
        settings_language: "Assistant Language",
      }),
      mapRegionLabel: "Interactive map of Morro de São Paulo",
      voiceSettingsCloseLabel: "Close voice settings",
      voicePreferencesSaved: "Preferences are saved in this browser.",
      voiceAutomatic: "Automatic",
      voiceDefaultSuffix: "default",
    }),
    es: Object.freeze({
      legacy: Object.freeze({
        welcome_message:
          "👋 ¡Hola! Soy el asistente virtual de Morro Digital. ¿Cómo puedo ayudarte hoy?",
        ask_first_time:
          "¿Es tu primera vez en Morro de São Paulo? Puedo mostrarte los mejores lugares para visitar.",
        site_interactive_map_label: "Mapa interactivo",
        submenu_title_explore_places: "Explorar lugares",
        submenu_close: "Cerrar menú",
        assistant_minimize: "Minimizar asistente",
        assistant_input_placeholder: "Escribe tu pregunta...",
        assistant_input_label: "Mensaje para el asistente",
        assistant_send_label: "Enviar mensaje",
        assistant_voice_label: "Enviar mensaje por voz",
        assistant_settings_label: "Configuraciones del asistente",
        settings_close: "Cerrar",
        navigation_continue_straight: "Continúa recto",
        navigation_minimize: "Minimizar instrucciones de navegación",
        navigation_distance_label: "Distancia",
        navigation_time_label: "Tiempo",
        map_loading_morro_digital: "Cargando Morro Digital...",
        navigation_stop: "Detener navegación",
        map_globe_toggle_title: "Alternar vista global del mapa",
        settings_voice: "Voz del Asistente",
        settings_voice_speed: "Velocidad del Habla",
        settings_language: "Idioma del Asistente",
      }),
      mapRegionLabel: "Mapa interactivo de Morro de São Paulo",
      voiceSettingsCloseLabel: "Cerrar configuración de voz",
      voicePreferencesSaved: "Las preferencias se guardan en este navegador.",
      voiceAutomatic: "Automática",
      voiceDefaultSuffix: "predeterminada",
    }),
    he: Object.freeze({
      legacy: Object.freeze({
        welcome_message:
          "👋 שלום! אני העוזר הווירטואלי של מורו דיגיטל. איך אוכל לעזור לך היום?",
        ask_first_time:
          "האם זו הפעם הראשונה שלך במורו דה סאו פאולו? אני יכול להראות לך את המקומות הטובים ביותר לבקר.",
        site_interactive_map_label: "מפה אינטראקטיבית",
        submenu_title_explore_places: "חקר מקומות",
        submenu_close: "סגור תפריט",
        assistant_minimize: "מזעור העוזר",
        assistant_input_placeholder: "הקלד את שאלתך...",
        assistant_input_label: "הודעה לעוזר",
        assistant_send_label: "שלח הודעה",
        assistant_voice_label: "שלח הודעה קולית",
        assistant_settings_label: "הגדרות העוזר",
        settings_close: "סגור",
        navigation_continue_straight: "המשך ישר",
        navigation_minimize: "מזעור הוראות ניווט",
        navigation_distance_label: "מרחק",
        navigation_time_label: "זמן",
        map_loading_morro_digital: "טוען את Morro Digital...",
        navigation_stop: "עצור ניווט",
        map_globe_toggle_title: "החלף לתצוגה גלובלית של המפה",
        settings_voice: "קול העוזר",
        settings_voice_speed: "מהירות דיבור",
        settings_language: "שפת העוזר",
      }),
      mapRegionLabel: "מפה אינטראקטיבית של Morro de São Paulo",
      voiceSettingsCloseLabel: "סגור הגדרות קול",
      voicePreferencesSaved: "ההעדפות נשמרות בדפדפן הזה.",
      voiceAutomatic: "אוטומטי",
      voiceDefaultSuffix: "ברירת מחדל",
    }),
  });

export function shellPresentationLocale(
  locale?: string | null,
): ShellPresentationLocale {
  return normalizeTourLocale(locale);
}

export function getShellPresentationCopy(
  locale?: string | null,
): ShellPresentationCopy {
  return COPY[shellPresentationLocale(locale)];
}

function legacyText(
  copy: ShellPresentationCopy,
  key: string | null,
): string | undefined {
  if (!key || !(key in copy.legacy)) return undefined;
  return copy.legacy[key as V1ShellTranslationKey];
}

function setLeadingText(element: Element | null, text: string): void {
  if (!element) return;
  const textNode = Array.from(element.childNodes).find(
    (node) => node.nodeType === 3,
  );
  if (textNode) textNode.textContent = `${text} `;
  else element.prepend(`${text} `);
}

/**
 * Restores the V1 generic presentation-i18n contract for the shell while
 * preserving all canonical action values, IDs and event wiring.
 */
export function applyV1ShellPresentation(
  document: Document,
  locale = document.documentElement.lang,
): void {
  const copy = getShellPresentationCopy(locale);

  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const text = legacyText(copy, element.getAttribute("data-i18n"));
    if (text) element.textContent = text;
  });

  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "[data-i18n-placeholder]",
    )
    .forEach((element) => {
      const text = legacyText(
        copy,
        element.getAttribute("data-i18n-placeholder"),
      );
      if (text) element.placeholder = text;
    });

  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((element) => {
    const text = legacyText(copy, element.getAttribute("data-i18n-title"));
    if (text) element.title = text;
  });

  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((element) => {
    const text = legacyText(copy, element.getAttribute("data-i18n-aria"));
    if (text) element.setAttribute("aria-label", text);
  });

  document.getElementById("map")?.setAttribute("aria-label", copy.mapRegionLabel);

  const globeButton = document.getElementById("toggle-globe-view");
  const globalViewLabel = copy.legacy.map_globe_toggle_title;
  if (globeButton) {
    globeButton.setAttribute("title", globalViewLabel);
    globeButton.setAttribute("aria-label", globalViewLabel);
    globeButton.querySelector<HTMLElement>(".control-tooltip")!.textContent =
      globalViewLabel;
  }

  const voiceTitle = document.getElementById("assistantVoiceSettingsTitle");
  if (voiceTitle) voiceTitle.textContent = copy.legacy.settings_voice;
  document
    .getElementById("assistantVoiceSettingsClose")
    ?.setAttribute("aria-label", copy.voiceSettingsCloseLabel);

  const voiceEnabledLabel = document.querySelector(
    ".assistant-voice-settings-row > span",
  );
  if (voiceEnabledLabel)
    voiceEnabledLabel.textContent = copy.legacy.settings_voice;

  const voiceSelectLabel = document.querySelector(
    'label[for="assistantVoiceSelect"] > span',
  );
  if (voiceSelectLabel)
    voiceSelectLabel.textContent = copy.legacy.settings_voice;

  setLeadingText(
    document.querySelector('label[for="assistantVoiceSpeed"] > span'),
    copy.legacy.settings_voice_speed,
  );

  const voiceLanguageLabel = document.querySelector(
    'label[for="assistantVoiceLanguage"] > span',
  );
  if (voiceLanguageLabel)
    voiceLanguageLabel.textContent = copy.legacy.settings_language;

  const support = document.querySelector<HTMLElement>(
    ".assistant-voice-settings-support",
  );
  if (support) support.textContent = copy.voicePreferencesSaved;
}
