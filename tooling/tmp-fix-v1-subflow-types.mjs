import { readFile, writeFile } from "node:fs/promises";

const flowPath = "apps/morro-digital-platform/src/map/explore-locations-v1-flow.ts";
const controlPath = "apps/morro-digital-platform/src/map/explore-locations-control.ts";

let flow = await readFile(flowPath, "utf8");
const flowStart = `const SUBCATEGORY_OPTIONS: Readonly<\n  Record<string, readonly V1ExploreOption[]>\n> = Object.freeze({`;
if (!flow.includes(flowStart)) throw new Error("subcategory declaration not found");
flow = flow.replace(flowStart, "const SUBCATEGORY_OPTIONS = Object.freeze({");
const flowEnd = `  }),\n});\n\nexport function getV1ExploreSubcategoryOptions`;
if (!flow.includes(flowEnd)) throw new Error("subcategory closing marker not found");
flow = flow.replace(
  flowEnd,
  `  }),\n} as const) satisfies Readonly<Record<string, readonly V1ExploreOption[]>>;\n\nexport function getV1ExploreSubcategoryOptions`,
);
await writeFile(flowPath, flow);

let control = await readFile(controlPath, "utf8");
const renderStart = `  const renderFlow = (\n    text: string,\n    options: readonly Readonly<{\n      label: string;\n      value: string;\n      action?: string;\n      location?: MorroV1SearchCatalogItem;\n      tourId?: string;\n    }>[],\n    onSelect: (option: (typeof options)[number]) => void,\n  ): HTMLButtonElement | null => {`;
if (!control.includes(renderStart)) throw new Error("renderFlow declaration not found");
control = control.replace(
  renderStart,
  `  const renderFlow = <\n    T extends Readonly<{\n      label: string;\n      value: string;\n      action?: string;\n      location?: MorroV1SearchCatalogItem;\n      tourId?: string;\n    }>,\n  >(\n    text: string,\n    options: readonly T[],\n    onSelect: (option: T) => void,\n  ): HTMLButtonElement | null => {`,
);
await writeFile(controlPath, control);
