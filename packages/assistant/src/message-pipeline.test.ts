import { describe, expect, it, vi } from "vitest";

import { createAssistantMessagePipeline } from "./message-pipeline.js";

describe("assistant V1 message pipeline", () => {
  it("sanitizes every message before it enters the message state", () => {
    const sanitize = vi.fn((html: string) => html.replace(/<script.*?<\/script>/g, ""));
    const pipeline = createAssistantMessagePipeline({ sanitize, now: () => 1000 });

    const result = pipeline.append({
      sender: "assistant",
      html: "Olá<script>alert(1)</script>",
    });

    expect(sanitize).toHaveBeenCalledOnce();
    expect(result?.html).toBe("Olá");
    expect(pipeline.getMessages()).toHaveLength(1);
  });

  it("suppresses duplicate normal-priority messages inside the V1 two-second window", () => {
    let now = 1000;
    const pipeline = createAssistantMessagePipeline({
      sanitize: (html) => html,
      now: () => now,
    });

    expect(pipeline.append({ sender: "assistant", html: "mesma" })).not.toBeNull();
    now = 2500;
    expect(pipeline.append({ sender: "assistant", html: "mesma" })).toBeNull();
  });

  it("allows high-priority duplicates", () => {
    const pipeline = createAssistantMessagePipeline({
      sanitize: (html) => html,
      now: () => 1000,
    });

    pipeline.append({ sender: "assistant", html: "urgente" });
    expect(
      pipeline.append({
        sender: "assistant",
        html: "urgente",
        priority: "high",
      }),
    ).not.toBeNull();
  });

  it("keeps navigation instructions out of the normal message area while navigation is active", () => {
    const pipeline = createAssistantMessagePipeline({ sanitize: (html) => html });

    expect(
      pipeline.append({
        sender: "assistant",
        html: "Navegação guiada iniciada até o Farol",
        navigationActive: true,
      }),
    ).toBeNull();

    expect(
      pipeline.append({
        sender: "assistant",
        html: "Navegação guiada iniciada até o Farol",
        area: "navigation",
        navigationActive: true,
      }),
    ).not.toBeNull();
  });

  it("does not request speech for language-change messages", () => {
    const pipeline = createAssistantMessagePipeline({ sanitize: (html) => html });

    const result = pipeline.append({
      sender: "assistant",
      html: "Assistant language changed to English",
      messageType: "language_change",
    });

    expect(result?.speak).toBe(false);
  });

  it("clears all or selected messages per area", () => {
    const pipeline = createAssistantMessagePipeline({ sanitize: (html) => html });
    pipeline.append({ sender: "assistant", html: "a", id: "keep" });
    pipeline.append({ sender: "assistant", html: "b", id: "drop" });
    pipeline.append({ sender: "assistant", html: "nav", area: "navigation" });

    expect(pipeline.clear("messages", (message) => message.id === "drop")).toBe(1);
    expect(pipeline.getMessages("messages").map((message) => message.id)).toEqual([
      "keep",
    ]);
    expect(pipeline.clear("navigation")).toBe(1);
  });
});
