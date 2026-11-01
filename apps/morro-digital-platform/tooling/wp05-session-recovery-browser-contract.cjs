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
    await verifyReferralMutationRaces(page);
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
    const retry = target.getByRole("button", {
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
      await target.textContent(),
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

// Observe completion of the real async retry listener, not merely its response.
async function verifyReferralMutationRaces(page) {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener;
    window.__wp06RetryObservations = [];
    window.__wp06RetrySettlements = [];
    EventTarget.prototype.addEventListener = function (
      type,
      listener,
      options,
    ) {
      if (
        type === "click" &&
        this instanceof HTMLButtonElement &&
        this.textContent === "Atualizar lista" &&
        typeof listener === "function"
      ) {
        const original = listener;
        listener = function (...args) {
          const observation = { done: false, thenable: false, error: null };
          window.__wp06RetryObservations.push(observation);
          try {
            const result = original.apply(this, args);
            observation.thenable = Boolean(
              result && typeof result.then === "function",
            );
            const completion = Promise.resolve(result).then(
              (value) => {
                observation.done = true;
                return value;
              },
              (error) => {
                observation.error = String(error);
                observation.done = true;
                throw error;
              },
            );
            window.__wp06RetrySettlements.push(completion);
            return completion;
          } catch (error) {
            observation.error = String(error);
            observation.done = true;
            throw error;
          }
        };
      }
      return add.call(this, type, listener, options);
    };
  });
  const failures = [];
  for (const variant of [
    { name: "B409 then stale A200", writeB: 409, readA: 200 },
    { name: "B409 then stale A500", writeB: 409, readA: 500 },
    { name: "B200/read500 then stale A200", writeB: 200, readA: 200 },
  ]) {
    try {
      await verifyReferralMutationRace(page, variant);
    } catch (error) {
      console.error(`FAIL WP06 race ${variant.name}: ${error.stack}`);
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "WP06 stale refresh races failed");
}

async function verifyReferralMutationRace(page, variant) {
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const bounded = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out: ${label}`)),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const oldReadCaptured = deferred(),
    releaseOldRead = deferred();
  const writeBCaptured = deferred(),
    releaseWriteB = deferred();
  const pending = new Set(),
    unexpected = [];
  const items = [{ id: 7, status: "pending", referredLeadId: null }];
  let reads = 0,
    writes = 0,
    oldSnapshot;
  const handle = async (route) => {
    const request = route.request();
    try {
      assert.equal(request.url(), origin + "/api/crm/referrals");
      if (request.method() === "POST") {
        writes++;
        assert.ok(writes <= 2, "retries must never repeat a write");
        assert.deepEqual(
          request.postDataJSON(),
          writes === 1
            ? { referrerLeadId: 42, referredName: "A confirmado" }
            : { referrerLeadId: 43, referredName: "B ainda não salvo" },
        );
        if (writes === 2) {
          writeBCaptured.resolve();
          await releaseWriteB.promise;
        }
        const responseStatus = writes === 1 ? 200 : variant.writeB;
        if (responseStatus === 200)
          items.push({
            id: writes === 1 ? 8 : 9,
            status: "pending",
            referredLeadId: null,
          });
        await route.fulfill({
          status: responseStatus,
          json:
            responseStatus === 200
              ? { success: true }
              : { error: "FIXTURE_CONFLICT" },
        });
      } else {
        assert.equal(request.method(), "GET");
        reads++;
        if (reads === 3) {
          oldSnapshot = structuredClone(items);
          oldReadCaptured.resolve();
          await releaseOldRead.promise;
          await route.fulfill({
            status: variant.readA,
            json:
              variant.readA === 200
                ? { data: oldSnapshot }
                : { error: "FIXTURE_OLD_READ_FAILED" },
          });
        } else if (reads === 2 || (reads === 4 && variant.writeB === 200)) {
          await route.fulfill({
            status: 500,
            json: { error: "FIXTURE_REFRESH_FAILED" },
          });
        } else {
          assert.ok(
            reads === 1 || (reads === 5 && variant.writeB === 200),
            "unexpected list refresh",
          );
          await route.fulfill({ json: { data: items } });
        }
      }
    } catch (error) {
      unexpected.push(String(error));
      await route.fulfill({
        status: 500,
        json: { error: "FIXTURE_CONTRACT_FAILED" },
      });
    }
  };
  const route = async (requestRoute) => {
    const work = handle(requestRoute);
    pending.add(work);
    try {
      await work;
    } finally {
      pending.delete(work);
    }
  };
  await page.route(referralsApi, route);
  try {
    await page.goto(origin + "/apps/admin-crm/public/referrals.html");
    await page.getByText("Registro #7", { exact: true }).waitFor();
    const createStatus = page.locator("#referral-create-status");
    const createSubmit = page.locator("#referral-create-submit");
    const retry = createStatus.getByRole("button", {
      name: "Atualizar lista",
      exact: true,
    });
    await page.locator('[name="referrerLeadId"]').fill("42");
    await page.locator('[name="referredName"]').fill("A confirmado");
    await createSubmit.click();
    await retry.waitFor();
    assert.match(
      await createStatus.textContent(),
      /Salvo\. Não foi possível atualizar a lista/,
    );
    assert.equal(await createSubmit.isEnabled(), true);
    await retry.click();
    await bounded(oldReadCaptured.promise, "old retry GET captured");
    assert.deepEqual(
      oldSnapshot.map((item) => item.id),
      [7, 8],
    );
    assert.deepEqual(
      await page.evaluate(() => window.__wp06RetryObservations),
      [{ done: false, thenable: true, error: null }],
    );
    await page.locator('[name="referrerLeadId"]').fill("43");
    await page.locator('[name="referredName"]').fill("B ainda não salvo");
    await createSubmit.click();
    await bounded(writeBCaptured.promise, "new POST captured");
    assert.equal(await createStatus.textContent(), "Salvando…");
    assert.equal(await createSubmit.isDisabled(), true);
    releaseWriteB.resolve();
    if (variant.writeB === 409) {
      await page.getByText("Falha (409).", { exact: true }).waitFor();
    } else {
      await retry.waitFor();
      assert.match(
        await createStatus.textContent(),
        /Salvo\. Não foi possível atualizar a lista/,
      );
    }
    assert.equal(await createSubmit.isEnabled(), true);
    await page.locator('[name="referredLeadId"]').fill("73");
    const feedbackBefore = await createStatus.textContent();
    await page.evaluate(() => {
      const list = document.querySelector("#referrals-list");
      const saved = (window.__wp06RaceDom = {
        article: list.querySelector("article"),
        input: list.querySelector('[name="referredLeadId"]'),
        retry: document.querySelector("#referral-create-status button"),
        status: document.querySelector("#referrals-status").textContent,
        mutations: 0,
      });
      saved.observer = new MutationObserver((records) => {
        saved.mutations += records.length;
      });
      saved.observer.observe(list, { childList: true, subtree: true });
    });
    releaseOldRead.resolve();
    await bounded(
      page.evaluate(() => {
        const completion = window.__wp06RetrySettlements[0];
        if (!completion) throw new Error("Missing original retry promise");
        return completion;
      }),
      "original retry A listener completed",
    );
    const observed = await page.evaluate(() => {
      const saved = window.__wp06RaceDom;
      const list = document.querySelector("#referrals-list");
      saved.mutations += saved.observer.takeRecords().length;
      saved.observer.disconnect();
      return {
        listener: window.__wp06RetryObservations[0],
        feedback: document.querySelector("#referral-create-status").textContent,
        sameArticle:
          saved.article.isConnected &&
          saved.article === list.querySelector("article"),
        sameInput:
          saved.input.isConnected &&
          saved.input === list.querySelector('[name="referredLeadId"]'),
        sameRetry:
          saved.retry ===
          document.querySelector("#referral-create-status button"),
        linkDraft: list.querySelector('[name="referredLeadId"]').value,
        referrerDraft: document.querySelector('[name="referrerLeadId"]').value,
        nameDraft: document.querySelector('[name="referredName"]').value,
        statusUnchanged:
          saved.status ===
          document.querySelector("#referrals-status").textContent,
        headings: [...list.querySelectorAll("h2")].map(
          (node) => node.textContent,
        ),
        mutations: saved.mutations,
        submitEnabled: !document.querySelector("#referral-create-submit")
          .disabled,
      };
    });
    console.log(
      "WP06_RACE_OBSERVATION " +
        JSON.stringify({
          variant: variant.name,
          reads,
          writes,
          oldSnapshot,
          unexpected,
          observed,
        }),
    );
    assert.deepEqual(unexpected, []);
    assert.equal(writes, 2);
    assert.equal(reads, variant.writeB === 409 ? 3 : 4);
    assert.deepEqual(observed.listener, {
      done: true,
      thenable: true,
      error: null,
    });
    assert.equal(
      observed.feedback,
      feedbackBefore,
      "old retry must preserve the newer operation's feedback",
    );
    assert.equal(observed.sameArticle, true);
    assert.equal(observed.sameInput, true);
    assert.equal(observed.sameRetry, true);
    assert.equal(observed.mutations, 0, "old read must not rebuild the list");
    assert.equal(observed.linkDraft, "73");
    assert.equal(observed.referrerDraft, variant.writeB === 409 ? "43" : "");
    assert.equal(
      observed.nameDraft,
      variant.writeB === 409 ? "B ainda não salvo" : "",
    );
    assert.equal(observed.statusUnchanged, true);
    assert.equal(observed.submitEnabled, true);
    assert.deepEqual(observed.headings, ["Registro #7"]);
    if (variant.writeB === 200) {
      await retry.click();
      await bounded(
        page.evaluate(() => {
          const completion = window.__wp06RetrySettlements[1];
          if (!completion) throw new Error("Missing newer retry promise");
          return completion;
        }),
        "newer retry B listener completed",
      );
      assert.deepEqual(
        await page.evaluate(() => window.__wp06RetryObservations[1]),
        { done: true, thenable: true, error: null },
      );
      assert.equal(await createStatus.textContent(), "Salvo.");
      assert.equal(await retry.count(), 0);
      assert.deepEqual(
        await page.locator("#referrals-list h2").allTextContents(),
        ["Registro #7", "Registro #8", "Registro #9"],
      );
      assert.equal(reads, 5);
      assert.equal(writes, 2);
      assert.deepEqual(unexpected, []);
    }
    console.log(
      `PASS WP06 race ${variant.name}: ${writes} POST, ${reads} GET; actual retry listener settled`,
    );
  } finally {
    releaseWriteB.resolve();
    releaseOldRead.resolve();
    await bounded(Promise.all([...pending]), "own fixture routes settled");
    await page.unroute(referralsApi, route);
    await page.evaluate(() => window.__wp06RaceDom?.observer.disconnect());
  }
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
        assert.match(target.textContent, /Não foi possível atualizar a lista/);
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 1);
        assert.equal(fixture.form.resets, operation === "create" ? 1 : 0);
        const retry = target.querySelector("button");
        assert.ok(retry, "confirmed write must offer a list refresh");
        assert.equal(retry.textContent, "Atualizar lista");
        assert.equal(retry.style.minHeight, "44px");
        await retry.click();
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 2);
        assert.match(target.textContent, fixture.confirmation(operation));
        fixture.state.readFailure = null;
        await target.querySelector("button").click();
        assert.equal(fixture.writes(), 1);
        assert.equal(fixture.reads(), 3);
        assert.match(target.textContent, fixture.confirmation(operation));
        assert.equal(target.querySelector("button"), null);
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
        assert.equal(fixture.feedback(operation).querySelector("button"), null);
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
      assert.equal(fixture.feedback(operation).querySelector("button"), null);
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
        this.form = form;
      }
      get(name) {
        return this.form.fields[name];
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
