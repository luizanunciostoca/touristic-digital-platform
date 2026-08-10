import {
  createAssistantMessagePipeline,
  type AssistantMessageArea,
  type AssistantMessageInput,
  type AssistantMessageRecord,
} from "@touristic/assistant";

import { sanitizeAssistantRenderableHtml } from "./assistant-dom-view.js";

export interface AssistantMessageDomOptions {
  readonly document: Document;
  readonly now?: () => number;
}

export interface AssistantMessageDom {
  append(input: AssistantMessageInput): AssistantMessageRecord | null;
  clear(
    area?: AssistantMessageArea,
    predicate?: (message: AssistantMessageRecord) => boolean,
  ): number;
}

function getOrCreateArea(
  document: Document,
  area: AssistantMessageArea,
): HTMLElement | null {
  const assistant = document.getElementById("assistant-messages");
  if (!assistant) return null;

  const className =
    area === "navigation" ? "navigation-instruction-area" : "messages-area";
  const existing = assistant.querySelector<HTMLElement>(`.${className}`);
  if (existing) return existing;

  const container = document.createElement("div");
  container.className = className;

  if (area === "navigation") {
    const messagesArea = assistant.querySelector(".messages-area");
    if (messagesArea?.nextSibling) {
      assistant.insertBefore(container, messagesArea.nextSibling);
    } else {
      assistant.appendChild(container);
    }
  } else {
    const navigationArea = assistant.querySelector(".navigation-instruction-area");
    if (navigationArea) {
      assistant.insertBefore(container, navigationArea);
    } else {
      assistant.appendChild(container);
    }
  }

  return container;
}

function renderRecord(
  document: Document,
  record: AssistantMessageRecord,
): HTMLElement | null {
  const container = getOrCreateArea(document, record.area);
  if (!container) return null;

  const message = document.createElement("div");
  message.classList.add("message", record.sender);
  message.classList.add(
    record.area === "navigation" ? "navigation" : "assistant",
  );
  if (record.customClass) message.classList.add(record.customClass);
  if (record.id) message.id = record.id;
  message.dataset.messageType = record.messageType;
  message.innerHTML = record.html;
  container.appendChild(message);
  container.scrollTop = container.scrollHeight;
  return message;
}

export function createAssistantMessageDom(
  options: AssistantMessageDomOptions,
): AssistantMessageDom {
  const pipeline = createAssistantMessagePipeline({
    sanitize: sanitizeAssistantRenderableHtml,
    ...(options.now ? { now: options.now } : {}),
  });

  return Object.freeze({
    append(input: AssistantMessageInput): AssistantMessageRecord | null {
      const record = pipeline.append({
        ...input,
        navigationActive:
          input.navigationActive ??
          options.document.body.classList.contains("navigation-active"),
      });
      if (!record) return null;

      const container = getOrCreateArea(options.document, record.area);
      if (!container) return null;
      if (input.clear) container.replaceChildren();
      renderRecord(options.document, record);
      return record;
    },

    clear(
      area: AssistantMessageArea = "messages",
      predicate?: (message: AssistantMessageRecord) => boolean,
    ): number {
      const existing = pipeline.getMessages(area);
      const removed = pipeline.clear(area, predicate);
      const container = getOrCreateArea(options.document, area);
      if (!container || removed === 0) return removed;

      if (!predicate) {
        container.replaceChildren();
        return removed;
      }

      const retained = existing.filter((message) => !predicate(message));
      container.replaceChildren();
      for (const record of retained) renderRecord(options.document, record);
      return removed;
    },
  });
}
