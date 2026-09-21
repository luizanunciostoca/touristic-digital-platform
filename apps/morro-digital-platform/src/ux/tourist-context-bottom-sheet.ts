import {
  installContextualBottomSheet,
  type ContextualBottomSheetController,
} from "./contextual-bottom-sheet.js";

export type TouristContextSheetKind = "search" | "place" | "tour" | null;

export interface TouristContextSheetPresenter {
  readonly kind: TouristContextSheetKind;
  readonly active: boolean;
  destroy(): void;
}

function resolveKind(document: Document): TouristContextSheetKind {
  const assistant = document.getElementById("assistant-messages");
  if (!assistant || assistant.classList.contains("hidden")) return null;

  const mode = document.body.dataset.mdMode;
  if (mode === "tour") return "tour";
  if (mode === "place") return "place";

  const exploreResults = document.getElementById("assistant-category-results");
  const stage = exploreResults?.dataset.stage;
  if (stage === "filters" || stage === "places") return "search";
  return null;
}

export function installTouristContextBottomSheet(input: {
  readonly document: Document;
  readonly window: Window;
}): TouristContextSheetPresenter | null {
  const sheet = input.document.getElementById("assistant-messages");
  if (!(sheet instanceof HTMLElement)) return null;

  let currentKind: TouristContextSheetKind = null;
  const controller: ContextualBottomSheetController =
    installContextualBottomSheet({
      document: input.document,
      window: input.window,
      sheet,
      activeWhen: () => resolveKind(input.document) !== null,
      initialState: "half",
      bodyStateAttribute: "contextSheetState",
      activeClass: "md-contextual-tourist-sheet",
      handleClass: "md-contextual-sheet-handle md-icon-button",
    });

  const sync = (): void => {
    currentKind = resolveKind(input.document);
    if (currentKind) {
      sheet.dataset.contextSheetKind = currentKind;
    } else {
      delete sheet.dataset.contextSheetKind;
    }
    controller.sync();
  };

  const onExploreStateChanged = (): void => sync();
  const onAssistantUiChanged = (): void => sync();

  input.document.addEventListener(
    "morro:explore-state-changed",
    onExploreStateChanged,
  );
  input.document.addEventListener(
    "morro:assistant-ui-state",
    onAssistantUiChanged,
  );

  const MutationObserverConstructor = input.window.MutationObserver;
  const observer = new MutationObserverConstructor(sync);
  observer.observe(input.document.body, {
    attributes: true,
    attributeFilter: ["data-md-mode", "class"],
  });
  observer.observe(sheet, {
    attributes: true,
    attributeFilter: ["class", "aria-hidden"],
  });

  sync();

  return Object.freeze({
    get kind() {
      return currentKind;
    },
    get active() {
      return controller.active;
    },
    destroy() {
      observer.disconnect();
      input.document.removeEventListener(
        "morro:explore-state-changed",
        onExploreStateChanged,
      );
      input.document.removeEventListener(
        "morro:assistant-ui-state",
        onAssistantUiChanged,
      );
      delete sheet.dataset.contextSheetKind;
      controller.destroy();
    },
  });
}
