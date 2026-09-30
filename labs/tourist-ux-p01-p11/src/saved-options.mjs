/** P08: BOTH comparison options, no unapproved choice, one canonical read-only provider. */
export const SAVED_OPTIONS = Object.freeze({
  A: Object.freeze({
    id: "assistant",
    title: "Salvos no Assistant",
    surface: "#unified-assistant-dock",
    newRoute: false,
  }),
  B: Object.freeze({
    id: "home-panel",
    title: "Painel dedicado na Home",
    surface: "#home-saved-panel",
    newRoute: false,
  }),
});
export async function loadSaved(readOnlyProvider, { option = "A" } = {}) {
  if (!(option in SAVED_OPTIONS)) throw new Error("USER_CHOICE_REQUIRED");
  if (!readOnlyProvider || typeof readOnlyProvider.list !== "function")
    return Object.freeze({
      status: "unavailable",
      items: [],
      option,
      warning: "Fonte canônica de favoritos ainda não vinculada.",
    });
  try {
    const response = await readOnlyProvider.list();
    if (!Array.isArray(response?.items))
      throw new Error("INVALID_SAVED_PROJECTION");
    const valid = response.items.filter(
      (x) => typeof x?.placeId === "string" && typeof x?.name === "string",
    );
    return Object.freeze({
      status: valid.length ? "ready" : "empty",
      items: Object.freeze(
        valid.map((x) =>
          Object.freeze({
            placeId: x.placeId,
            name: x.name,
            category: x.category ?? null,
          }),
        ),
      ),
      option,
      ownerVerified: response.ownerVerified === true,
    });
  } catch {
    return Object.freeze({
      status: "error",
      items: [],
      option,
      warning:
        "Não foi possível consultar favoritos; seus dados não foram alterados.",
    });
  }
}
export function decideSavedIntegration(
  selection,
  { explicitUserDecision = false } = {},
) {
  if (!explicitUserDecision || !(selection in SAVED_OPTIONS))
    return Object.freeze({ state: "PENDING_VISUAL_CHOICE", selected: null });
  return Object.freeze({
    state: "APPROVED_OPTION",
    selected: SAVED_OPTIONS[selection],
  });
}
