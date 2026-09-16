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

  function emitSubmission(message, source) {
    document.dispatchEvent(
      new CustomEvent("morro:assistant-input-submitted", {
        detail: { message, source },
      }),
    );
    document.dispatchEvent(
      new CustomEvent("morro:assistant-option-selected", {
        detail: { value: message, inputSource: source },
      }),
    );
  }

  function submitTypedInput(source) {
    const input = assistantInput();
    if (!input) return false;
    const message = String(input.value || "").trim();
    if (!message) return false;

    // V1 clears valid typed messages immediately, before async processing.
    input.value = "";
    emitSubmission(message, source);
    return true;
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
      if (!(target instanceof Element) || !target.closest(SEND_SELECTOR)) return;

      // The V1 input has exactly one dispatcher. Capture the click before the
      // V2 runtime handler so one user action can never enqueue twice.
      event.preventDefault();
      event.stopImmediatePropagation();
      submitTypedInput("button");
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.matches(INPUT_SELECTOR)) {
        return;
      }
      if (event.key !== "Enter") return;

      // V1 deliberately ignores Shift+Enter and IME composition Enter.
      if (event.shiftKey || event.isComposing) {
        event.stopImmediatePropagation();
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      submitTypedInput("keyboard");
    },
    true,
  );

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches(INPUT_SELECTOR)) {
      return;
    }

    // V1 forces 16px on iOS-capable inputs to prevent Safari auto-zoom.
    target.style.fontSize = "16px";
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
    if (!(target instanceof HTMLInputElement) || !target.matches(INPUT_SELECTOR)) {
      return;
    }
    setKeyboardVisible(false);
    scheduleRestore();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      const keyboardOpen = window.visualViewport.height < window.innerHeight * 0.75;
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

  // The shell is mounted dynamically. Keep the V1 16px input safeguard when
  // it appears without introducing another submit listener.
  const observer = new MutationObserver(() => {
    const input = assistantInput();
    if (input && input.dataset.v1InputParity !== "true") {
      input.dataset.v1InputParity = "true";
      input.style.fontSize = "16px";
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
