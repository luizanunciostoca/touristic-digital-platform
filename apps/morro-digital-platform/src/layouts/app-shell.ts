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
        <button class="action-button primary mood-button" data-mood="happy" aria-label="Abrir assistente">
          <img class="mood-icon" src="./assets/emojis/sun_emojis/sun_emoji_1.png" alt="Humor do assistente" />
        </button>
      </div>

      <div id="assistant-messages" class="assistant-modal hidden">
        <button class="minimize-button" aria-label="Minimizar assistente" data-i18n-aria="assistant_minimize">x</button>
        <div class="messages-area"></div>
        <div class="message assistant" data-message-type="standard"></div>
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

      <div id="assistant-input-area" class="assistant-input-area">
        <input
          type="text"
          id="assistantInput"
          placeholder="Pergunte algo sobre Morro de São Paulo..."
          aria-label="Campo de entrada do assistente"
          data-i18n-placeholder="assistant_input_placeholder"
          data-i18n-aria="assistant_input_label"
        />
        <button id="sendButton" aria-label="Enviar mensagem" data-i18n-aria="assistant_send_label"><i class="fas fa-paper-plane"></i></button>
        <button id="voiceButton" aria-label="Enviar mensagem de voz" data-i18n-aria="assistant_voice_label"><i class="fas fa-microphone"></i></button>
        <button id="configButton" aria-label="Configurações do assistente" data-i18n-aria="assistant_settings_label"><i class="fas fa-cog"></i></button>
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

export function mountAppShell({ document }: AppShellMountOptions): HTMLElement {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Morro Digital app root '#app' was not found.");
  }

  root.innerHTML = createAppShellMarkup();
  return root;
}
