import { readFile, writeFile } from "node:fs/promises";

const shellPath = "apps/morro-digital-platform/src/layouts/app-shell.ts";
let shell = await readFile(shellPath, "utf8");
const oldControl = `      <div id="globe-map-control" class="globe-map-control">
        <button
          type="button"
          id="toggle-globe-view"
          class="map-control-button"
          title="Toggle global map view"
          aria-label="Toggle global map view"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21"></path>
          </svg>
          <span class="control-tooltip">Global view</span>
        </button>
      </div>`;
const newControl = `      <div id="globe-map-control" class="globe-map-control unified-map-controls">
        <button
          type="button"
          id="toggle-3d-mode"
          class="map-control-button"
          title="Alternar perspectiva 3D"
          aria-label="Alternar perspectiva 3D"
          aria-pressed="false"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3 4.5 7.2 12 11.4l7.5-4.2L12 3Z"></path>
            <path d="m4.5 7.2 7.5 4.2 7.5-4.2v9.6L12 21l-7.5-4.2V7.2Z"></path>
            <path d="M12 11.4V21"></path>
          </svg>
          <span class="control-tooltip">Visão 3D</span>
        </button>
        <button
          type="button"
          id="toggle-globe-view"
          class="map-control-button"
          title="Toggle global map view"
          aria-label="Toggle global map view"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21"></path>
          </svg>
          <span class="control-tooltip">Global view</span>
        </button>
      </div>`;
if (!shell.includes(oldControl)) throw new Error("app shell map control block not found");
shell = shell.replace(oldControl, newControl);
await writeFile(shellPath, shell);

const entryPath = "apps/morro-digital-platform/src/browser-entry.ts";
let entry = await readFile(entryPath, "utf8");
const importNeedle = `import {
  installGlobalViewControl,
  type GlobalViewControl,
} from "./map/global-view-control.js";`;
const importReplacement = `${importNeedle}
import {
  installThreeDimensionalMapControl,
  type ThreeDimensionalMapControl,
} from "./map/three-dimensional-map-control.js";`;
if (!entry.includes(importNeedle)) throw new Error("global control import not found");
entry = entry.replace(importNeedle, importReplacement);
entry = entry.replace(
  `let activeGlobalViewControl: GlobalViewControl | undefined;`,
  `let activeGlobalViewControl: GlobalViewControl | undefined;\nlet activeThreeDimensionalMapControl: ThreeDimensionalMapControl | undefined;`,
);
entry = entry.replace(
  `function clearBrowserNavigationRuntime(): void {\n  activeGlobalViewControl?.destroy();`,
  `function clearBrowserNavigationRuntime(): void {\n  activeThreeDimensionalMapControl?.destroy();\n  activeThreeDimensionalMapControl = undefined;\n  activeGlobalViewControl?.destroy();`,
);
const wiringNeedle = `              activeGlobalViewControl = installGlobalViewControl({
                document,
                map,`;
const wiringReplacement = `              activeThreeDimensionalMapControl =
                installThreeDimensionalMapControl({ document, map });
              activeGlobalViewControl = installGlobalViewControl({
                document,
                map,`;
if (!entry.includes(wiringNeedle)) throw new Error("map control wiring point not found");
entry = entry.replace(wiringNeedle, wiringReplacement);
await writeFile(entryPath, entry);
