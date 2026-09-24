const databaseSchemas = Object.freeze({
  AUTH_DATABASE_URL: "morro_auth",
  CONTROL_CENTER_AUDIT_DATABASE_URL: "morro_audit",
  DESTINATIONS_DATABASE_URL: "morro_destinations",
  CONTENT_DATABASE_URL: "morro_content",
  ORDERING_DATABASE_URL: "morro_ordering",
  FINANCIAL_DATABASE_URL: "morro_financial",
  TICKETING_DATABASE_URL: "morro_ticketing",
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createDatabaseEnvironmentResolver({
  processEnvironment = process.env,
  localEnvironment = {},
} = {}) {
  function directValue(key) {
    return text(processEnvironment[key] ?? localEnvironment[key] ?? "");
  }

  function componentDatabaseUrl(key) {
    const schema = databaseSchemas[key];
    if (!schema) return "";

    const host = directValue("MORRO_DB_HOST");
    const port = directValue("MORRO_DB_PORT") || "3306";
    const user = directValue("MORRO_DB_USER");
    const password = directValue("MORRO_DB_PASSWORD");

    if (!host || !user || !password) return "";

    const url = new URL("mysql://placeholder.invalid/");
    url.hostname = host;
    url.port = port;
    url.username = user;
    url.password = password;
    url.pathname = `/${schema}`;
    return url.toString();
  }

  return (key) => directValue(key) || componentDatabaseUrl(key);
}

export { databaseSchemas };
