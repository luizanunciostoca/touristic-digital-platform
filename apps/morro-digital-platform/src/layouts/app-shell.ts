export interface AppShellMountOptions {
  readonly document: Document;
}

function createAppShellMarkup(): string {
  return `
    <div
      class="app-shell md-viewport-shell md-tourist-shell-v2"
      data-destination-id="morro-de-sao-paulo"
      data-home-visual-state="loading"
    >
      <header class="md-home-header" aria-label="Morro Digital">
        <div class="header-content md-home-header-inner md-card">
          <span class="md-home-brand-mark" aria-hidden="true">M</span>
          <div class="md-home-title-block">
            <span class="md-home-eyebrow">Morro Digital</span>
            <h1>Morro de São Paulo</h1>
          </div>
        </div>
      </header>

      <section id="map-section" aria-label="Mapa interativo" data-i18n-aria="site_interactive_map_label">
        <div id="map-container">
          <div id="map" role="region" aria-label="Mapa interativo de Morro de São Paulo"></div>
          <div
            id="map-state-surface"
            class="md-map-state-surface"
            aria-live="polite"
            aria-hidden="false"
          >
            <div class="md-map-state-card md-map-state-loading md-card">
              <span class="md-map-state-icon" aria-hidden="true"></span>
              <div class="md-map-state-copy">
                <strong data-i18n="map_loading_morro_digital">Carregando Morro Digital...</strong>
                <span>Preparando o mapa e sua experiência.</span>
              </div>
            </div>
            <div class="md-map-state-card md-map-state-unavailable md-card">
              <span class="md-map-state-icon" aria-hidden="true">!</span>
              <div class="md-map-state-copy">
                <strong>Mapa temporariamente indisponível</strong>
                <span>O restante do Morro Digital continua acessível.</span>
              </div>
            </div>
          </div>
          <div id="weather-widget" class="weather-widget md-weather-control md-card">
            <div class="weather-compact-main md-weather-control-content">
              <div class="weather-emoji" aria-hidden="true">☀️</div>
              <span class="weather-temp">21°C</span>
              <div class="weather-compact-footer">
                <span class="click-here-text">Click here</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        id="discover-category-rail"
        class="md-discover-category-rail"
        role="group"
        aria-label="Explorar por categoria"
        data-discover-category-rail
      >
        <button type="button" class="md-discover-chip" data-discover-category="beaches" aria-pressed="false">Praias</button>
        <button type="button" class="md-discover-chip" data-discover-category="restaurants" aria-pressed="false">Restaurantes</button>
        <button type="button" class="md-discover-chip" data-discover-category="hotels" aria-pressed="false">Pousadas</button>
        <button type="button" class="md-discover-chip" data-discover-category="attractions" aria-pressed="false">Passeios</button>
        <button type="button" class="md-discover-chip" data-discover-category="nightlife" aria-pressed="false">Noite</button>
      </div>

      <section id="submenu" class="hidden">
        <div class="submenu-header">
          <h3 class="submenu-title" data-i18n="submenu_title_explore_places">Explorar locais</h3>
          <button class="close-button" aria-label="Fechar menu" data-i18n-aria="submenu_close">x</button>
        </div>
        <div id="submenuContainer" aria-live="polite"></div>
      </section>

      <div
        id="assistant-messages"
        class="md-assistant-dialog md-assistant-message-region hidden"
        role="region"
        aria-label="Morro Digital assistant"
        aria-hidden="true"
        aria-describedby="assistant-dialog-status"
        tabindex="-1"
        data-assistant-state="idle"
      >
        <button class="minimize-button md-icon-button" type="button" aria-label="Minimize assistant" data-i18n-aria="assistant_minimize">×</button>
        <p id="assistant-dialog-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true">Assistente pronto.</p>
        <div class="messages-area md-assistant-messages" role="region" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text">
          <div class="message assistant" data-message-type="standard" data-i18n="assistant_welcome_message">
            🎉 Welcome to Morro Digital! I am your official virtual guide to Morro de São Paulo, ready to help you easily explore tourist spots, beaches, restaurants, parties, tours, and everything you need at your fingertips. How can I help you? 😄
          </div>
          <div class="assistant-options md-assistant-options" data-assistant-command-source="legacy-category-routing">
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
        <div class="navigation-instruction-area" role="status" aria-live="polite"></div>
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

      <div id="assistant-input-area" class="assistant-input-area md-assistant-composer md-card is-persistent" role="group" aria-label="Assistant composer" data-home-assistant-entry="persistent" data-onboarding-target="assistant-composer" data-assistant-context-surface="map">
        <span class="md-assistant-entry-icon" aria-hidden="true"><i class="fas fa-comment-dots"></i></span>
        <input
          type="text"
          id="assistantInput"
          class="md-input"
          placeholder="Type your question..."
          aria-label="Assistant input"
          data-i18n-placeholder="assistant_input_placeholder"
          data-i18n-aria="assistant_input_label"
        />
        <button id="sendButton" class="md-icon-button md-assistant-expanded-action" type="button" aria-label="Send message" data-i18n-aria="assistant_send_label"><i class="fas fa-paper-plane"></i></button>
        <button id="voiceButton" class="md-icon-button md-assistant-expanded-action" type="button" aria-label="Send voice message" aria-pressed="false" data-i18n-aria="assistant_voice_label" data-onboarding-target="assistant-microphone" data-assistant-voice-affordance="microphone"><i class="fas fa-microphone" aria-hidden="true"></i></button>
      </div>

      <section id="home-profile-panel" class="md-home-profile-panel md-card hidden" aria-hidden="true" aria-labelledby="home-profile-title">
        <div class="md-home-profile-header">
          <div>
            <span class="md-home-profile-eyebrow" data-home-copy="profileEyebrow">Morro Digital</span>
            <h2 id="home-profile-title" data-home-copy="profileTitle">Perfil e preferências</h2>
          </div>
          <button id="home-profile-close" class="md-icon-button" type="button" aria-label="Fechar perfil" data-home-copy-aria="closeProfile">×</button>
        </div>
        <p class="md-home-profile-description" data-home-copy="profileDescription">Ajuste voz, idioma e privacidade sem sair do mapa.</p>
        <div class="md-home-profile-actions">
          <button id="configButton" class="md-button md-button--secondary" type="button" aria-label="Assistant settings" data-i18n-aria="assistant_settings_label">
            <i class="fas fa-cog" aria-hidden="true"></i>
            <span data-home-copy="assistantSettings">Configurações do assistente</span>
          </button>
          <button id="home-privacy-button" class="md-button md-button--secondary" type="button">
            <i class="fas fa-shield-alt" aria-hidden="true"></i>
            <span data-home-copy="privacy">Privacidade e LGPD</span>
          </button>
        </div>
      </section>

      <nav id="home-bottom-navigation" class="md-home-bottom-nav md-card" aria-label="Navegação principal" data-home-bottom-navigation>
        <button type="button" class="md-home-nav-item is-active" data-home-nav-action="explore" aria-current="page">
          <i class="fas fa-compass" aria-hidden="true"></i>
          <span data-home-copy="explore">Explorar</span>
        </button>
        <button type="button" class="md-home-nav-item" data-home-nav-action="tours">
          <i class="fas fa-route" aria-hidden="true"></i>
          <span data-home-copy="tours">Tours</span>
        </button>
        <button type="button" class="md-home-nav-item" data-home-nav-action="saved">
          <i class="fas fa-heart" aria-hidden="true"></i>
          <span data-home-copy="saved">Salvos</span>
        </button>
        <a class="md-home-nav-item" data-home-nav-action="tickets" href="/tickets.html">
          <i class="fas fa-ticket-alt" aria-hidden="true"></i>
          <span data-home-copy="tickets">Ingressos</span>
        </a>
        <button id="home-profile-button" type="button" class="md-home-nav-item" data-home-nav-action="profile" aria-expanded="false" aria-controls="home-profile-panel">
          <i class="fas fa-user-circle" aria-hidden="true"></i>
          <span data-home-copy="profile">Perfil</span>
        </button>
      </nav>

      <div id="globe-map-control" class="globe-map-control md-map-control-stack" aria-label="Controles do mapa">
        <button
          type="button"
          id="recenter-map-control"
          class="map-control-button md-icon-button md-map-control"
          title="Centralizar no Morro ou na sua localização"
          aria-label="Centralizar mapa no Morro ou na sua localização"
          data-map-control="recenter"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z"></path>
            <circle cx="12" cy="10" r="2.2"></circle>
          </svg>
          <span class="control-tooltip">Centralizar</span>
        </button>
        <button
          type="button"
          id="toggle-globe-view"
          class="map-control-button md-icon-button md-map-control"
          title="Toggle global map view"
          aria-label="Toggle global map view"
          aria-pressed="false"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21"></path>
          </svg>
          <span class="control-tooltip">Global view</span>
        </button>
      </div>

      <div id="instruction-banner" class="instruction-banner md-banner md-navigation-banner hidden" aria-labelledby="instruction-main">
        <div class="instruction-primary">
          <span id="instruction-arrow" class="instruction-icon">↑</span>
          <div class="instruction-copy">
            <h2 id="instruction-main" class="instruction-main-text" role="status" aria-live="polite" aria-atomic="true" data-i18n="navigation_continue_straight">Siga em frente</h2>
            <span id="instruction-step-distance" class="instruction-step-distance">0 m</span>
          </div>
          <button id="minimize-navigation-btn" class="minimize-button md-icon-button" type="button" aria-label="Minimizar instruções de navegação" aria-expanded="true" aria-controls="instruction-secondary" data-i18n-aria="navigation_minimize"></button>
        </div>
        <div id="instruction-secondary" class="instruction-secondary">
          <p id="instruction-details" class="instruction-details">Siga em frente por 100m</p>
          <div class="progress-container"><div id="route-progress" class="progress-indicator-fill" style="width: 0%"></div></div>
          <div id="progress-text">0%</div>
        </div>
      </div>

      <aside
        id="navigation-summary"
        class="navigation-summary md-card"
        aria-label="Resumo da navegação"
      >
        <div class="metrics-group navigation-summary-metrics">
          <div class="metric"><span class="metric-label" data-i18n="navigation_distance_label">Distância</span><span id="instruction-distance" class="metric-value">0 m</span></div>
          <div class="metric"><span class="metric-label" data-i18n="navigation_time_label">Tempo</span><span id="instruction-time" class="metric-value">0 min</span></div>
        </div>
        <button id="end-navigation-btn" class="end-navigation-btn md-button md-button--destructive" type="button" aria-label="Encerrar Navegação" data-i18n="navigation_stop" data-i18n-aria="navigation_stop" style="display:none;">Encerrar Navegação</button>
      </aside>

      <div id="loading-overlay" class="md-home-loading-overlay">
        <div class="loading-content md-card">
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

  `;
}

