export interface AppShellMountOptions {
  readonly document: Document;
}

function createAppShellMarkup(): string {
  return `
    <div class="app-shell" data-destination-id="morro-de-sao-paulo">
      <header>
        <div class="header-content">
          <h1 data-i18n="welcome_message">Morro Digital</h1>
          <p class="tagline" data-i18n="ask_first_time">Descubra o paraíso</p>
        </div>
      </header>

      <section id="map-section" aria-label="Mapa interativo" data-i18n-aria="site_interactive_map_label">
        <div id="map-container">
          <div id="map" role="region" aria-label="Mapa interativo de Morro de São Paulo"></div>
          <div id="weather-widget" class="weather-widget compact" data-compatibility-state="v1-snapshot">
            <div class="weather-compact-main">
              <div class="weather-emoji">☀️</div>
              <span class="weather-temp">21°C</span>
              <div class="weather-compact-footer">
                <span class="click-here-text">Click here</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="submenu" class="hidden">
        <div class="submenu-header">
          <h3 class="submenu-title" data-i18n="submenu_title_explore_places">Explorar locais</h3>
          <button class="close-button" aria-label="Fechar menu" data-i18n-aria="submenu_close">x</button>
        </div>
        <div id="submenuContainer" aria-live="polite"></div>
      </section>

      <div class="quick-actions">
        <button class="action-button primary mood-button" data-mood="happy" aria-label="Open assistant">
          <img class="mood-icon" src="/apps/morro-digital-platform/public/assets/emojis/sun_emojis/sun_emoji_1.png" alt="Assistant mood" />
        </button>
      </div>

      <div id="assistant-messages" class="assistant-modal auto-size grow-upward">
        <button class="minimize-button" aria-label="Minimize assistant" data-i18n-aria="assistant_minimize">×</button>
        <div class="messages-area">
          <div class="message assistant" data-message-type="standard">
            🎉 Welcome to Morro Digital! I am your official virtual guide to Morro de São Paulo, ready to help you easily explore tourist spots, beaches, restaurants, parties, tours, and everything you need at your fingertips. How can I help you? 😄
          </div>
          <div class="assistant-options" aria-label="Explore Morro Digital">
            <button type="button" class="assistant-option-btn" data-value="beaches">Beaches</button>
            <button type="button" class="assistant-option-btn" data-value="restaurants">Restaurants</button>
            <button type="button" class="assistant-option-btn" data-value="hotels">Hotels</button>
            <button type="button" class="assistant-option-btn" data-value="shops">Shops</button>
            <button type="button" class="assistant-option-btn" data-value="transport">Transport</button>
            <button type="button" class="assistant-option-btn" data-value="attractions">Attractions</button>
            <button type="button" class="assistant-option-btn" data-value="tours">Tours</button>
            <button type="button" class="assistant-option-btn" data-value="nightlife">Nightlife</button>
            <button type="button" class="assistant-option-btn" data-value="emergencies">Emergencies</button>
            <button type="button" class="assistant-option-btn" data-value="help">Help</button>
          </div>
        </div>
        <div class="navigation-instruction-area"></div>
      </div>

      <div id="carousel-modal" class="carousel-modal hidden">
        <button id="carousel-modal-close" class="minimize-button" aria-label="Fechar carrossel" data-i18n-aria="settings_close">×</button>
        <div class="carousel-container">
          <div class="swiper-container">
            <div class="swiper-wrapper"></div>
            <div class="swiper-pagination"></div>
            <div class="swiper-button-next"></div>
            <div class="swiper-button-prev"></div>
          </div>
          <div class="carousel-info-text">Primeira Praia</div>
        </div>
      </div>

      <section id="assistantVoiceSettings" class="assistant-voice-settings hidden" aria-hidden="true" aria-labelledby="assistantVoiceSettingsTitle">
        <div class="assistant-voice-settings-header">
          <h2 id="assistantVoiceSettingsTitle">Configurações de voz</h2>
          <button id="assistantVoiceSettingsClose" type="button" aria-label="Fechar configurações de voz">×</button>
        </div>
        <label class="assistant-voice-settings-row">
          <span>Voz do assistente</span>
          <input id="assistantVoiceEnabled" type="checkbox" disabled />
        </label>
        <label class="assistant-voice-settings-field" for="assistantVoiceSelect">
          <span>Voz</span>
          <select id="assistantVoiceSelect" class="assistant-voice-selector" disabled></select>
        </label>
        <label class="assistant-voice-settings-field" for="assistantVoiceSpeed">
          <span>Velocidade <output id="assistantVoiceSpeedValue" for="assistantVoiceSpeed">1.00×</output></span>
          <input id="assistantVoiceSpeed" type="range" min="0.5" max="2" step="0.05" value="1" disabled />
        </label>
        <label class="assistant-voice-settings-field" for="assistantVoiceLanguage">
          <span>Idioma</span>
          <select id="assistantVoiceLanguage" disabled>
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="he">עברית</option>
          </select>
        </label>
        <p class="assistant-voice-settings-support" aria-live="polite">As preferências são salvas neste navegador.</p>
      </section>

      <div id="assistant-input-area" class="assistant-input-area">
        <input
          type="text"
          id="assistantInput"
          placeholder="Type your question..."
          aria-label="Assistant input"
          data-i18n-placeholder="assistant_input_placeholder"
          data-i18n-aria="assistant_input_label"
        />
        <button id="sendButton" aria-label="Send message" data-i18n-aria="assistant_send_label"><i class="fas fa-paper-plane"></i></button>
        <button id="voiceButton" aria-label="Send voice message" data-i18n-aria="assistant_voice_label"><i class="fas fa-microphone"></i></button>
        <button id="configButton" aria-label="Assistant settings" data-i18n-aria="assistant_settings_label"><i class="fas fa-cog"></i></button>
      </div>

      <div id="globe-map-control" class="globe-map-control">
        <button
          type="button"
          id="toggle-globe-view"
          class="map-control-button"
          title="Toggle global map view"
          aria-label="Toggle global map view"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21"></path>
          </svg>
          <span class="control-tooltip">Global view</span>
        </button>
      </div>

      <div id="instruction-banner" class="instruction-banner hidden">
        <div class="instruction-primary">
          <span id="instruction-arrow" class="instruction-icon">↑</span>
          <h2 id="instruction-main" class="instruction-main-text" data-i18n="navigation_continue_straight">Siga em frente</h2>
          <button id="minimize-navigation-btn" class="minimize-button" aria-label="Minimizar instruções de navegação" aria-expanded="true" data-i18n-aria="navigation_minimize"></button>
        </div>
        <div class="instruction-secondary">
          <p id="instruction-details" class="instruction-details">Siga em frente por 100m</p>
          <div class="progress-container"><div id="route-progress" class="progress-indicator-fill" style="width: 0%"></div></div>
          <div id="progress-text">0%</div>
          <div class="metrics-group">
            <div class="metric"><span class="metric-label" data-i18n="navigation_distance_label">Distância</span><span id="instruction-distance" class="metric-value">0 m</span></div>
            <div class="metric"><span class="metric-label" data-i18n="navigation_time_label">Tempo</span><span id="instruction-time" class="metric-value">0 min</span></div>
          </div>
        </div>
      </div>

      <div id="loading-overlay">
        <div class="loading-content">
          <div class="spinner"></div>
          <p data-i18n="map_loading_morro_digital">Carregando Morro Digital...</p>
        </div>
      </div>

      <p id="runtime-status" class="sr-only" role="status" aria-live="polite">Inicializando o runtime…</p>
      <select id="tour-select" class="sr-only" aria-label="Roteiro exibido no mapa" disabled>
        <option value="volta-a-ilha">Passeio Volta à Ilha</option>
        <option value="trilha-gamboa">Trilha Ecológica para a Gamboa</option>
        <option value="passeio-quadriciclo">Expedição de Quadriciclo</option>
      </select>
    </div>

    <button id="end-navigation-btn" class="end-navigation-btn" aria-label="Encerrar Navegação" data-i18n="navigation_stop" data-i18n-aria="navigation_stop" style="display:none;">Encerrar Navegação</button>
  `;
}

