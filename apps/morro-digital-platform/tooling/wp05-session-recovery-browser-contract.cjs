const assert = require("node:assert/strict");

const origin = process.env.CONTROL_CENTER_ORIGIN || "http://127.0.0.1:4199";
const referralsApi = (url) =>
  url.origin === origin &&
  (url.pathname === "/api/crm/referrals" ||
    url.pathname.startsWith("/api/crm/referrals/"));
const portal =
  "/apps/morro-digital-platform/public/affiliate-portal.html?campaign=summer#links";
const session = {
  authenticated: true,
  csrfToken: "browser-fixture",
  user: {
    email: "affiliate@example.test",
    id: "fixture",
    role: "owner",
    businessIds: [],
  },
};
const projection = {
  affiliate: {
    affiliateId: "fixture",
    status: "active",
    identityVerified: true,
    contactVerified: true,
  },
  memberships: [],
  summaryByCurrency: [],
  attribution: { count: 0 },
  conversions: [],
  materializations: [],
  payoutAuthority: { note: "Fixture" },
};

async function run() {
  const { chromium } = require(
    process.env.PLAYWRIGHT_MODULE || "/tmp/pw/node_modules/playwright",
  );
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    args: ["--disable-gpu"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let status = 401;
    let disabled = false;
    let authenticatedReads = 0;
    await page.route("**/api/dashboard/auth/session", (r) =>
      r.fulfill({
        status,
        json: status === 200 ? session : { error: "SESSION_UNAVAILABLE" },
      }),
    );
    await page.route("**/api/dashboard/auth/login", async (r) => {
      assert.equal(r.request().method(), "POST");
      status = 200;
      await r.fulfill({ json: session });
    });
    await page.route("**/api/affiliates/v1/me", (r) => {
      authenticatedReads++;
      return r.fulfill(
        disabled
          ? { status: 503, json: { error: "AFFILIATES_RUNTIME_DISABLED" } }
          : { json: projection },
      );
    });
    await page.goto(origin + portal);
    const login = page.getByRole("link", { name: "Entrar", exact: true });
    await login.waitFor();
    assert.equal(authenticatedReads, 0);
    await login.click();
    assert.equal(new URL(page.url()).searchParams.get("return"), portal);
    await page.locator("#email").fill(session.user.email);
    await page.locator("#password").fill("browser-fixture");
    await page.locator("#submit").click();
    await page.locator("#affiliate-content").waitFor();
    assert.equal(page.url(), origin + portal);
    assert.equal(
      await page.locator("#affiliate-user").textContent(),
      session.user.email,
    );
    disabled = true;
    await page.reload();
    await page
      .getByText(
        "O portal de afiliados ainda não foi habilitado neste ambiente.",
      )
      .waitFor();
    assert.equal(await page.locator("#affiliate-content").isVisible(), false);
    assert.equal(await page.locator("#affiliate-loading").isVisible(), false);
    disabled = false;
    status = 503;
    await page.reload();
    const retry = page.getByRole("button", { name: "Tentar novamente" });
    await retry.waitFor();
    assert.equal(await login.count(), 0);
    status = 200;
    await retry.click();
    await page.locator("#affiliate-content").waitFor();
    for (const [surface, failure] of [
      ["trials", 429],
      ["referrals", 500],
    ]) {
      const dest =
        "/apps/admin-crm/public/" + surface + ".html?campaign=summer";
      await page.route("**/api/crm/" + surface, (r) =>
        r.fulfill({ json: { data: [] } }),
      );
      status = failure;
      await page.goto(origin + dest);
      await retry.waitFor();
      assert.equal(page.url(), origin + dest);
      const draftInput = page.locator(
        surface === "trials" ? '[name="leadId"]' : '[name="referrerLeadId"]',
      );
      await draftInput.fill("42");
      status = 200;
      await retry.click();
      await page
        .getByText("Sessão autenticada. Lifecycle operacional.")
        .waitFor();
      assert.equal(page.url(), origin + dest);
      assert.equal(await draftInput.inputValue(), "42");
      status = 401;
      await page.reload();
      await page.waitForURL((u) => u.pathname === "/dashboard/login.html");
      assert.equal(new URL(page.url()).searchParams.get("return"), dest);
    }
    status = 200;
    await verifyReferralMutationRecovery(page);
    await verifyReferralConcurrency(page);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: affiliate login and return, unavailable affiliation runtime, transient recovery, CRM session expiry and confirmed referral writes with read-only refresh recovery",
    );
  } finally {
    await browser.close();
  }
}

