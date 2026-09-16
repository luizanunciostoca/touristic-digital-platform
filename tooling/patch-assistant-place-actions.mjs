import { readFile, writeFile } from "node:fs/promises";

const runtimePath =
  "apps/morro-digital-platform/src/assistant/browser-assistant-runtime.ts";

let source = await readFile(runtimePath, "utf8");

const importAnchor =
  'import { createAssistantV1IntelligenceHandlers } from "./assistant-v1-intelligence-adapter.js";\n';
const placeActionImport =
  'import { resolveAssistantV1PlaceAction } from "./assistant-v1-place-action-adapter.js";\n';

if (!source.includes(placeActionImport)) {
  if (!source.includes(importAnchor)) {
    throw new Error("assistant V1 intelligence import anchor not found");
  }
  source = source.replace(importAnchor, `${importAnchor}${placeActionImport}`);
}

const generationAnchor = "    const generation = ++requestGeneration;\n";
const placeActionBlock = `    const placeActionContext = context.getContext();
    const placeAction = resolveAssistantV1PlaceAction({
      input: value,
      lastPlace: placeActionContext.lastPlace,
      lastCategory: placeActionContext.lastCategory,
      language: voiceLanguage(),
    });

    if (placeAction) {
      if (destroyed || generation !== requestGeneration) {
        return supersededResponse();
      }

      clearAssistantDomOptions(options.document);
      removePhotoPresentation(options.document);
      appendStandardMessage("user", submittedValue);

      const response = placeAction.response;
      appendStandardMessage("assistant", response.text);
      const responseOptions = readAssistantResponseOptions(response);
      if (responseOptions.length > 0) {
        renderAssistantDomOptions(options.document, responseOptions);
      }
      currentPresentation = snapshotPresentation(response.text, responseOptions);

      const interestCategory = toProfileInterestCategory(placeAction.category);
      profile.recordInteraction(submittedValue, interestCategory, {
        name: placeAction.place.name,
        category: placeAction.category,
      });

      if (placeAction.navigationDestination) {
        context.updateContext({
          lastIntent: "navigate",
          lastPlace: placeAction.place.name,
          lastCategory: placeAction.category,
          awaiting: { type: "confirmar_navegacao", intent: "navigate" },
          pendingRoute: placeAction.navigationDestination,
          selectedDestination: placeAction.navigationDestination,
        });
      } else {
        context.updateContext({
          lastIntent: "place_action",
          lastPlace: placeAction.place.name,
          lastCategory: placeAction.category,
          awaiting: null,
          ...(placeActionContext.awaiting?.type === "confirmar_navegacao"
            ? { pendingRoute: null, selectedDestination: null }
            : {}),
        });
      }
      context.addToHistory({ input: submittedValue, response: response.text });

      options.document.dispatchEvent(
        new CustomEvent("morro:assistant-place-action-routed", {
          detail: {
            action: response.metadata?.action ?? null,
            place: placeAction.place.name,
            category: placeAction.category,
            source,
          },
        }),
      );
      voice?.speak(response.text, voiceLanguage());
      return response;
    }
`;

if (!source.includes("resolveAssistantV1PlaceAction({\n      input: value,")) {
  if (!source.includes(generationAnchor)) {
    throw new Error("assistant generation anchor not found");
  }
  source = source.replace(
    generationAnchor,
    `${generationAnchor}${placeActionBlock}`,
  );
}

await writeFile(runtimePath, source);
