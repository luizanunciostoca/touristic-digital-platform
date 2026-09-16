import { routeTypedAssistantCommand } from "./assistant-menu-flow-v1-parity.js";

const INSTALLATION_KEY = "__MORRO_ASSISTANT_INPUT_V1_PARITY__";

if (!globalThis[INSTALLATION_KEY]) {
  globalThis[INSTALLATION_KEY] = true;

  const INPUT_SELECTOR = "#assistantInput";
  const SEND_SELECTOR = "#sendButton";
  const KEYBOARD_VISIBLE_CLASS = "keyboard-visible";
  const IOS_UA = /iPad|iPhone|iPod/;
  const restoreTimers = new Set();
  let baselineInnerHeight = window.innerHeight;

  function assistantInput() {
    const input = document.querySelector(INPUT_SELECTOR);
    return input instanceof HTMLInputElement ? input : null;
  }

  function prepareTypedSubmission(source) {
    const input = assistantInput();
    if (!input) return "empty";

    const message = String(input.value || "").trim();
    if (!message) return "empty";

    document.dispatchEvent(
      new CustomEvent("morro:assistant-input-submitted", {
        detail: { message, source },
      }),
    );

    if (!routeTypedAssistantCommand(message)) return "passthrough";

    input.value = "";
    document.dispatchEvent(
      new CustomEvent("morro:assistant-menu-command-routed", {
        detail: { message, source },
      }),
    );
    return "handled";
  }

  function applyInputSafeguards(input) {
    if (!(input instanceof HTMLInputElement)) return;
    input.dataset.v1InputParity = "true";
    input.style.fontSize = "16px";
  }

  function setKeyboardVisible(visible) {
    document.body?.classList.toggle(KEYBOARD_VISIBLE_CLASS, visible);
    document.documentElement.classList.toggle(KEYBOARD_VISIBLE_CLASS, visible);
  }

  function repaintFixedElement(element) {
    if (!(element instanceof HTMLElement)) return;
    const previous = element.style.display;
    element.style.display = "none";
    void element.offsetHeight;
    element.style.display = previous;
  }

  function restoreIosLayout() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    const messages = document.getElementById("assistant-messages");
    if (messages instanceof HTMLElement) {
      messages.style.removeProperty("height");
      messages.style.removeProperty("max-height");
      messages.style.removeProperty("bottom");
    }

    repaintFixedElement(document.getElementById("unified-map-controls"));
    repaintFixedElement(document.getElementById("weather-widget"));
  }

  function scheduleRestore() {
    for (const delay of [100, 300, 600]) {
      const timer = window.setTimeout(() => {
        restoreTimers.delete(timer);
        restoreIosLayout();
      }, delay);
      restoreTimers.add(timer);
    }
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(SEND_SELECTOR))
        return;

      const submission = prepareTypedSubmission("button");
      if (submission === "passthrough") return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) ||
        !target.matches(INPUT_SELECTOR) ||
        event.key !== "Enter"
      ) {
        return;
      }

      // V1 deliberately does not submit Shift+Enter or IME composition Enter.
      if (event.shiftKey || event.isComposing) {
        event.stopImmediatePropagation();
        return;
      }

      const submission = prepareTypedSubmission("keyboard");
      if (submission === "passthrough") return;

      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      !target.matches(INPUT_SELECTOR)
    ) {
      return;
    }

    applyInputSafeguards(target);
    setKeyboardVisible(true);

    if (IOS_UA.test(navigator.userAgent)) {
      window.setTimeout(() => {
        if (document.activeElement === target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    }
  });

  document.addEventListener("focusout", (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      !target.matches(INPUT_SELECTOR)
    ) {
      return;
    }
    setKeyboardVisible(false);
    scheduleRestore();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const keyboardOpen =
        window.visualViewport.height < window.innerHeight * 0.75;
      setKeyboardVisible(keyboardOpen);
      if (!keyboardOpen) scheduleRestore();
    });
  }

  window.addEventListener("resize", () => {
    const currentHeight = window.innerHeight;
    if (currentHeight < baselineInnerHeight * 0.75) {
      setKeyboardVisible(true);
      return;
    }
    if (currentHeight >= baselineInnerHeight * 0.9) {
      setKeyboardVisible(false);
      scheduleRestore();
      baselineInnerHeight = Math.max(baselineInnerHeight, currentHeight);
    }
  });

  const observer = new MutationObserver(() => {
    applyInputSafeguards(assistantInput());
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  applyInputSafeguards(assistantInput());
}
