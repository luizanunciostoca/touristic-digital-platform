import { mkdirSync, writeFileSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright/index.js";

const { chromium } = playwright;

const BASE_URL = process.env.MORRO_BROWSER_URL || "http://127.0.0.1:4173/";
const OUTPUT_DIR =
  process.env.VOICE_EVIDENCE_DIR || "/tmp/assistant-voice-browser-contract";

mkdirSync(OUTPUT_DIR, { recursive: true });

function assert(condition, message, details) {
  if (condition) return;
  const suffix = details === undefined ? "" : `: ${JSON.stringify(details)}`;
  throw new Error(`${message}${suffix}`);
}

async function installSupportedVoiceMocks(context) {
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");
    localStorage.removeItem("voiceAssistant");
    localStorage.removeItem("voice-enabled");
    localStorage.removeItem("voice-speed");
    localStorage.removeItem("assistant-voice");
    localStorage.removeItem("voice-language");

    const voices = [
      {
        name: "Portuguese Test",
        lang: "pt-BR",
        default: true,
        localService: true,
        voiceURI: "pt-test",
      },
      {
        name: "English Test",
        lang: "en-US",
        default: false,
        localService: true,
        voiceURI: "en-test",
      },
      {
        name: "Spanish Test",
        lang: "es-ES",
        default: false,
        localService: true,
        voiceURI: "es-test",
      },
      {
        name: "Hebrew Test",
        lang: "he-IL",
        default: false,
        localService: true,
        voiceURI: "he-test",
      },
    ];

    globalThis.__voiceContract = {
      spoken: [],
      cancelled: 0,
      recognitions: [],
    };

    const listeners = new Map();
    const synthesis = {
      getVoices: () => voices,
      cancel: () => {
        globalThis.__voiceContract.cancelled += 1;
      },
      speak: (utterance) => {
        globalThis.__voiceContract.spoken.push({
          text: utterance.text,
          lang: utterance.lang,
          rate: utterance.rate,
          volume: utterance.volume,
          pitch: utterance.pitch,
          voice: utterance.voice?.name ?? null,
        });
      },
      addEventListener: (type, listener) => {
        const bucket = listeners.get(type) ?? [];
        bucket.push(listener);
        listeners.set(type, bucket);
      },
      removeEventListener: (type, listener) => {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((entry) => entry !== listener),
        );
      },
    };

    class FakeUtterance {
      constructor(text) {
        this.text = text;
        this.lang = "";
        this.volume = 1;
        this.rate = 1;
        this.pitch = 1;
        this.voice = null;
      }
    }

    class FakeRecognition {
      constructor() {
        this.continuous = true;
        this.interimResults = true;
        this.lang = "";
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        globalThis.__voiceContract.recognitions.push(this);
      }

      start() {
        this.started = true;
        setTimeout(() => {
          this.onresult?.({
            results: {
              length: 1,
              0: { 0: { transcript: "help", confidence: 0.98 } },
            },
          });
          this.onend?.();
        }, 30);
      }

      stop() {
        this.stopped = true;
        this.onend?.();
      }
    }

    Object.defineProperty(globalThis, "speechSynthesis", {
      configurable: true,
      value: synthesis,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(globalThis, "SpeechRecognition", {
      configurable: true,
      value: FakeRecognition,
    });
    Object.defineProperty(globalThis, "webkitSpeechRecognition", {
      configurable: true,
      value: undefined,
    });
  });
}

async function waitForAssistant(page) {
  await page
    .locator("#configButton")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .locator("#voiceButton")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .locator("#assistantInput")
    .waitFor({ state: "visible", timeout: 30000 });
}