function synchronizeAssistantLayout(document: Document): void {
  const assistantMessages = document.getElementById("assistant-messages");
  const messagesArea =
    assistantMessages?.querySelector<HTMLElement>(".messages-area");
  if (!(assistantMessages instanceof HTMLElement) || !messagesArea) {
    return;
  }

  const update = (): void => {
    const textMessages = Array.from(
      messagesArea.querySelectorAll<HTMLElement>(
        ".message:not(.carousel-container)",
      ),
    );
    const carouselContainers = messagesArea.querySelectorAll(
      ".carousel-container",
    );
    const totalTextLength = textMessages.reduce(
      (total, message) => total + (message.textContent?.length ?? 0),
      0,
    );

    assistantMessages.classList.remove(
      "has-long-text",
      "has-short-text",
      "has-mixed-content",
    );

    if (totalTextLength > 500) {
      assistantMessages.classList.add("has-long-text");
    } else if (totalTextLength < 100) {
      assistantMessages.classList.add("has-short-text");
    }

    if (textMessages.length > 0 && carouselContainers.length > 0) {
      assistantMessages.classList.add("has-mixed-content");
    }

    const hasOverflow = messagesArea.scrollHeight > messagesArea.clientHeight;
    assistantMessages.classList.toggle("has-overflow", hasOverflow);

    if (hasOverflow) {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  };

  update();
  document.defaultView?.addEventListener("resize", update);
  void document.fonts.ready.then(update);
}

export function mountAppShell({ document }: AppShellMountOptions): HTMLElement {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Morro Digital app root '#app' was not found.");
  }

  root.innerHTML = createAppShellMarkup();
  synchronizeAssistantLayout(document);
  return root;
}
