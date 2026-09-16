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
    if (!input) return false;

    const message = String(input.value || "").trim();
    if (!message) return false;

    document.dispatchEvent(
      new CustomEvent("morro:assistant-input-submitted", {
        detail: { message, source },
      }),
    );
    return true;
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

      // A valid V1 submission is allowed to continue to the existing V2 runtime,
      // which remains the single owner of assistant processing and input clearing.
      if (prepareTypedSubmission("button")) return;

      // V1 ignores whitespace-only drafts and keeps them in the field.
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

      // Let the existing V2 runtime handle the accepted Enter so processing and
      // synchronous clearing remain centralized rather than being duplicated.
      if (prepareTypedSubmission("keyboard")) return;

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
