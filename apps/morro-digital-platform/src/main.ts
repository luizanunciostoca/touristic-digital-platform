import { mountAppShell } from "./layouts/app-shell.js";

export function bootstrapMorroDigitalApplication(document: Document): void {
  mountAppShell({ document });
}