function synchronizeHomeVisualState(document: Document): () => void {
  const shell = document.querySelector<HTMLElement>(".md-tourist-shell-v2");
  const map = document.getElementById("map");
  const surface = document.getElementById("map-state-surface");
  if (!shell || !map || !surface) return () => undefined;

  const update = (): void => {
    const mapState = map.dataset.mapState;
    const visualState =
      mapState === "ready"
        ? "ready"
        : mapState === "error"
          ? "provider-unavailable"
          : "loading";
    shell.dataset.homeVisualState = visualState;
    surface.dataset.state = visualState;
    surface.setAttribute("aria-hidden", String(visualState === "ready"));
  };

  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  const observer = MutationObserverConstructor
    ? new MutationObserverConstructor(update)
    : undefined;
  observer?.observe(map, {
    attributes: true,
    attributeFilter: ["data-map-state", "data-map-provider", "data-map-mode"],
  });
  update();

  return () => observer?.disconnect();
}

function composeUnifiedAssistantDock(document: Document): HTMLElement | null {
  const shell = document.querySelector<HTMLElement>(".md-tourist-shell-v2");
  const messages = document.getElementById("assistant-messages");
  const composer = document.getElementById("assistant-input-area");
  const navigation = document.getElementById("home-bottom-navigation");
  if (!shell || !messages || !composer || !navigation) return null;

  let dock = document.getElementById("unified-assistant-dock");
  if (!(dock instanceof HTMLElement)) {
    dock = document.createElement("section");
    dock.id = "unified-assistant-dock";
    dock.className = "md-unified-assistant-dock";
    dock.setAttribute("aria-label", "Assistente e navegação principal");
    dock.dataset.unifiedAssistantDock = "true";
    messages.before(dock);
  }

  messages.classList.remove("assistant-modal", "auto-size", "grow-upward");
  messages.classList.add("md-assistant-message-region");
  messages.setAttribute("role", "region");
  messages.setAttribute("aria-modal", "false");
  messages.removeAttribute("tabindex");
  messages.querySelector<HTMLElement>(".messages-area")?.classList.add(
    "md-assistant-message-scroll",
  );

  dock.append(messages, composer, navigation);
  document.body.dataset.mdUnifiedDock = "true";
  return dock;
}

