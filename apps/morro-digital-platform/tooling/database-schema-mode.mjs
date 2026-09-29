export function shouldApplyRuntimeSchema(environment = process.env) {
  const mode = String(environment.MORRO_DATABASE_SCHEMA_MODE ?? "")
    .trim()
    .toLowerCase();

  if (!mode || mode === "apply") return true;
  if (mode === "external") return false;

  throw new Error("MORRO_DATABASE_SCHEMA_MODE_INVALID");
}