async function verifyReferralMutationRecovery(page) {
  let state;
  const route = async (requestRoute) => {
    const request = requestRoute.request();
    if (request.method() === "POST") {
      state.writes++;
      state.confirmed = true;
      if (state.operation === "create") {
        state.items.push({ id: 8, status: "pending", referredLeadId: null });
      } else if (state.operation === "link-lead") {
        state.items[0].referredLeadId = 42;
      } else {
        state.items[0].status = {
          contact: "contacted",
          convert: "converted",
          lose: "lost",
        }[state.operation];
      }
      await requestRoute.fulfill({ json: { success: true } });
    } else if (state.confirmed) {
      state.refreshes++;
      await requestRoute.fulfill(
        state.failRead
          ? { status: 500, json: { error: "FIXTURE_REFRESH_FAILED" } }
          : { json: { data: state.items } },
      );
    } else {
      await requestRoute.fulfill({ json: { data: state.items } });
    }
  };
  await page.route(referralsApi, route);
  for (const operation of [
    "create",
    "contact",
    "convert",
    "lose",
    "link-lead",
  ]) {
    state = {
      operation,
      writes: 0,
      refreshes: 0,
      confirmed: false,
      failRead: true,
      items: [{ id: 7, status: "pending", referredLeadId: null }],
    };
    await page.goto(origin + "/apps/admin-crm/public/referrals.html");
    await page.getByText("Registro #7", { exact: true }).waitFor();
    if (operation === "create") {
      await page.locator('[name="referrerLeadId"]').fill("42");
      await page.locator('[name="referredName"]').fill("Browser fixture");
      await page.locator("#referral-create-submit").click();
    } else if (operation === "link-lead") {
      await page.locator('[name="referredLeadId"]').fill("42");
      await page
        .locator('form[data-referral-link-form] button[type="submit"]')
        .click();
    } else {
      await page.locator(`button[data-referral-action="${operation}"]`).click();
    }
    const target = page.locator(
      operation === "create" ? "#referral-create-status" : "#referrals-status",
    );
    const retry = page.locator("#referrals-recovery").getByRole("button", {
      name: "Atualizar lista",
      exact: true,
    });
    const confirmation =
      operation === "create"
        ? /Salvo\./
        : operation === "link-lead"
          ? /Lead vinculado\./
          : /Indicação atualizada\./;
    await retry.waitFor();
    const retryBox = await retry.boundingBox();
    assert.ok(
      retryBox && retryBox.height >= 44 && retryBox.width >= 44,
      `${operation}: refresh target must be at least 44 by 44 CSS pixels`,
    );
    assert.match(await target.textContent(), confirmation);
    assert.match(
      await page.locator("#referrals-recovery").textContent(),
      /Não foi possível atualizar a lista/,
    );
    assert.equal(state.writes, 1);
    assert.equal(state.refreshes, 1);
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/crm/referrals") &&
          response.request().method() === "GET" &&
          response.status() === 500,
      ),
      retry.click(),
    ]);
    await retry.waitFor();
    assert.equal(state.writes, 1);
    assert.equal(state.refreshes, 2);
    state.failRead = false;
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/crm/referrals") &&
          response.request().method() === "GET" &&
          response.status() === 200,
      ),
      retry.click(),
    ]);
    await retry.waitFor({ state: "detached" });
    assert.match(await target.textContent(), confirmation);
    assert.equal(state.writes, 1);
    assert.equal(state.refreshes, 3);
    if (operation === "create") {
      assert.equal(
        await page.locator('[name="referrerLeadId"]').inputValue(),
        "",
      );
      assert.equal(
        await page.locator('[name="referredName"]').inputValue(),
        "",
      );
      await page.getByText("Registro #8", { exact: true }).waitFor();
    } else if (operation === "link-lead") {
      await page
        .getByText("Lead indicado vinculado: 42", { exact: true })
        .waitFor();
    } else {
      await page
        .getByText(`Status: ${state.items[0].status}`, { exact: true })
        .waitFor();
    }
  }
  await page.unroute(referralsApi, route);
}

// Capture actual controller/listener Promises without changing their bodies.
async function installReferralObservation(page) {
  await page.addInitScript(() => {
    window.__wp06 = { operations: [] };
    window.__wp06Observe = (kind, result) => {
      const entry = {
        kind,
        done: false,
        thenable: Boolean(result?.then),
        error: null,
      };
      entry.promise = Promise.resolve(result).then(
        (value) => {
          entry.done = true;
          return value;
        },
        (error) => {
          entry.done = true;
          entry.error = String(error);
          throw error;
        },
      );
      window.__wp06.operations.push(entry);
      return result;
    };
    const add = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (
        type === "click" &&
        this instanceof HTMLButtonElement &&
        ["Atualizar lista", "Tentar novamente"].includes(this.textContent) &&
        typeof listener === "function"
      ) {
        const original = listener;
        listener = function (...args) {
          return window.__wp06Observe("retry", original.apply(this, args));
        };
      }
      return add.call(this, type, listener, options);
    };
  });
}

