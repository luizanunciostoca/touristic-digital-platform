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
        class="md-assistant-dialog md-assistant-message-region"
        role="region"
        aria-label="Morro Digital assistant"
        aria-hidden="false"
        aria-describedby="assistant-dialog-status"
        tabindex="-1"
        data-assistant-state="idle"
      >
        <button class="minimize-button md-icon-button" type="button" aria-label="Minimize assistant" data-i18n-aria="assistant_minimize">×</button>
        <p id="assistant-dialog-status" class="sr-only" role="status" aria-live="polite" aria-atomic="true">Assistente pronto.</p>
        <div class="messages-area md-assistant-messages" role="region" aria-label="Assistant conversation" aria-live="polite" aria-relevant="additions text">
          <div class="message assistant" data-message-type="standard" data-i18n="assistant_welcome_message">
            Bem-vindo ao Morro Digital!
Posso ajudar você a encontrar praias, passeios, restaurantes e experiências.
          </div>
          <div class="assistant-options md-assistant-options" data-assistant-command-source="legacy-category-routing">
            <button type="button" class="assistant-option-btn" data-value="beaches">Beaches</button>
            <button type="button" class="assistant-option-btn" data-value="tours">Tours</button>
            <button type="button" class="assistant-option-btn" data-value="attractions">Attractions</button>
            <button type="button" class="assistant-option-btn" data-value="restaurants">Restaurants</button>
            <button type="button" class="assistant-option-btn" data-value="hotels">Hotels</button>
            <button type="button" class="assistant-option-btn" data-value="nightlife">Nightlife</button>
            <button type="button" class="assistant-option-btn" data-value="shops">Shops</button>
            <button type="button" class="assistant-option-btn" data-value="transport">Transport</button>
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

      <div
        id="assistant-category-rail"
        class="md-assistant-category-rail"
        role="region"
        aria-label="Categorias do assistente"
        data-assistant-category-rail
        data-rail-stage="menu"
      >
        <button
          type="button"
          class="md-context-rail-back"
          data-context-rail-back
          aria-label="Voltar"
          title="Voltar"
          hidden
        >
          <span class="md-context-rail-back-icon" aria-hidden="true">‹</span>
        </button>
        <div class="md-assistant-category-scroll">
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="beaches" data-value="beaches" aria-pressed="false">
          <i class="fas fa-umbrella-beach" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Praias</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="tours" data-value="tours" aria-pressed="false">
          <i class="fas fa-route" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Tours</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="attractions" data-value="attractions" aria-pressed="false">
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Atrações</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="restaurants" data-value="restaurants" aria-pressed="false">
          <i class="fas fa-utensils" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Restaurantes</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="hotels" data-value="hotels" aria-pressed="false">
          <i class="fas fa-bed" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Hotéis</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="nightlife" data-value="nightlife" aria-pressed="false">
          <i class="fas fa-moon" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Vida Noturna</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="shops" data-value="shops" aria-pressed="false">
          <i class="fas fa-shopping-bag" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Lojas</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="transport" data-value="transport" aria-pressed="false">
          <i class="fas fa-bus" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Transporte</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="emergencies" data-value="emergencies" aria-pressed="false">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Emergências</span>
          </button>
          <button type="button" class="md-assistant-category-chip md-context-rail-button md-context-rail-button--category" data-assistant-category="help" data-value="help" aria-pressed="false">
          <i class="fas fa-question-circle" aria-hidden="true"></i>
          <span class="md-assistant-category-label">Ajuda</span>
          </button>
        </div>
        <button
          type="button"
          class="md-category-scroll-hint"
          data-category-scroll-hint
          aria-label="Ver próximas opções"
          title="Ver próximas opções"
          hidden
        >›</button>
      </div>

      <div id="assistant-input-area" class="assistant-input-area md-assistant-composer md-card is-persistent is-voice-first" role="group" aria-label="Assistente por voz" data-home-assistant-entry="persistent" data-onboarding-target="assistant-composer" data-assistant-context-surface="map" data-assistant-entry-mode="voice-first">
        <span class="md-assistant-entry-icon" aria-hidden="true"><i class="fas fa-comment-dots"></i></span>
        <input
          type="text"
          id="assistantInput"
          class="md-assistant-compat-input"
          aria-label="Entrada de texto de compatibilidade do assistente"
          tabindex="-1"
          aria-hidden="true"
          autocomplete="off"
        />
        <button id="sendButton" class="md-assistant-compat-send" type="button" tabindex="-1" aria-hidden="true" aria-label="Enviar mensagem de compatibilidade"></button>
        <button id="voiceButton" class="md-assistant-voice-cta" type="button" aria-label="Fale comigo" aria-pressed="false" data-i18n-aria="assistant_voice_label" data-onboarding-target="assistant-microphone" data-assistant-voice-affordance="microphone">
          <i class="fas fa-microphone" aria-hidden="true"></i>
          <span data-i18n="assistant_voice_label">Fale comigo</span>
        </button>
      </div>

      <section
        id="home-profile-panel"
        class="md-home-profile-panel md-card hidden"
        aria-hidden="true"
        aria-labelledby="home-profile-title"
        role="dialog"
        aria-modal="false"
        data-profile-expanded="false"
      >
        <button
          id="home-profile-expand"
          class="md-home-profile-handle"
          type="button"
          aria-label="Expandir perfil"
          aria-expanded="false"
          data-home-copy-aria="expandProfile"
        >
          <span class="md-home-profile-handle-bar" aria-hidden="true"></span>
        </button>

        <div class="md-home-profile-header">
          <div class="md-home-profile-identity">
            <span class="md-home-profile-avatar" aria-hidden="true">
              <i class="fas fa-user"></i>
            </span>
            <div class="md-home-profile-heading">
              <span class="md-home-profile-eyebrow" data-home-copy="profileEyebrow">Morro Digital</span>
              <h2 id="home-profile-title" data-home-copy="profileTitle">Perfil e preferências</h2>
              <p class="md-home-profile-description" data-home-copy="profileDescription">Ajuste sua experiência sem tirar o mapa de cena.</p>
            </div>
          </div>
          <button id="home-profile-close" class="md-icon-button md-home-profile-close" type="button" aria-label="Fechar perfil" data-home-copy-aria="closeProfile">×</button>
        </div>

        <div class="md-home-profile-shortcuts" role="group" aria-label="Atalhos do perfil" data-home-copy-aria="profileQuickActions">
          <button type="button" class="md-home-profile-shortcut" data-profile-action="saved">
            <i class="fas fa-heart" aria-hidden="true"></i>
            <span data-home-copy="saved">Salvos</span>
          </button>
          <a class="md-home-profile-shortcut" href="/tickets.html">
            <i class="fas fa-ticket-alt" aria-hidden="true"></i>
            <span data-home-copy="tickets">Ingressos</span>
          </a>
          <button type="button" class="md-home-profile-shortcut" data-profile-action="tours">
            <i class="fas fa-route" aria-hidden="true"></i>
            <span data-home-copy="tours">Tours</span>
          </button>
        </div>

        <div class="md-home-profile-section-heading" data-home-copy="profilePreferences">Preferências</div>
        <div class="md-home-profile-actions">
          <button id="configButton" class="md-home-profile-row" type="button" aria-label="Assistant settings" data-i18n-aria="assistant_settings_label">
            <span class="md-home-profile-row-icon" aria-hidden="true"><i class="fas fa-cog"></i></span>
            <span data-home-copy="assistantSettings">Configurações do assistente</span>
            <i class="fas fa-chevron-right md-home-profile-row-chevron" aria-hidden="true"></i>
          </button>
          <button id="home-privacy-button" class="md-home-profile-row" type="button">
            <span class="md-home-profile-row-icon" aria-hidden="true"><i class="fas fa-shield-alt"></i></span>
            <span data-home-copy="privacy">Privacidade e LGPD</span>
            <i class="fas fa-chevron-right md-home-profile-row-chevron" aria-hidden="true"></i>
          </button>
        </div>
        <div class="md-home-profile-expanded-content">
          <p class="md-home-profile-expanded-note" data-home-copy="profileExpandedNote">Idioma, voz e privacidade continuam acessíveis sem tirar você do mapa.</p>
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
          title="Mostrar minha localização"
          aria-label="Mostrar minha localização no mapa"
          data-map-control="user-location"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>
            <circle cx="12" cy="12" r="9"></circle>
          </svg>
          <span class="control-tooltip">Minha localização</span>
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
        <button
          type="button"
          id="toggle-map-layer"
          class="map-control-button md-icon-button md-map-control"
          title="Alternar camada do mapa"
          aria-label="Alternar entre mapa padrão e satélite"
          aria-pressed="false"
          data-map-control="layer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"></path>
            <path d="M8 3v15M16 6v15"></path>
          </svg>
          <span class="control-tooltip">Camada do mapa</span>
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
  const categories = document.getElementById("assistant-category-rail");
  const composer = document.getElementById("assistant-input-area");
  const navigation = document.getElementById("home-bottom-navigation");
  if (!shell || !messages || !categories || !composer || !navigation)
    return null;

  let dock = document.getElementById("unified-assistant-dock");
  if (!(dock instanceof HTMLElement)) {
    dock = document.createElement("section");
    dock.id = "unified-assistant-dock";
    dock.className = "md-unified-assistant-dock";
    dock.setAttribute("aria-label", "Assistente e navegação principal");
    dock.dataset.unifiedAssistantDock = "true";
    messages.before(dock);
  }

  let grabber = dock.querySelector<HTMLElement>(".md-unified-dock-grabber");
  if (!grabber) {
    grabber = document.createElement("div");
    grabber.className = "md-unified-dock-grabber";
    grabber.setAttribute("aria-hidden", "true");
  }

  messages.classList.add("md-assistant-message-region");
  messages.setAttribute("role", "region");
  messages.removeAttribute("aria-modal");
  messages.removeAttribute("tabindex");
  messages
    .querySelector<HTMLElement>(".messages-area")
    ?.classList.add("md-assistant-message-scroll");

  dock.append(grabber, messages, categories, composer, navigation);

  categories.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(
      "[data-assistant-category]",
    );
    const value = button?.dataset.assistantCategory?.trim();
    if (!button || !value) return;

    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", {
        detail: { value, source: "unified-category-rail" },
      }),
    );
  });

  const categoryScroller = categories.querySelector<HTMLElement>(
    ".md-assistant-category-scroll",
  );
  const categoryScrollHint = categories.querySelector<HTMLElement>(
    "[data-category-scroll-hint]",
  );
  const synchronizeCategoryScrollHint = (): void => {
    if (!categoryScroller || !categoryScrollHint) return;
    const lastOption = categoryScroller.lastElementChild;
    if (!(lastOption instanceof HTMLElement)) {
      categoryScrollHint.hidden = true;
      categories.removeAttribute("data-has-scroll-forward");
      return;
    }

    const scrollerRect = categoryScroller.getBoundingClientRect();
    const lastOptionRect = lastOption.getBoundingClientRect();
    const isRtl =
      document.defaultView?.getComputedStyle(categoryScroller).direction ===
      "rtl";
    const hasForwardOverflow = isRtl
      ? lastOptionRect.left < scrollerRect.left - 1
      : lastOptionRect.right > scrollerRect.right + 1;

    categoryScrollHint.hidden = !hasForwardOverflow;
    categories.toggleAttribute("data-has-scroll-forward", hasForwardOverflow);
  };

  const scrollCategoryRailForward = (): void => {
    if (!categoryScroller || !categoryScrollHint) return;
    const isRtl =
      document.defaultView?.getComputedStyle(categoryScroller).direction ===
      "rtl";
    const step = Math.max(120, Math.floor(categoryScroller.clientWidth * 0.72));
    categoryScroller.scrollBy({
      left: isRtl ? -step : step,
      behavior: "smooth",
    });
  };

  categoryScrollHint?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    scrollCategoryRailForward();
  });

  categoryScroller?.addEventListener("scroll", synchronizeCategoryScrollHint, {
    passive: true,
  });
  document.defaultView?.addEventListener(
    "resize",
    synchronizeCategoryScrollHint,
  );
  const CategoryResizeObserver = document.defaultView?.ResizeObserver;
  const categoryResizeObserver = CategoryResizeObserver
    ? new CategoryResizeObserver(synchronizeCategoryScrollHint)
    : undefined;
  if (categoryScroller) categoryResizeObserver?.observe(categoryScroller);
  const CategoryMutationObserver = document.defaultView?.MutationObserver;
  const categoryMutationObserver = CategoryMutationObserver
    ? new CategoryMutationObserver(synchronizeCategoryScrollHint)
    : undefined;
  categoryMutationObserver?.observe(categoryScroller ?? categories, {
    childList: true,
    subtree: true,
  });
  synchronizeCategoryScrollHint();

  const synchronizeCategorySelection = (): void => {
    const activeCategory =
      document.getElementById("map")?.dataset.exploreCategory ?? null;
    categories
      .querySelectorAll<HTMLButtonElement>("[data-assistant-category]")
      .forEach((button) => {
        button.setAttribute(
          "aria-pressed",
          String(
            Boolean(activeCategory) &&
              button.dataset.assistantCategory === activeCategory,
          ),
        );
      });
  };
  document.addEventListener(
    "morro:explore-state-changed",
    synchronizeCategorySelection,
  );
  synchronizeCategorySelection();

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
      '.assistant-options:not([data-assistant-command-source="legacy-category-routing"]):not(.md-contextual-rail-source), #assistant-category-results:not(.md-contextual-rail-source), .assistant-photo-carousel, .assistant-photo-back-options',
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

    const messageNodes = Array.from(
      messagesArea.querySelectorAll<HTMLElement>(".message"),
    );
    const isInitialWelcome =
      messageNodes.length === 1 &&
      messageNodes[0]?.getAttribute("data-i18n") ===
        "assistant_welcome_message";

    if (isInitialWelcome) {
      messagesArea.scrollTop = 0;
    } else if (hasOverflow) {
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
