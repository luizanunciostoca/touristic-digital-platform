export type AssistantMessageSender = "user" | "assistant";
export type AssistantMessageArea = "messages" | "navigation";
export type AssistantMessagePriority = "normal" | "high";

export interface AssistantMessageInput {
  sender: AssistantMessageSender;
  html: string;
  area?: AssistantMessageArea;
  clear?: boolean;
  avoidDuplicate?: boolean;
  priority?: AssistantMessagePriority;
  messageType?: string;
  id?: string;
  customClass?: string;
  speak?: boolean;
  navigationActive?: boolean;
}

export interface AssistantMessageRecord {
  sender: AssistantMessageSender;
  html: string;
  area: AssistantMessageArea;
  priority: AssistantMessagePriority;
  messageType: string;
  id?: string;
  customClass?: string;
  speak: boolean;
  timestamp: number;
}

export interface AssistantMessagePipelineOptions {
  sanitize: (html: string) => string;
  now?: () => number;
  duplicateWindowMs?: number;
}

const NAVIGATION_MESSAGE_PATTERNS = [
  "Navegação guiada iniciada",
  "Traçando rota até",
  "route to",
  "navigation started",
] as const;

function isNavigationStatusMessage(html: string): boolean {
  return NAVIGATION_MESSAGE_PATTERNS.some((pattern) => html.includes(pattern));
}

function isLanguageChangeMessage(html: string, messageType: string): boolean {
  return (
    messageType === "language_change" ||
    html.includes("Idioma do assistente alterado para") ||
    html.includes("Assistant language changed to") ||
    html.includes("Idioma del asistente cambiado") ||
    html.includes("Parabéns! Idioma alterado")
  );
}

export function createAssistantMessagePipeline(
  options: AssistantMessagePipelineOptions,
) {
  const now = options.now ?? Date.now;
  const duplicateWindowMs = options.duplicateWindowMs ?? 2000;
  const messages: Record<AssistantMessageArea, AssistantMessageRecord[]> = {
    messages: [],
    navigation: [],
  };
  let lastMessageSent = { html: "", timestamp: 0 };

  return {
    append(input: AssistantMessageInput): AssistantMessageRecord | null {
      const area = input.area ?? "messages";
      const avoidDuplicate = input.avoidDuplicate ?? true;
      const priority = input.priority ?? "normal";
      const messageType = input.messageType ?? "standard";
      const timestamp = now();

      if (
        area === "messages" &&
        input.navigationActive &&
        isNavigationStatusMessage(input.html)
      ) {
        return null;
      }

      if (
        avoidDuplicate &&
        priority !== "high" &&
        input.html === lastMessageSent.html &&
        timestamp - lastMessageSent.timestamp < duplicateWindowMs
      ) {
        return null;
      }

      const areaMessages = messages[area];
      const previous = areaMessages.at(-1);
      if (
        avoidDuplicate &&
        priority !== "high" &&
        previous?.html === input.html
      ) {
        return null;
      }

      const sanitized = options.sanitize(input.html);
      const record: AssistantMessageRecord = {
        sender: input.sender,
        html: sanitized,
        area,
        priority,
        messageType,
        speak:
          input.sender === "assistant" &&
          (input.speak ?? true) &&
          !isLanguageChangeMessage(input.html, messageType),
        timestamp,
        ...(input.id ? { id: input.id } : {}),
        ...(input.customClass ? { customClass: input.customClass } : {}),
      };

      if (input.clear) messages[area] = [];
      messages[area].push(record);
      if (avoidDuplicate) lastMessageSent = { html: input.html, timestamp };
      return structuredClone(record);
    },

    clear(
      area: AssistantMessageArea = "messages",
      predicate?: (message: AssistantMessageRecord) => boolean,
    ): number {
      if (!predicate) {
        const count = messages[area].length;
        messages[area] = [];
        return count;
      }

      const before = messages[area].length;
      messages[area] = messages[area].filter((message) => !predicate(message));
      return before - messages[area].length;
    },

    getMessages(area: AssistantMessageArea = "messages"): AssistantMessageRecord[] {
      return structuredClone(messages[area]);
    },
  };
}
