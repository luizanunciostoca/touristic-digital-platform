/** P03: canonical owner presentation only, retains approved peek/half/full geometry. */
export const PLACE_SHEET_STATES = Object.freeze(["peek", "half", "full"]);
const escapeText = (value) => (typeof value === "string" ? value.trim() : "");
export function labelCategory(categoryId, locale, dict = {}) {
  const value = dict?.[locale]?.[categoryId] ?? dict?.["pt-BR"]?.[categoryId];
  return value?.trim() || categoryId || "Categoria não informada";
}
export function presentCanonicalPlace(
  detail,
  { locale = "pt-BR", categoryLabels = {}, capabilities = {} } = {},
) {
  if (!detail?.profile?.id || !detail?.profile?.name)
    return Object.freeze({
      status: "unavailable",
      notice: "Dados deste local indisponíveis.",
      actions: [],
      media: [],
      sheetState: "half",
    });
  const p = detail.profile,
    missing = Object.entries(detail.partial ?? {})
      .filter(([, state]) => state === "unavailable")
      .map(([part]) => part);
  const media = [
    detail.media?.coverImage,
    ...(detail.media?.gallery ?? []),
  ].filter(
    (img) =>
      img &&
      typeof img.providerReference === "string" &&
      /^(https:\/\/|\/)/.test(img.providerReference),
  );
  const rawActions = [
    detail.actions?.primaryAction,
    ...(detail.actions?.secondaryActions ?? []),
  ].filter(Boolean);
  const actions = rawActions.map((a) => {
    const allowed = Boolean(
      capabilities[a.id]?.ownerVerified === true &&
      capabilities[a.id]?.enabled === true,
    );
    return Object.freeze({
      id: a.id,
      label: a.label,
      disabled: a.disabled === true || !allowed,
      reason: !allowed
        ? "Ação aguardando contrato/autorização do serviço responsável."
        : null,
      value: allowed ? a.value : null,
    });
  });
  return Object.freeze({
    placeId: p.id,
    name: escapeText(p.name),
    category: labelCategory(p.categoryId, locale, categoryLabels),
    area: escapeText(p.location?.area ?? p.location?.address),
    description: escapeText(p.description ?? p.shortDescription),
    status: missing.length ? "partial" : "ready",
    missing: Object.freeze(missing),
    notice: missing.length
      ? `Informações temporariamente indisponíveis: ${missing.join(", ")}.`
      : "",
    media: Object.freeze(media),
    actions: Object.freeze(actions),
    sheetState: "half",
    supportedSheetStates: PLACE_SHEET_STATES,
    rating:
      typeof p.rating === "number" && p.ratingVerified === true
        ? p.rating
        : null,
  });
}
export function placeSheetTransition(current, action) {
  const i = PLACE_SHEET_STATES.indexOf(current);
  if (i < 0) throw new Error("INVALID_SHEET_STATE");
  if (action === "expand") return PLACE_SHEET_STATES[Math.min(i + 1, 2)];
  if (action === "collapse") return PLACE_SHEET_STATES[Math.max(i - 1, 0)];
  if (action === "restore") return current;
  throw new Error("INVALID_SHEET_ACTION");
}
