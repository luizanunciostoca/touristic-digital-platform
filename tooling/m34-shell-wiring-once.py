from pathlib import Path
import re

entry = Path("apps/morro-digital-platform/src/browser-entry.ts")
text = entry.read_text()

import_anchor = 'import { bootstrapMorroDigitalApplication } from "./main.js";\n'
import_line = 'import { installAssistantShellUi } from "./assistant/assistant-shell-ui.js";\n'
if import_line not in text:
    text = text.replace(import_anchor, import_anchor + import_line)

pattern = re.compile(
    r"function setupV1ShellInteractions\(\): void \{.*?\n\}\n\nsetupV1ShellInteractions\(\);",
    re.S,
)
replacement = '''function setupV1ShellInteractions(): void {
  installAssistantShellUi({ document });

  const globeButton = document.getElementById("toggle-globe-view");
  globeButton?.addEventListener("click", () => {
    const active = globeButton.classList.toggle("active");
    globeButton.setAttribute("aria-pressed", String(active));
  });

  document
    .querySelectorAll<HTMLButtonElement>(".assistant-option-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.value || button.textContent?.trim() || "";
        document.dispatchEvent(
          new CustomEvent("morro:assistant-option-selected", {
            detail: { value },
          }),
        );
      });
    });
}

setupV1ShellInteractions();'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit("setupV1ShellInteractions block not found")
entry.write_text(text)

shell = Path("apps/morro-digital-platform/src/layouts/app-shell.ts")
shell_text = shell.read_text()
old = '<div id="assistant-messages" class="assistant-modal auto-size grow-upward">'
new = '<div id="assistant-messages" class="assistant-modal auto-size grow-upward hidden" aria-hidden="true">'
if old not in shell_text:
    raise SystemExit("assistant shell markup anchor not found")
shell.write_text(shell_text.replace(old, new, 1))
