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

async function poll(page, probe, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not become ready`);
}

async function installSpeechMocks(context) {
  await context.addInitScript(() => {
    localStorage.setItem("morro-digital-onboarded", "1");
    for (const key of [
      "voiceAssistant",
      "voice-enabled",
      "voice-speed",
      "assistant-voice",
      "voice-language",
    ]) {
      localStorage.removeItem(key);
    }

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
    .locator("#assistantInput")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .locator("#voiceButton")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .locator("#configButton")
    .waitFor({ state: "visible", timeout: 30000 });
}

async function runContract(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await installSpeechMocks(context);
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
  assert(initial.enabled === true, "Voice should default enabled", initial);
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
      `Missing browser voice ${name}`,
      initial.voices,
    );
  }

  for (const [language, locale] of [
    ["pt", "pt-BR"],
    ["en", "en-US"],
    ["es", "es-ES"],
    ["he", "he-IL"],
  ]) {
    await page.locator("#assistantVoiceLanguage").selectOption(language);
    const languageState = await page.evaluate(() => ({
      htmlLang: document.documentElement.lang,
      stored: localStorage.getItem("voice-language"),
      aggregate: localStorage.getItem("voiceAssistant"),
    }));
    assert(
      languageState.htmlLang === locale,
      `Document locale diverged for ${language}`,
      languageState,
    );
    assert(
      languageState.stored === locale,
      `voice-language diverged for ${language}`,
      languageState,
    );
    assert(
      Boolean(languageState.aggregate),
      "voiceAssistant aggregate key missing",
      languageState,
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
    "voice-enabled compatibility key diverged",
    persisted,
  );
  assert(
    persisted.speed === "1.25",
    "voice-speed compatibility key diverged",
    persisted,
  );
  assert(
    persisted.voice === "Hebrew Test",
    "assistant-voice compatibility key diverged",
    persisted,
  );
  assert(
    persisted.language === "he-IL",
    "voice-language compatibility key diverged",
    persisted,
  );
  assert(
    persisted.aggregate?.language === "he" &&
      persisted.aggregate?.rate === 1.25,
    "voiceAssistant aggregate state diverged",
    persisted,
  );

  await page.locator("#assistantVoiceSettingsClose").click();
  const userBefore = await page
    .locator("#assistant-messages .message.user")
    .count();
  const assistantBefore = await page
    .locator("#assistant-messages .message.assistant")
    .count();
  await page.locator("#voiceButton").click();

  await poll(
    page,
    () =>
      page.evaluate(
        ({ userBefore, assistantBefore }) =>
          document.querySelectorAll("#assistant-messages .message.user")
            .length > userBefore &&
          document.querySelectorAll("#assistant-messages .message.assistant")
            .length > assistantBefore &&
          globalThis.__voiceContract.spoken.length > 0,
        { userBefore, assistantBefore },
      ),
    "microphone process path",
  );

  const microphone = await page.evaluate(() => {
    const recognition = globalThis.__voiceContract.recognitions.at(-1);
    const spoken = globalThis.__voiceContract.spoken.at(-1);
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
      users: Array.from(
        document.querySelectorAll("#assistant-messages .message.user"),
      ).map((node) => node.textContent?.trim()),
      ariaPressed: document
        .getElementById("voiceButton")
        ?.getAttribute("aria-pressed"),
    };
  });

  assert(
    microphone.recognition?.lang === "he-IL",
    "Microphone locale diverged",
    microphone,
  );
  assert(
    microphone.recognition?.continuous === false,
    "Recognition must remain one-shot",
    microphone,
  );
  assert(
    microphone.recognition?.interimResults === false,
    "Interim recognition must remain disabled",
    microphone,
  );
  assert(
    microphone.recognition?.started === true,
    "Recognition did not start",
    microphone,
  );
  assert(
    microphone.users.includes("help"),
    "Transcript did not traverse shared process()",
    microphone,
  );
  assert(
    microphone.spoken?.lang === "he-IL",
    "Synthesis locale diverged",
    microphone,
  );
  assert(
    microphone.spoken?.voice === "Hebrew Test",
    "Selected voice was not applied",
    microphone,
  );
  assert(
    microphone.spoken?.rate === 1.25,
    "Selected rate was not applied",
    microphone,
  );
  assert(
    microphone.ariaPressed === "false",
    "Listening lifecycle did not settle",
    microphone,
  );

  const spokenBeforeDisable = await page.evaluate(
    () => globalThis.__voiceContract.spoken.length,
  );
  await page.locator("#configButton").click();
  await page.locator("#assistantVoiceEnabled").uncheck();
  await page.locator("#assistantVoiceSettingsClose").click();
  const usersBeforeText = await page
    .locator("#assistant-messages .message.user")
    .count();
  await page.locator("#assistantInput").fill("help");
  await page.locator("#sendButton").click();
  await poll(
    page,
    () =>
      page.evaluate(
        (count) =>
          document.querySelectorAll("#assistant-messages .message.user")
            .length > count,
        usersBeforeText,
      ),
    "disabled voice text process",
    10000,
  );
  await page.waitForTimeout(250);
  const disabled = await page.evaluate(() => ({
    enabled: localStorage.getItem("voice-enabled"),
    spoken: globalThis.__voiceContract.spoken.length,
  }));
  assert(
    disabled.enabled === "false",
    "Disabling voice did not persist",
    disabled,
  );
  assert(
    disabled.spoken === spokenBeforeDisable,
    "Synthesis ran while disabled",
    disabled,
  );

  const unsupported = await page.evaluate(async () => {
    const appRoot = [
      "",
      "apps",
      "morro-digital-platform",
      "dist",
      "assistant",
    ].join("/");
    const settingsModule = await import(
      `${appRoot}/assistant-voice-settings.js`
    );
    const inputModule = await import(
      `${appRoot}/assistant-voice-input-adapter.js`
    );
    const controller = settingsModule.installAssistantVoiceSettings({
      document,
      voice: null,
    });
    const result = {
      supported: document.getElementById("assistantVoiceSettings")?.dataset
        .voiceSupported,
      enabledDisabled: document.getElementById("assistantVoiceEnabled")
        ?.disabled,
      voiceDisabled: document.getElementById("assistantVoiceSelect")?.disabled,
      speedDisabled: document.getElementById("assistantVoiceSpeed")?.disabled,
      languageDisabled: document.getElementById("assistantVoiceLanguage")
        ?.disabled,
      recognitionUnsupported:
        inputModule.resolveAssistantSpeechRecognitionConstructor({}) === null,
    };
    controller.destroy();
    return result;
  });

  assert(
    unsupported.supported === "false",
    "Missing synthesis fallback state diverged",
    unsupported,
  );
  assert(
    unsupported.enabledDisabled &&
      unsupported.voiceDisabled &&
      unsupported.speedDisabled &&
      unsupported.languageDisabled,
    "Missing synthesis controls must fail closed",
    unsupported,
  );
  assert(
    unsupported.recognitionUnsupported,
    "Missing SpeechRecognition capability must fail closed",
    unsupported,
  );
  assert(pageErrors.length === 0, "Browser emitted page errors", pageErrors);

  const evidence = {
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
    initial,
    persisted,
    microphone,
    disabled,
    unsupported,
    pageErrors,
  };

  writeFileSync(
    `${OUTPUT_DIR}/evidence.json`,
    JSON.stringify(evidence, null, 2),
  );
  await page.screenshot({
    path: `${OUTPUT_DIR}/voice-contract.png`,
    animations: "disabled",
  });
  await context.close();
  return evidence;
}

const browser = await chromium.launch({ headless: true });
try {
  await runContract(browser);
  console.log("Assistant voice browser contract: PASS");
} finally {
  await browser.close();
}
