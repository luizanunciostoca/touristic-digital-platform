/** Approved P01-P11 non-production isolation boundary. No global runtime side effects. */
export const APPROVED_IDS = Object.freeze(
  Array.from(
    { length: 11 },
    (_, index) => `P${String(index + 1).padStart(2, "0")}`,
  ),
);
export const ISOLATION_FLAGS = Object.freeze(
  Object.fromEntries(APPROVED_IDS.map((id) => [id, false])),
);
export const OWNER_CAPABILITIES = Object.freeze({
  ticketed_admission: "Ticketing",
  activity_reservation: "Commerce",
  table_reservation: "Ordering",
  transport_ticket: "Commerce",
});

export function createPreviewAuthority({
  mode = "isolated",
  flags = ISOLATION_FLAGS,
  owners = {},
} = {}) {
  if (mode !== "isolated") throw new Error("PREVIEW_ONLY_FAIL_CLOSED");
  return Object.freeze({
    mode,
    flags: Object.freeze({
      ...ISOLATION_FLAGS,
      ...Object.fromEntries(
        Object.entries(flags).filter(([id]) => APPROVED_IDS.includes(id)),
      ),
    }),
    owners: Object.freeze({ ...owners }),
    canPreview(id) {
      return Boolean(this.flags[id] === true);
    },
    canMutate() {
      return false;
    },
    assertOwner(owner) {
      return this.owners[owner]?.verified === true;
    },
    label: "PREVIEW ISOLADO — NÃO INTEGRADO, SEM EFEITOS EXTERNOS",
  });
}

export function assertReadOnly(operation) {
  if (String(operation).toUpperCase() !== "GET")
    throw new Error("OWNER_MUTATION_BLOCKED_IN_ISOLATED_LAB");
}