function synchronizeUnifiedAssistantDockInset(
  document: Document,
  dock: HTMLElement | null,
): void {
  if (!dock) return;
  const root = document.documentElement;
  const update = (): void => {
    const height = Math.max(0, Math.ceil(dock.getBoundingClientRect().height));
    root.style.setProperty("--md-unified-dock-height", `${height}px`);
    root.style.setProperty(
      "--md-unified-dock-map-inset",
      `${Math.max(0, height + 16)}px`,
    );
  };

  update();
  const ResizeObserverConstructor = document.defaultView?.ResizeObserver;
  const resizeObserver = ResizeObserverConstructor
    ? new ResizeObserverConstructor(update)
    : undefined;
  resizeObserver?.observe(dock);
  document.defaultView?.addEventListener("resize", update);
  document.defaultView?.visualViewport?.addEventListener("resize", update);
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
      ".carousel-container, .assistant-photo-carousel",
    );
    const richInteractiveContainers = messagesArea.querySelectorAll(
      ".assistant-options, #assistant-category-results, .assistant-photo-carousel, .assistant-photo-back-options",
    );
    const totalTextLength = textMessages.reduce(
      (total, message) => total + (message.textContent?.length ?? 0),
      0,
    );

    assistantMessages.classList.remove(
      "has-long-text",
      "has-short-text",
      "has-mixed-content",
      "has-rich-content",
    );

    if (totalTextLength > 500) {
      assistantMessages.classList.add("has-long-text");
    } else if (totalTextLength < 100) {
      assistantMessages.classList.add("has-short-text");
    }

    if (textMessages.length > 0 && carouselContainers.length > 0) {
      assistantMessages.classList.add("has-mixed-content");
    }
    if (richInteractiveContainers.length > 0) {
      assistantMessages.classList.add("has-rich-content");
    }

    const hasOverflow = messagesArea.scrollHeight > messagesArea.clientHeight;
    assistantMessages.classList.toggle("has-overflow", hasOverflow);

    if (hasOverflow) {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }
  };

  update();
  document.defaultView?.addEventListener("resize", update);
  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  const mutationObserver = MutationObserverConstructor
    ? new MutationObserverConstructor(update)
    : undefined;
  mutationObserver?.observe(messagesArea, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "aria-hidden"],
  });
  void document.fonts.ready.then(update);
}

export function mountAppShell({ document }: AppShellMountOptions): HTMLElement {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("Morro Digital app root '#app' was not found.");
  }

  root.innerHTML = createAppShellMarkup();
  const unifiedDock = composeUnifiedAssistantDock(document);
  synchronizeHomeVisualState(document);
  synchronizeAssistantLayout(document);
  synchronizeUnifiedAssistantDockInset(document, unifiedDock);
  return root;
}