async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Fixture barrier: ${label}`)),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function referralScenario(page, options, exercise) {
  const state = {
    items: [7, 8].slice(0, options.rows ?? 1).map((id) => ({
      id,
      status: "pending",
      referredLeadId: id === 7 ? (options.initialLead ?? null) : null,
    })),
    reads: 0,
    writes: 0,
    unexpected: [],
    pending: new Set(),
    gates: new Map(),
  };
  const gate = (name) => {
    if (!state.gates.has(name)) {
      let capture, release;
      const entered = new Promise((done) => {
        capture = done;
      });
      const released = new Promise((done) => {
        release = done;
      });
      state.gates.set(name, { capture, release, entered, released });
    }
    return state.gates.get(name);
  };
  state.hold = async (name) => {
    gate(name).capture();
    await gate(name).released;
  };
  state.wait = (name) => bounded(gate(name).entered, name);
  state.release = (name) => gate(name).release();
  state.settle = async (kind, index = -1) => {
    const observed = await bounded(
      page.evaluate(
        async ({ kind, index }) => {
          const entry = window.__wp06.operations
            .filter((item) => item.kind === kind)
            .at(index);
          if (!entry) throw new Error("Missing original operation Promise");
          await entry.promise;
          return {
            done: entry.done,
            thenable: entry.thenable,
            error: entry.error,
          };
        },
        { kind, index },
      ),
      kind,
    );
    assert.deepEqual(observed, { done: true, thenable: true, error: null });
  };
  state.create = async (name, lead = "43") => {
    await page.locator('[name="referrerLeadId"]').fill(lead);
    await page.locator('[name="referredName"]').fill(name);
    await page.locator("#referral-create-submit").click();
  };
  state.action = (id, action) =>
    page
      .locator(
        `button[data-referral-id="${id}"][data-referral-action="${action}"]`,
      )
      .click();
  state.link = async (id, lead) => {
    const form = page.locator(`form[data-referral-id="${id}"]`);
    await form.locator("input").fill(lead);
    await form.locator("button").click();
  };
  state.retry = page
    .locator("#referrals-recovery")
    .getByRole("button", { name: "Atualizar lista", exact: true });
  state.recover = async () => {
    await state.retry.click();
    await state.settle("retry");
  };
  state.snapshot = () =>
    page.evaluate(() => ({
      feedback: document.querySelector("#referrals-status").textContent,
      created: document.querySelector("#referral-create-status").textContent,
      createDraft: [
        ...document.querySelectorAll("#referral-create-form input"),
      ].map((input) => input.value),
      createEnabled: !document.querySelector("#referral-create-submit")
        .disabled,
      recovery: document.querySelector("#referrals-recovery").textContent,
      retryEnabled:
        document.querySelector("#referrals-recovery button")?.disabled ===
        false,
      rows: [...document.querySelectorAll("#referrals-list article")].map(
        (article) => ({
          id: article.querySelector("form").dataset.referralId,
          status: article.querySelector("p").textContent,
          link: article.querySelectorAll("p")[1].textContent,
          draft: article.querySelector("input").value,
          baseline: article.querySelector("input").defaultValue,
          linkDisabled: article.querySelector('button[type="submit"]').disabled,
          actions: [
            ...article.querySelectorAll("button[data-referral-action]"),
          ].map((button) => ({
            action: button.dataset.referralAction,
            disabled: button.disabled,
          })),
        }),
      ),
    }));
  state.markDom = () =>
    page.evaluate(() => {
      const list = document.querySelector("#referrals-list");
      const saved = (window.__wp06.dom = {
        article: list.querySelector("article"),
        input: list.querySelector("input"),
        retry: document.querySelector("#referrals-recovery button"),
        mutations: 0,
      });
      saved.observer = new MutationObserver((records) => {
        saved.mutations += records.length;
      });
      saved.observer.observe(list, { childList: true, subtree: true });
    });
  state.unchangedDom = async () => {
    const observed = await page.evaluate(() => {
      const saved = window.__wp06.dom,
        list = document.querySelector("#referrals-list");
      const mutations = saved.mutations + saved.observer.takeRecords().length;
      saved.observer.disconnect();
      return {
        article:
          saved.article.isConnected &&
          saved.article === list.querySelector("article"),
        input:
          saved.input.isConnected &&
          saved.input === list.querySelector("input"),
        retry:
          saved.retry === document.querySelector("#referrals-recovery button"),
        mutations,
      };
    });
    assert.deepEqual(observed, {
      article: true,
      input: true,
      retry: true,
      mutations: 0,
    });
  };
  const moduleRoute = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    let source = await response.text();
    assert.ok(
      source.includes('from "/packages/auth-browser/dist/index.js"'),
      "preserve canonical server imports and CSP",
    );
    for (const [call, kind] of [
      ["runAction(referralId, action, button)", "action"],
      ["linkLead(form)", "link"],
      ["createReferral(event)", "create"],
      ["start()", "start"],
    ]) {
      const original = `void ${call};`;
      assert.equal(source.split(original).length, 2);
      source = source.replace(
        original,
        `void window.__wp06Observe("${kind}", ${call});`,
      );
    }
    await route.fulfill({ response, body: source });
  };
  const handle = async (route) => {
    const request = route.request();
    try {
      if (request.method() === "POST") {
        ++state.writes;
        assert.ok(
          state.writes <= (options.maxWrites ?? 2),
          "recovery never repeats a write",
        );
        const status = await options.post(state, request);
        await route.fulfill({
          status,
          json:
            status === 200 ? { success: true } : { error: "FIXTURE_CONFLICT" },
        });
      } else {
        assert.equal(request.method(), "GET");
        assert.equal(request.url(), origin + "/api/crm/referrals");
        ++state.reads;
        assert.ok(state.reads <= (options.maxReads ?? 5), "bounded list reads");
        const data = structuredClone(state.items);
        const status = (await options.read?.(state, data)) ?? 200;
        await route.fulfill({
          status,
          json: status === 200 ? { data } : { error: "FIXTURE_REFRESH_FAILED" },
        });
      }
    } catch (error) {
      state.unexpected.push(error);
      await route.fulfill({
        status: 500,
        json: { error: "FIXTURE_CONTRACT_FAILED" },
      });
    }
  };
  const route = async (requestRoute) => {
    const work = handle(requestRoute);
    state.pending.add(work);
    try {
      await work;
    } finally {
      state.pending.delete(work);
    }
  };
  let sessions = 0;
  const sessionRoute = async (route) => {
    if (++sessions === 1 && options.initial === "session")
      await state.hold("initial");
    await route.fulfill({ json: session });
  };
  await page.route("**/apps/admin-crm/public/referrals.js", moduleRoute);
  await page.route("**/api/dashboard/auth/session", sessionRoute);
  await page.route(referralsApi, route);
  try {
    await page.goto(origin + "/apps/admin-crm/public/referrals.html", {
      waitUntil: "domcontentloaded",
    });
    if (options.initial) await state.wait("initial");
    else await state.settle("start");
    await exercise(state);
    assert.deepEqual(state.unexpected, []);
  } finally {
    for (const entry of state.gates.values()) entry.release();
    await bounded(
      Promise.all([...state.pending]),
      "own fixture routes settled",
    );
    await page.evaluate(() => window.__wp06.dom?.observer.disconnect());
    await page.unroute(referralsApi, route);
    await page.unroute("**/api/dashboard/auth/session", sessionRoute);
    await page.unroute("**/apps/admin-crm/public/referrals.js", moduleRoute);
  }
}

function expectedPost(request, path, body = null) {
  assert.equal(request.url(), origin + "/api/crm/referrals" + path);
  assert.deepEqual(
    body === null ? request.postData() : request.postDataJSON(),
    body,
  );
}

async function verifyReferralConcurrency(page) {
  await installReferralObservation(page);
  const cases = [];
  for (const [writeB, readA, readB = 500] of [
    [409, 200],
    [409, 500],
    [200, 200],
    [200, 200, 200],
    [200, 500, 200],
  ]) {
    cases.push([
      `R1 B${writeB}/A${readA}/readB${readB}`,
      () =>
        referralScenario(
          page,
          {
            post: async (s, request) => {
              expectedPost(
                request,
                "",
                s.writes === 1
                  ? { referrerLeadId: 42, referredName: "A confirmado" }
                  : { referrerLeadId: 43, referredName: "B ainda não salvo" },
              );
              if (s.writes === 2) await s.hold("B");
              const status = s.writes === 1 ? 200 : writeB;
              if (status === 200)
                s.items.push({
                  id: s.writes === 1 ? 8 : 9,
                  status: "pending",
                  referredLeadId: null,
                });
              return status;
            },
            read: async (s, snapshot) => {
              if (s.reads === 3) {
                assert.deepEqual(
                  snapshot.map((item) => item.id),
                  [7, 8],
                );
                await s.hold("old");
                return readA;
              }
              if (s.reads === 2) return 500;
              return s.reads === 4 && writeB === 200 ? readB : 200;
            },
          },
          async (s) => {
            await s.create("A confirmado", "42");
            await s.settle("create");
            assert.equal((await s.snapshot()).created, "Salvo.");
            await s.retry.click();
            await s.wait("old");
            await s.create("B ainda não salvo");
            await s.wait("B");
            assert.equal((await s.snapshot()).created, "Salvando…");
            assert.equal((await s.snapshot()).createEnabled, false);
            s.release("B");
            await s.settle("create");
            await page.locator('form[data-referral-id="7"] input').fill("73");
            const before = await s.snapshot();
            await s.markDom();
            s.release("old");
            await s.settle("retry");
            await s.unchangedDom();
            assert.deepEqual(
              await s.snapshot(),
              before,
              "stale response cannot change messages, drafts, controls or list",
            );
            assert.equal(
              before.created,
              writeB === 409 ? "Falha (409)." : "Salvo.",
            );
            assert.deepEqual(
              before.createDraft,
              writeB === 409 ? ["43", "B ainda não salvo"] : ["", ""],
            );
            assert.equal(before.createEnabled, true);
            assert.equal(before.rows[0].draft, "73");
            assert.deepEqual(
              before.rows.map((row) => row.id),
              writeB === 200 && readB === 200 ? ["7", "8", "9"] : ["7"],
            );
            assert.equal(s.reads, writeB === 409 ? 3 : 4);
            assert.equal(s.writes, 2);
            if (writeB === 200 && readB === 200) {
              assert.equal(
                await s.retry.count(),
                0,
                "stale completion cannot revive resolved recovery",
              );
            }
            if (writeB === 200 && readB === 500) {
              await s.recover();
              assert.deepEqual(
                (await s.snapshot()).rows.map((row) => row.id),
                ["7", "8", "9"],
              );
              assert.equal((await s.snapshot()).created, "Salvo.");
              assert.equal(await s.retry.count(), 0);
              assert.equal(s.reads, 5);
              assert.equal(s.writes, 2);
            }
          },
        ),
    ]);
  }
  for (const [firstRetry, superseded] of [
    [200, false],
    [500, false],
    [200, true],
  ]) {
    cases.push([
      `R2 ${firstRetry}/superseded=${superseded}`,
      () =>
        referralScenario(
          page,
          {
            post: async (s, request) => {
              if (s.writes === 1) {
                expectedPost(request, "/7/contact");
                s.items[0].status = "contacted";
                return 200;
              }
              expectedPost(request, "", {
                referrerLeadId: 43,
                referredName: "B ainda não salvo",
              });
              return 409;
            },
            read: async (s) => {
              if (s.reads === 3 && superseded) await s.hold("old");
              return s.reads === 2 || (s.reads === 3 && firstRetry === 500)
                ? 500
                : 200;
            },
          },
          async (s) => {
            await page.evaluate(() => {
              window.__wp06.button = document.querySelector(
                'button[data-referral-action="contact"]',
              );
            });
            await s.action(7, "contact");
            await s.settle("action");
            assert.equal(s.writes, 1);
            assert.equal(s.reads, 2);
            if (superseded) {
              await s.retry.click();
              await s.wait("old");
            }
            await s.create("B ainda não salvo");
            await s.settle("create");
            const attempts = firstRetry === 500 || superseded ? 2 : 1;
            for (let attempt = 0; attempt < attempts; ++attempt) {
              if (superseded && attempt === 0) {
                await s.markDom();
                s.release("old");
                await s.settle("retry");
                await s.unchangedDom();
              } else await s.recover();
              const observed = await s.snapshot();
              assert.equal(s.writes, 2);
              assert.equal(s.reads, 3 + attempt);
              assert.equal(observed.created, "Falha (409).");
              assert.deepEqual(observed.createDraft, [
                "43",
                "B ainda não salvo",
              ]);
              assert.equal(observed.createEnabled, true);
              assert.equal(observed.feedback, "Indicação atualizada.");
              const unresolved = attempts === 2 && attempt === 0;
              assert.equal(observed.retryEnabled, unresolved);
              assert.equal(
                observed.rows[0].status,
                unresolved ? "Status: pending" : "Status: contacted",
              );
              assert.equal(
                await page.evaluate(() => window.__wp06.button.isConnected),
                unresolved,
              );
              if (unresolved)
                assert.equal(
                  await page.evaluate(() => window.__wp06.button.disabled),
                  true,
                );
              else
                assert.equal(
                  observed.rows[0].actions.some(
                    (button) => button.action === "contact",
                  ),
                  false,
                );
            }
          },
        ),
    ]);
  }
  cases.push([
    "R3 shared feedback recovery",
    () =>
      referralScenario(
        page,
        {
          rows: 2,
          post: async (s, request) => {
            if (s.writes === 1) {
              expectedPost(request, "/7/link-lead", { referredLeadId: 42 });
              s.items[0].referredLeadId = 42;
              return 200;
            }
            expectedPost(request, "/8/contact");
            return 409;
          },
          read: (s) => (s.reads === 2 ? 500 : 200),
        },
        async (s) => {
          await s.link(7, "42");
          await s.settle("link");
          assert.equal((await s.snapshot()).rows[0].linkDisabled, true);
          await s.action(8, "contact");
          await s.settle("action");
          const failure = "A transição não é permitida para esta indicação.";
          assert.equal((await s.snapshot()).feedback, failure);
          assert.equal((await s.snapshot()).retryEnabled, true);
          await s.recover();
          const after = await s.snapshot();
          assert.equal(after.feedback, failure);
          assert.equal(after.rows[0].link, "Lead indicado vinculado: 42");
          assert.equal(after.rows[0].linkDisabled, false);
          assert.equal(after.retryEnabled, false);
          assert.equal(s.writes, 2);
          assert.equal(s.reads, 3);
        },
      ),
  ]);
  for (const draft of ["99", ""]) {
    cases.push([
      `R4 row draft ${draft || "empty"}`,
      () =>
        referralScenario(
          page,
          {
            initialLead: draft === "" ? 65 : null,
            post: async (s, request) => {
              if (s.writes === 1) {
                expectedPost(request, "", {
                  referrerLeadId: 43,
                  referredName: "A confirmado",
                });
                s.items.push({
                  id: 9,
                  status: "pending",
                  referredLeadId: null,
                });
                return 200;
              }
              expectedPost(request, "/7/link-lead", { referredLeadId: 84 });
              return 409;
            },
            read: (s) => (s.reads === 2 ? 500 : 200),
          },
          async (s) => {
            await s.create("A confirmado");
            await s.settle("create");
            await s.link(7, "84");
            await s.settle("link");
            await page.locator('form[data-referral-id="7"] input').fill(draft);
            await s.recover();
            const after = await s.snapshot();
            assert.equal(after.feedback, "Falha ao vincular Lead (409).");
            assert.equal(after.rows[0].draft, draft);
            assert.equal(after.created, "Salvo.");
            assert.deepEqual(
              after.rows.map((row) => row.id),
              ["7", "9"],
            );
            assert.equal(s.writes, 2);
            assert.equal(s.reads, 3);
          },
        ),
    ]);
  }
  for (const kind of [
    "contact",
    "link-draft",
    "link-empty",
    "create-draft",
    "link-committed-empty",
  ]) {
    cases.push([
      kind === "link-committed-empty"
        ? "R7 link committed before response"
        : `R5 late ${kind}`,
      () =>
        referralScenario(
          page,
          {
            rows: 2,
            post: async (s, request) => {
              if (s.writes === 1) {
                expectedPost(
                  request,
                  kind === "contact"
                    ? "/7/contact"
                    : kind === "create-draft"
                      ? ""
                      : "/7/link-lead",
                  kind === "contact"
                    ? null
                    : kind === "create-draft"
                      ? { referrerLeadId: 43, referredName: "A confirmado" }
                      : { referredLeadId: 42 },
                );
                if (kind === "link-committed-empty")
                  s.items[0].referredLeadId = 42;
                await s.hold("A");
                if (kind === "contact") s.items[0].status = "contacted";
                else if (kind === "create-draft")
                  s.items.push({
                    id: 9,
                    status: "pending",
                    referredLeadId: null,
                  });
                else s.items[0].referredLeadId = 42;
              } else {
                expectedPost(request, "/8/convert");
                s.items[1].status = "converted";
              }
              return 200;
            },
          },
          async (s) => {
            if (kind === "contact") await s.action(7, "contact");
            else if (kind === "create-draft") await s.create("A confirmado");
            else await s.link(7, "42");
            await s.wait("A");
            const draft = kind.includes("empty") ? "" : "73";
            if (kind.startsWith("link"))
              await page
                .locator('form[data-referral-id="7"] input')
                .fill(draft);
            if (kind === "create-draft")
              await page
                .locator('[name="referredName"]')
                .fill("Rascunho posterior");
            await s.action(8, "convert");
            await s.settle("action");
            const before = await s.snapshot();
            const button =
              kind === "contact"
                ? page.locator(
                    'button[data-referral-id="7"][data-referral-action="contact"]',
                  )
                : kind === "create-draft"
                  ? page.locator("#referral-create-submit")
                  : page.locator('form[data-referral-id="7"] button');
            assert.equal(
              await button.isDisabled(),
              true,
              "render cannot re-enable a pending logical control",
            );
            await button.evaluate((element) => element.click());
            assert.equal(
              s.writes,
              2,
              "disabled recreated control cannot submit again",
            );
            s.release("A");
            await s.settle(
              kind === "contact"
                ? "action"
                : kind === "create-draft"
                  ? "create"
                  : "link",
              0,
            );
            const after = await s.snapshot();
            assert.equal(s.reads, 3);
            assert.equal(s.writes, 2);
            assert.equal(after.feedback, before.feedback);
            assert.equal(after.rows[1].status, "Status: converted");
            if (kind === "contact")
              assert.equal(after.rows[0].status, "Status: contacted");
            else if (kind === "create-draft") {
              assert.deepEqual(after.createDraft, ["43", "Rascunho posterior"]);
              assert.equal(after.created, "Salvo.");
              assert.equal(after.rows[2].id, "9");
            } else {
              assert.equal(before.rows[0].draft, draft);
              assert.equal(after.rows[0].draft, draft);
              assert.equal(after.rows[0].baseline, "42");
              assert.equal(after.rows[0].link, "Lead indicado vinculado: 42");
              if (kind === "link-committed-empty") {
                assert.equal(
                  before.rows[0].link,
                  "Lead indicado vinculado: 42",
                );
                assert.equal(before.rows[0].baseline, "42");
                assert.equal(after.rows[0].linkDisabled, false);
              }
            }
          },
        ),
    ]);
  }
  for (const initial of ["get", "session"]) {
    cases.push([
      `R6 initial ${initial}`,
      () =>
        referralScenario(
          page,
          {
            initial,
            maxWrites: 1,
            post: async (s, request) => {
              expectedPost(request, "", {
                referrerLeadId: 43,
                referredName: "B ainda não salvo",
              });
              return 409;
            },
            read: async (s) => {
              if (initial === "get" && s.reads === 1) await s.hold("initial");
              return 200;
            },
          },
          async (s) => {
            await s.create("B ainda não salvo");
            if (initial === "get") await s.settle("create");
            s.release("initial");
            await s.settle("start");
            await s.settle("create");
            const observed = await s.snapshot();
            assert.equal(observed.created, "Falha (409).");
            assert.deepEqual(observed.createDraft, ["43", "B ainda não salvo"]);
            assert.ok(
              observed.rows.length || observed.retryEnabled,
              "startup must apply data or retain usable recovery",
            );
            assert.doesNotMatch(
              observed.feedback,
              /Carregando/,
              "startup loading indicator must finish",
            );
            if (!observed.rows.length) await s.recover();
            const after = await s.snapshot();
            assert.deepEqual(
              after.rows.map((row) => row.id),
              ["7"],
            );
            assert.equal(after.created, observed.created);
            assert.deepEqual(after.createDraft, observed.createDraft);
            assert.equal(after.createEnabled, true);
            assert.equal(s.writes, 1);
            assert.equal(s.reads, initial === "get" ? 2 : 1);
          },
        ),
    ]);
  }
  const failures = [];
  for (const [name, exercise] of cases) {
    try {
      await exercise();
      console.log(`PASS WP06 ${name}`);
    } catch (error) {
      failures.push(error);
      console.error(`FAIL WP06 ${name}`);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "WP06 referral concurrency contract failed",
    );
}

registerReferralMutationTests();
if (!process.argv.includes("--wp06-deterministic")) {
  require("node:test").test(
    "WP05 session recovery and WP06 confirmed referral mutations in Chromium",
    run,
  );
}

// These tests execute the actual referral controller with deterministic DOM and
// HTTP ports. Browser/session integration remains covered by run() above.
function registerReferralMutationTests() {
  const { test } = require("node:test");
  const operations = ["create", "contact", "convert", "lose", "link-lead"];
  for (const operation of operations) {
    for (const readFailure of ["network", "http", "payload"]) {
      test(`WP06 ${operation}: confirmed write survives ${readFailure} refresh failure; retry is read-only`, async () => {
        const fixture = await referralFixture();
        fixture.state.readFailure = readFailure;
        await fixture.mutate(operation);
        const target = fixture.feedback(operation);
        assert.match(target.textContent, fixture.confirmation(operation));
        assert.match(
          fixture.recovery().textContent,
          /Não foi possível atualizar a lista/,
        );
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 1);
        assert.equal(fixture.form.resets, operation === "create" ? 1 : 0);
        const retry = fixture.recovery().querySelector("button");
        assert.ok(retry, "confirmed write must offer a list refresh");
        assert.equal(retry.textContent, "Atualizar lista");
        assert.equal(retry.style.minHeight, "44px");
        await retry.click();
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 2);
        assert.match(target.textContent, fixture.confirmation(operation));
        fixture.state.readFailure = null;
        await fixture.recovery().querySelector("button").click();
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 3);
        assert.match(target.textContent, fixture.confirmation(operation));
        assert.equal(fixture.recovery().querySelector("button"), null);
        assert.equal(fixture.form.resets, operation === "create" ? 1 : 0);
      });
    }
    for (const writeFailure of ["network", "http"]) {
      test(`WP06 ${operation}: ${writeFailure} write failure preserves draft and never refreshes`, async () => {
        const fixture = await referralFixture();
        fixture.state.writeFailure = writeFailure;
        await fixture.mutate(operation);
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 0);
        assert.equal(fixture.form.resets, 0);
        assert.equal(fixture.recovery().querySelector("button"), null);
        assert.doesNotMatch(
          fixture.feedback(operation).textContent,
          fixture.confirmation(operation),
        );
        assert.equal(fixture.submit(operation).disabled, false);
      });
    }
    test(`WP06 ${operation}: successful write and refresh remain successful`, async () => {
      const fixture = await referralFixture();
      await fixture.mutate(operation);
      assert.equal(fixture.writes(), 1);
      assert.equal(fixture.reads(), 1);
      assert.equal(fixture.form.resets, operation === "create" ? 1 : 0);
      assert.doesNotMatch(
        fixture.feedback(operation).textContent,
        /Falha|Não foi possível/,
      );
      assert.equal(fixture.recovery().querySelector("button"), null);
    });
  }
}

async function referralFixture() {
  const { readFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  const { runInNewContext } = require("node:vm");
  class Element {
    constructor(tagName = "div") {
      this.tagName = tagName;
      this.dataset = {};
      this.style = {};
      this.children = [];
      this.listeners = new Map();
      this.disabled = false;
      this.text = "";
    }
    setAttribute(name, value) {
      this[name] = String(value);
    }
    after(element) {
      nodes.set("#" + element.id, element);
    }
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (
          (selector.startsWith("button") &&
            child instanceof Button &&
            (!selector.includes("data-referral-key") ||
              child.dataset.referralKey)) ||
          (selector.startsWith("form") &&
            child instanceof Form &&
            child.dataset.referralLinkForm)
        )
          found.push(child);
        found.push(...(child.querySelectorAll?.(selector) ?? []));
      }
      return found;
    }
    set textContent(value) {
      this.text = String(value);
      this.children = [];
    }
    get textContent() {
      return (
        this.text + this.children.map((child) => child.textContent).join("")
      );
    }
    append(...children) {
      this.children.push(...children);
    }
    replaceChildren(...children) {
      this.text = "";
      this.children = [...children];
    }
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }
    querySelector(selector) {
      for (const child of this.children) {
        if (child instanceof Button && selector.startsWith("button"))
          return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    }
  }
  class Button extends Element {
    constructor() {
      super("button");
    }
    async click() {
      if (!this.disabled) await this.listeners.get("click")?.();
    }
  }
  class Form extends Element {
    constructor() {
      super("form");
      this.fields = {};
      this.resets = 0;
    }
    reportValidity() {
      return true;
    }
    reset() {
      this.resets++;
      this.fields = {};
    }
  }
  const nodes = new Map([
    ["#session-status", new Element()],
    ["#referrals-status", new Element()],
    ["#referrals-list", new Element()],
    ["#referral-create-form", new Form()],
    ["#referral-create-submit", new Button()],
    ["#referral-create-status", new Element()],
  ]);
  const state = { readFailure: null, writeFailure: null, confirmed: false };
  const calls = [];
  const auth = {
    getSession: async () => session,
    secureFetch: async (url, options = {}) => {
      const method = options.method || "GET";
      calls.push({ url, method });
      if (method === "POST") {
        if (state.writeFailure === "network")
          throw new Error("FIXTURE_WRITE_NETWORK");
        if (state.writeFailure === "http") return { ok: false, status: 409 };
        state.confirmed = true;
        return { ok: true, status: 200 };
      }
      if (state.confirmed && state.readFailure === "network") {
        throw new Error("FIXTURE_READ_NETWORK");
      }
      return {
        ok: !(state.confirmed && state.readFailure === "http"),
        status: state.confirmed && state.readFailure === "http" ? 500 : 200,
        json: async () =>
          state.confirmed && state.readFailure === "payload"
            ? {}
            : { data: [] },
      };
    },
  };
  const context = {
    createDashboardAuthClient: () => auth,
    window: {
      fetch: () => {
        throw new Error("NETWORK_FORBIDDEN");
      },
      sessionStorage: {},
      location: {
        origin: "http://fixture.invalid",
        pathname: "/referrals.html",
        search: "",
        replace: () => {},
      },
    },
    document: {
      querySelector: (selector) => nodes.get(selector) || null,
      createElement: (tag) =>
        tag === "button"
          ? new Button()
          : tag === "form"
            ? new Form()
            : new Element(tag),
      createTextNode: (text) => ({ textContent: String(text) }),
    },
    HTMLElement: Element,
    HTMLButtonElement: Button,
    HTMLFormElement: Form,
    FormData: class {
      constructor(form) {
        this.fields = { ...form.fields };
      }
      get(name) {
        return this.fields[name];
      }
    },
    Error,
  };
  const sourcePath = resolve(__dirname, "../../admin-crm/public/referrals.js");
  const source = readFileSync(sourcePath, "utf8");
  const importLine =
    'import { createDashboardAuthClient } from "@touristic/auth-browser";';
  assert.equal(source.split(importLine).length, 2);
  assert.equal(source.split("void start();").length, 2);
  runInNewContext(
    source
      .replace(importLine, "")
      .replace("void start();", "globalThis.started = start();") +
      "\nglobalThis.actions = { createReferral, runAction, linkLead };",
    context,
    { filename: sourcePath },
  );
  await context.started;
  calls.length = 0;
  const form = nodes.get("#referral-create-form");
  const actionSubmit = new Button();
  const linkForm = new Form();
  linkForm.dataset.referralId = "7";
  linkForm.fields = { referredLeadId: "42" };
  linkForm.append(actionSubmit);
  return {
    state,
    form,
    writes: () => calls.filter((call) => call.method === "POST").length,
    reads: () => calls.filter((call) => call.method === "GET").length,
    feedback: (operation) =>
      nodes.get(
        operation === "create"
          ? "#referral-create-status"
          : "#referrals-status",
      ),
    recovery: () => nodes.get("#referrals-recovery"),
    confirmation: (operation) =>
      operation === "create"
        ? /Salvo\./
        : operation === "link-lead"
          ? /Lead vinculado\./
          : /Indicação atualizada\./,
    submit: (operation) =>
      operation === "create"
        ? nodes.get("#referral-create-submit")
        : actionSubmit,
    mutate: async (operation) => {
      if (operation === "create") {
        form.fields = { referrerLeadId: "42", referredName: "Fixture" };
        await context.actions.createReferral({ preventDefault() {} });
      } else if (operation === "link-lead") {
        await context.actions.linkLead(linkForm);
      } else {
        await context.actions.runAction("7", operation, actionSubmit);
      }
    },
  };
}
