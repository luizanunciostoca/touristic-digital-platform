import {
  assistantVoiceLocale,
  type AssistantVoiceLanguage,
} from "@touristic/assistant";

interface SpeechRecognitionAlternativeLike {
  readonly transcript?: unknown;
  readonly confidence?: unknown;
}

interface SpeechRecognitionResultLike {
  readonly 0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly results?: {
    readonly length?: number;
    readonly 0?: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  readonly error?: unknown;
}

export interface AssistantSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface AssistantSpeechRecognitionConstructor {
  new (): AssistantSpeechRecognitionInstance;
}

export interface AssistantBrowserVoiceInputOptions {
  readonly Recognition: AssistantSpeechRecognitionConstructor;
  readonly language: AssistantVoiceLanguage;
  readonly onResult: (transcript: string, confidence: number | null) => void;
  readonly onError?: (error: string) => void;
  readonly onListeningChange?: (listening: boolean) => void;
}

export interface AssistantBrowserVoiceInput {
  start(): boolean;
  stop(): boolean;
  setLanguage(language: AssistantVoiceLanguage): void;
  isListening(): boolean;
  destroy(): void;
}

function finiteConfidence(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function errorName(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "unknown";
}

export function createAssistantBrowserVoiceInput(
  options: AssistantBrowserVoiceInputOptions,
): AssistantBrowserVoiceInput {
  const recognition = new options.Recognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = assistantVoiceLocale(options.language);

  let listening = false;
  let destroyed = false;

  const setListening = (value: boolean): void => {
    if (listening === value) return;
    listening = value;
    options.onListeningChange?.(value);
  };

  recognition.onresult = (event): void => {
    const alternative = event.results?.[0]?.[0];
    const transcript =
      typeof alternative?.transcript === "string"
        ? alternative.transcript.trim()
        : "";
    if (!transcript) return;
    options.onResult(transcript, finiteConfidence(alternative?.confidence));
  };

  recognition.onerror = (event): void => {
    setListening(false);
    options.onError?.(errorName(event.error));
  };

  recognition.onend = (): void => {
    setListening(false);
  };

  return Object.freeze({
    start(): boolean {
      if (destroyed || listening) return false;
      try {
        recognition.start();
        setListening(true);
        return true;
      } catch {
        setListening(false);
        options.onError?.("start_failed");
        return false;
      }
    },
    stop(): boolean {
      if (destroyed || !listening) return false;
      try {
        recognition.stop();
        setListening(false);
        return true;
      } catch {
        setListening(false);
        options.onError?.("stop_failed");
        return false;
      }
    },
    setLanguage(language: AssistantVoiceLanguage): void {
      recognition.lang = assistantVoiceLocale(language);
    },
    isListening(): boolean {
      return listening;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (listening) {
        try {
          recognition.stop();
        } catch {
          // Recognition shutdown is best-effort during runtime disposal.
        }
      }
      setListening(false);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    },
  });
}

export function resolveAssistantSpeechRecognitionConstructor(
  view: Window,
): AssistantSpeechRecognitionConstructor | null {
  const candidate = view as Window & {
    readonly SpeechRecognition?: AssistantSpeechRecognitionConstructor;
    readonly webkitSpeechRecognition?: AssistantSpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}
