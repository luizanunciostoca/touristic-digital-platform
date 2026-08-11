from pathlib import Path

index_path = Path('packages/auth-browser/src/index.ts')
text = index_path.read_text()

session_interface = '''export interface DashboardSessionResponse {
  readonly authenticated: true;
  readonly csrfToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly role: AuthRole;
    readonly businessIds: readonly string[];
  };
}
'''
login_interfaces = session_interface + '''
export interface DashboardLoginCredentials {
  readonly email: string;
  readonly password: string;
}
'''
if session_interface not in text:
    raise SystemExit('session interface anchor missing')
text = text.replace(session_interface, login_interfaces, 1)

client_interface = '''export interface DashboardAuthClient {
  readonly getSession: (
    force?: boolean,
  ) => Promise<DashboardSessionResponse | null>;
  readonly secureFetch: (
'''
client_replacement = '''export interface DashboardAuthClient {
  readonly login: (
    credentials: DashboardLoginCredentials,
  ) => Promise<DashboardSessionResponse>;
  readonly getSession: (
    force?: boolean,
  ) => Promise<DashboardSessionResponse | null>;
  readonly secureFetch: (
'''
if client_interface not in text:
    raise SystemExit('client interface anchor missing')
text = text.replace(client_interface, client_replacement, 1)

get_session_anchor = '''  async function getSession(
    force = false,
  ): Promise<DashboardSessionResponse | null> {
'''
login_method = '''  async function login(
    credentials: DashboardLoginCredentials,
  ): Promise<DashboardSessionResponse> {
    const response = await fetchFn("/api/dashboard/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as Partial<
      DashboardSessionResponse & { message: string }
    >;
    if (!response.ok || data.authenticated !== true || !data.csrfToken) {
      csrfToken = "";
      sessionPromise = null;
      storage.removeItem(csrfStorageKey);
      throw new Error(
        typeof data.message === "string" && data.message.trim()
          ? data.message
          : "Não foi possível entrar.",
      );
    }

    const session = data as DashboardSessionResponse;
    csrfToken = session.csrfToken;
    storage.setItem(csrfStorageKey, csrfToken);
    sessionPromise = Promise.resolve(session);
    return session;
  }

''' + get_session_anchor
if get_session_anchor not in text:
    raise SystemExit('getSession anchor missing')
text = text.replace(get_session_anchor, login_method, 1)

return_anchor = '''  return Object.freeze({ getSession, secureFetch, logout });
'''
return_replacement = '''  return Object.freeze({ login, getSession, secureFetch, logout });
'''
if return_anchor not in text:
    raise SystemExit('return anchor missing')
text = text.replace(return_anchor, return_replacement, 1)
index_path.write_text(text)

test_path = Path('packages/auth-browser/src/index.test.ts')
tests = test_path.read_text()
describe_anchor = '''describe("M48 browser auth adapter", () => {
'''
addition = describe_anchor + '''  it("logs in through the same-origin Auth boundary and caches the safe session projection", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(sessionResponse("csrf-login"));
    const storage = storageFixture();
    const location = locationFixture("/dashboard/login.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    const session = await client.login({
      email: "owner@example.com",
      password: "secret",
    });
    const cached = await client.getSession();

    expect(session.user.email).toBe("owner@example.com");
    expect(cached).toBe(session);
    expect(storage.values.get("md_dashboard_csrf")).toBe("csrf-login");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("/api/dashboard/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "owner@example.com", password: "secret" }),
    });
  });

  it("fails login without retaining stale browser CSRF state", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "E-mail ou senha inválidos." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const storage = storageFixture({ md_dashboard_csrf: "stale" });
    const location = locationFixture("/dashboard/login.html");
    const client = createDashboardAuthClient({
      fetchFn,
      storage: storage.port,
      location: location.port,
    });

    await expect(
      client.login({ email: "owner@example.com", password: "wrong" }),
    ).rejects.toThrow("E-mail ou senha inválidos.");
    expect(storage.values.has("md_dashboard_csrf")).toBe(false);
  });

'''
if describe_anchor not in tests:
    raise SystemExit('test describe anchor missing')
tests = tests.replace(describe_anchor, addition, 1)
test_path.write_text(tests)

dashboard_test_path = Path('apps/morro-digital-platform/src/business-dashboard-client.test.ts')
dashboard_tests = dashboard_test_path.read_text()
auth_fixture_anchor = '''  const authClient: DashboardAuthClient = {
    getSession: vi.fn().mockResolvedValue(sessionValue),
    secureFetch,
    logout: vi.fn().mockResolvedValue(true),
  };
'''
auth_fixture_replacement = '''  const authClient: DashboardAuthClient = {
    login: vi.fn().mockRejectedValue(new Error("NOT_USED_IN_DASHBOARD_CLIENT")),
    getSession: vi.fn().mockResolvedValue(sessionValue),
    secureFetch,
    logout: vi.fn().mockResolvedValue(true),
  };
'''
if auth_fixture_anchor not in dashboard_tests:
    raise SystemExit('dashboard auth fixture anchor missing')
dashboard_tests = dashboard_tests.replace(
    auth_fixture_anchor,
    auth_fixture_replacement,
    1,
)
dashboard_test_path.write_text(dashboard_tests)