async function poll(page, probe, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not become ready`);
}

async function runSupportedContract(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await installSupportedVoiceMocks(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForAssistant(page);
  await page.locator("#configButton").click();
  await page
    .locator("#assistantVoiceSettings:not(.hidden)")
    .waitFor({ state: "visible" });

  const initial = await page.evaluate(() => ({
    expanded: document
      .getElementById("configButton")
      ?.getAttribute("aria-expanded"),
    enabled: document.getElementById("assistantVoiceEnabled")?.checked,
    rate: document.getElementById("assistantVoiceSpeed")?.value,
    languages: Array.from(
      document.getElementById("assistantVoiceLanguage")?.options ?? [],
    ).map((option) => option.value),
    voices: Array.from(
      document.getElementById("assistantVoiceSelect")?.options ?? [],
    ).map((option) => option.value),
  }));
  assert(initial.expanded === "true", "Voice settings did not open", initial);
  assert(initial.enabled === true, "Voice should default to enabled", initial);
  assert(initial.rate === "1", "Voice should default to rate 1", initial);
  assert(
    JSON.stringify(initial.languages) ===
      JSON.stringify(["pt", "en", "es", "he"]),
    "PT/EN/ES/HE options diverged",
    initial.languages,
  );
  for (const name of [
    "Portuguese Test",
    "English Test",
    "Spanish Test",
    "Hebrew Test",
  ]) {
    assert(
      initial.voices.includes(name),
      `Browser voice option missing: ${name}`,
      initial.voices,
    );
  }

  const localeCases = [
    ["pt", "pt-BR"],
    ["en", "en-US"],
    ["es", "es-ES"],
    ["he", "he-IL"],
  ];
  for (const [language, locale] of localeCases) {
    await page.locator("#assistantVoiceLanguage").selectOption(language);
    const state = await page.evaluate(() => ({
      htmlLang: document.documentElement.lang,
      storageLanguage: localStorage.getItem("voice-language"),
      serialized: localStorage.getItem("voiceAssistant"),
    }));
    assert(
      state.htmlLang === locale,
      `Document locale did not follow ${language}`,
      state,
    );
    assert(
      state.storageLanguage === locale,
      `Legacy voice-language did not persist ${locale}`,
      state,
    );
    assert(
      Boolean(state.serialized),
      "voiceAssistant aggregate preference was not persisted",
      state,
    );
  }

  await page.locator("#assistantVoiceSpeed").evaluate((element) => {
    element.value = "1.25";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#assistantVoiceSelect").selectOption("Hebrew Test");
  const persisted = await page.evaluate(() => ({
    enabled: localStorage.getItem("voice-enabled"),
    speed: localStorage.getItem("voice-speed"),
    voice: localStorage.getItem("assistant-voice"),
    language: localStorage.getItem("voice-language"),
    aggregate: JSON.parse(localStorage.getItem("voiceAssistant") || "null"),
  }));
  assert(
    persisted.enabled === "true",
    "Legacy voice-enabled key diverged",
    persisted,
  );
  assert(
    persisted.speed === "1.25",
    "Legacy voice-speed key diverged",
    persisted,
  );
  assert(
    persisted.voice === "Hebrew Test",
    "Legacy assistant-voice key diverged",
    persisted,
  );
  assert(
    persisted.language === "he-IL",
    "Legacy voice-language key diverged",
    persisted,
  );
  assert(
    persisted.aggregate?.language === "he" &&
      persisted.aggregate?.rate === 1.25,
    "voiceAssistant aggregate state diverged",
    persisted,
  );

  await page.locator("#assistantVoiceSettingsClose").click();
  const userMessagesBefore = await page
    .locator("#assistant-messages .message.user")
    .count();
  const assistantMessagesBefore = await page
    .locator("#assistant-messages .message.assistant")
    .count();
  await page.locator("#voiceButton").click();
  await poll(
    page,
    () =>
      page.evaluate(
        ({ userMessagesBefore, assistantMessagesBefore }) =>
          document.querySelectorAll("#assistant-messages .message.user")
            .length > userMessagesBefore &&
          document.querySelectorAll("#assistant-messages .message.assistant")
            .length > assistantMessagesBefore &&
          globalThis.__voiceContract.spoken.length > 0,
        { userMessagesBefore, assistantMessagesBefore },
      ),
    "voice-process",
  );

  const microphone = await page.evaluate(() => {
    const recognition = globalThis.__voiceContract.recognitions.at(-1);
    const spoken = globalThis.__voiceContract.spoken.at(-1);
    const users = Array.from(
      document.querySelectorAll("#assistant-messages .message.user"),
    ).map((node) => node.textContent?.trim());
    return {
      recognition: recognition
        ? {
            lang: recognition.lang,
            continuous: recognition.continuous,
            interimResults: recognition.interimResults,
            started: recognition.started === true,
          }
        : null,
      spoken,
      users,
      ariaPressed: document
        .getElementById("voiceButton")
        ?.getAttribute("aria-pressed"),
    };
  });
  assert(
    microphone.recognition?.lang === "he-IL",
    "Microphone did not reuse selected locale",
    microphone,
  );
  assert(
    microphone.recognition?.continuous === false,
    "Voice input must remain one-shot",
    microphone,
  );
  assert(
    microphone.recognition?.interimResults === false,
    "Voice input must ignore interim results",
    microphone,
  );
  assert(
    microphone.recognition?.started === true,
    "Microphone recognition did not start",
    microphone,
  );
  assert(
    microphone.users.includes("help"),
    "Recognized transcript did not traverse the shared process() path",
    microphone,
  );
  assert(
    microphone.spoken?.lang === "he-IL",
    "Synthesis did not reuse Hebrew locale",
    microphone,
  );
  assert(
    microphone.spoken?.voice === "Hebrew Test",
    "Selected browser voice was not synthesized",
    microphone,
  );
  assert(
    microphone.spoken?.rate === 1.25,
    "Selected speech rate was not synthesized",
    microphone,
  );
  assert(
    microphone.ariaPressed === "false",
    "Voice button listening lifecycle did not settle",
    microphone,
  );

  const spokenBeforeDisable = await page.evaluate(
    () => globalThis.__voiceContract.spoken.length,
  );
  await page.locator("#configButton").click();
  await page.locator("#assistantVoiceEnabled").uncheck();
  await page.locator("#assistantVoiceSettingsClose").click();
  await page.locator("#assistantInput").fill("help");
  await page.locator("#sendButton").click();
  await poll(
    page,
    () =>
      page.evaluate(
        (count) =>
          document.querySelectorAll("#assistant-messages .message.user")
            .length > count,
        userMessagesBefore + 1,
      ),
    "disabled-text-process",
    10000,
  );
  await page.waitForTimeout(250);
  const disabled = await page.evaluate(() => ({
    spoken: globalThis.__voiceContract.spoken.length,
    enabled: localStorage.getItem("voice-enabled"),
  }));
  assert(
    disabled.enabled === "false",
    "Disabling voice did not persist",
    disabled,
  );
  assert(
    disabled.spoken === spokenBeforeDisable,
    "Speech synthesis ran while disabled",
    disabled,
  );
  assert(pageErrors.length === 0, "Browser emitted page errors", pageErrors);

  const result = { initial, persisted, microphone, disabled, pageErrors };
  writeFileSync(
    `${OUTPUT_DIR}/supported.json`,
    JSON.stringify(result, null, 2),
  );
  await page.screenshot({
    path: `${OUTPUT_DIR}/supported-settings.png`,
    animations: "disabled",
  });
  await context.close();
  return result;
}

async function runUnsupportedContract(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");

    const hideCapability = (target, property) => {
      try {
        Object.defineProperty(target, property, {
          configurable: true,
          get: () => undefined,
        });
      } catch {
        try {
          target[property] = undefined;
        } catch {
          // Best-effort override for browser-native capability detection.
        }
      }
    };

    for (const property of [
      "speechSynthesis",
      "SpeechSynthesisUtterance",
      "SpeechRecognition",
      "webkitSpeechRecognition",
    ]) {
      hideCapability(globalThis, property);
      hideCapability(Window.prototype, property);
    }
  });
  const page = await context.newPage();
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForAssistant(page);
  await page.locator("#configButton").click();
  const state = await page.evaluate(() => ({
    supported: document.getElementById("assistantVoiceSettings")?.dataset
      .voiceSupported,
    enabledDisabled: document.getElementById("assistantVoiceEnabled")?.disabled,
    voiceDisabled: document.getElementById("assistantVoiceSelect")?.disabled,
    speedDisabled: document.getElementById("assistantVoiceSpeed")?.disabled,
    languageDisabled: document.getElementById("assistantVoiceLanguage")
      ?.disabled,
  }));
  assert(
    state.supported === "false",
    "Unsupported speech synthesis state not exposed",
    state,
  );
  assert(
    state.enabledDisabled &&
      state.voiceDisabled &&
      state.speedDisabled &&
      state.languageDisabled,
    "Unsupported-browser controls must be disabled",
    state,
  );

  const assistantMessagesBefore = await page
    .locator("#assistant-messages .message.assistant")
    .count();
  await page.locator("#assistantVoiceSettingsClose").click();
  await page.locator("#voiceButton").click();
  await poll(
    page,
    () =>
      page.evaluate(
        (before) =>
          document.querySelectorAll("#assistant-messages .message.assistant")
            .length > before,
        assistantMessagesBefore,
      ),
    "unsupported-fallback",
    5000,
  );
  const fallback = await page
    .locator("#assistant-messages .message.assistant")
    .last()
    .textContent();
  assert(
    fallback?.includes("não suporta reconhecimento de voz"),
    "Unsupported microphone fallback diverged",
    fallback,
  );

  const result = { state, fallback };
  writeFileSync(
    `${OUTPUT_DIR}/unsupported.json`,
    JSON.stringify(result, null, 2),
  );
  await context.close();
  return result;
}

const browser = await chromium.launch({ headless: true });
try {
  const supported = await runSupportedContract(browser);
  const unsupported = await runUnsupportedContract(browser);
  writeFileSync(
    `${OUTPUT_DIR}/evidence.json`,
    JSON.stringify(
      {
        baseline: "60746fd7fed97b805758b37adfdbe3bad2582bfe",
        contract: "MIG-0006 Voice",
        languages: ["pt-BR", "en-US", "es-ES", "he-IL"],
        legacyKeys: [
          "voice-enabled",
          "voice-speed",
          "assistant-voice",
          "voice-language",
          "voiceAssistant",
        ],
        supported,
        unsupported,
      },
      null,
      2,
    ),
  );
  console.log("Assistant voice browser contract: PASS");
} finally {
  await browser.close();
}
