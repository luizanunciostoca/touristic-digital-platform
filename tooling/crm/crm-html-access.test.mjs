import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");
const crmPublic = "apps/admin-crm/public/";
const dashboard = "/apps/admin-crm/public/index.html";
const modulePath = "/packages/auth-browser/dist/index.js";

for (const page of ["trials", "referrals"]) {
  test(`${page}: imported authentication client matches canonical browser authority`, () => {
    const script = read(`${crmPublic}${page}.js`);
    const auth = read("packages/auth-browser/src/index.ts");
    assert.match(auth, /export function createDashboardAuthClient\(/u);
    assert.match(
      script,
      /import \{ createDashboardAuthClient \} from "@touristic\/auth-browser"/u,
    );
    assert.doesNotMatch(
      script,
      /createAuthBrowserClient|requireSession|\/apps\/dashboard\/login\.html/u,
    );
    assert.match(script, /auth\.getSession\(/u);
    assert.match(script, /\/dashboard\/login\.html\?return=/u);
    assert.match(script, /auth\.secureFetch\(/u);
  });
  test(`${page}: official branded CRM HTML contains valid module and usable return link`, () => {
    const html = read(`${crmPublic}${page}.html`);
    assert.match(html, /<html lang="pt-BR"/u);
    assert.ok(html.includes("/apps/admin-crm/public/crm.css"));
    assert.ok(html.includes('type="importmap"'));
    assert.ok(html.includes(modulePath));
    assert.ok(html.includes('href="' + dashboard + '#dashboard"'));
    assert.ok(
      html.includes(
        'id="' +
          (page === "trials" ? "trial-create-form" : "referral-create-form") +
          '"',
      ),
    );
    assert.ok(html.includes(`/apps/admin-crm/public/${page}.js`));
    assert.doesNotMatch(html, /href="\/apps\/admin-crm\/"/u);
  });
}
test("CRM navigation links use real canonical pages, not directory URLs", () => {
  for (const name of ["follow-ups.html", "settings.html", "lead-detail.html"]) {
    const html = read(crmPublic + name);
    assert.ok(html.includes('href="' + dashboard), name);
    assert.doesNotMatch(html, /href="\/apps\/admin-crm\/(?:#|")/u);
  }
});
test("CRM trial/referral mutation controls remain wired to real API owners", () => {
  const trials = read(crmPublic + "trials.js");
  for (const endpoint of [
    "/api/crm/trials",
    "/api/crm/trials/${trialId}/${action}",
  ]) {
    assert.ok(trials.includes(endpoint), endpoint);
  }
  const referrals = read(crmPublic + "referrals.js");
  for (const endpoint of [
    "/api/crm/referrals",
    "/api/crm/referrals/${referralId}/${action}",
    "/api/crm/referrals/${referralId}/link-lead",
  ]) {
    assert.ok(referrals.includes(endpoint), endpoint);
  }
});

for (const page of ["trials", "referrals"]) {
  test(`${page}: new CRM form touch controls enforce at least 44px`, () => {
    const html = read(`${crmPublic}${page}.html`);
    const formId =
      page === "trials" ? "trial-create-form" : "referral-create-form";
    assert.ok(html.includes(`#${formId} :is(input, button)`));
    const listId = page === "trials" ? "trials-list" : "referrals-list";
    assert.ok(html.includes(`#${listId} :is(input, button)`));
    assert.ok(html.includes("min-height: 44px"));
  });
}

test("CRM browser acceptance binds the created referral to a separate authenticated GET", () => {
  const browserProof = read("tooling/crm/crm-html-access.test.mjs");
  assert.match(browserProof, /context\.request\.get\(origin \+ route/u);
  assert.match(browserProof, /item\.referredName === referralMarker/u);
  assert.match(browserProof, /independent-authenticated-crm-get/u);
  assert.match(browserProof, /wait-for-persisted-record-readback/u);
});

// A real-browser acceptance run is explicitly invoked by the canonical
// CRM Equivalence workflow only after its MySQL fixtures and HTTP server exist.
// The ordinary Node unit suite never masquerades as browser proof.
if (process.env.CRM_HTML_BROWSER_E2E === "1") {
  test(
    "Chromium: Trials and Indicações redirect, login, CSRF writes, touch size and DB-backed readback",
    { timeout: 90_000 },
    async () => {
      const { createRequire } = await import("node:module");
      const { mkdirSync, writeFileSync } = await import("node:fs");
      const require = createRequire(import.meta.url);
      const { chromium } = require("/tmp/pw/node_modules/playwright");
      const origin = "http://127.0.0.1:4192";
      const leadId = readFileSync("/tmp/m141-lead-id.txt", "utf8").trim();
      assert.match(leadId, /^[1-9][0-9]*$/u);

      const evidence = {
        contractVersion: 1,
        type: "REAL_BROWSER_CRM_HTML",
        pages: [],
        result: "FAIL",
      };
      mkdirSync("/tmp/crm-m141-evidence", { recursive: true });
      const browser = await chromium.launch({ headless: true });
      const bounded = async (stage, action, page, record) => {
        record.stage = stage;
        console.log(
          "CRM_HTML_BROWSER_STAGE",
          JSON.stringify({
            page: record.page,
            stage,
            url: page.url(),
          }),
        );
        let deadline;
        try {
          return await Promise.race([
            Promise.resolve().then(action),
            new Promise((_, reject) => {
              deadline = setTimeout(
                () => reject(new Error("CRM_HTML_STAGE_DEADLINE:" + stage)),
                12_000,
              );
            }),
          ]);
        } catch (error) {
          const code = error instanceof Error ? error.name : "UNKNOWN";
          console.error(
            "CRM_HTML_BROWSER_STAGE_FAILED",
            JSON.stringify({ page: record.page, stage, code }),
          );
          throw error;
        } finally {
          clearTimeout(deadline);
        }
      };
      try {
        for (const pageName of ["trials", "referrals"]) {
          const path = `/apps/admin-crm/public/${pageName}.html`;
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
          });
          const page = await context.newPage();
          page.setDefaultTimeout(10_000);
          page.setDefaultNavigationTimeout(12_000);
          const errors = [];
          const failures = [];
          page.on("requestfailed", (request) =>
            failures.push({
              url: new URL(request.url()).pathname,
              failure: request.failure()?.errorText ?? "FAILED",
            }),
          );
          page.on("response", (response) => {
            if (response.status() >= 400) {
              failures.push({
                url: new URL(response.url()).pathname,
                status: response.status(),
              });
            }
          });
          page.on("pageerror", (error) => errors.push(error.message));
          page.on("request", (request) => {
            if (new URL(request.url()).pathname === "/api/crm/" + pageName) {
              console.log(
                "CRM_HTML_HTTP_REQUEST",
                JSON.stringify({
                  page: pageName,
                  method: request.method(),
                  path: "/api/crm/" + pageName,
                }),
              );
            }
          });
          page.on("response", (response) => {
            if (new URL(response.url()).pathname === "/api/crm/" + pageName) {
              console.log(
                "CRM_HTML_HTTP_RESPONSE",
                JSON.stringify({
                  page: pageName,
                  method: response.request().method(),
                  status: response.status(),
                }),
              );
            }
          });
          const record = {
            page: pageName,
            redirect: false,
            authenticated: false,
            csrf: false,
            mutationStatus: null,
            minTouchHeight: null,
            readback: false,
            persistedId: null,
            pageErrors: 0,
            stage: "init",
            failures: [],
          };
          try {
            await bounded(
              "navigate-unauthenticated",
              () =>
                page.goto(origin + path, {
                  waitUntil: "domcontentloaded",
                  timeout: 12_000,
                }),
              page,
              record,
            );
            await bounded(
              "wait-for-login-redirect",
              () =>
                page.waitForURL(
                  (url) =>
                    url.pathname === "/dashboard/login.html" &&
                    url.searchParams.get("return") === path,
                  { timeout: 10_000 },
                ),
              page,
              record,
            );
            record.redirect = true;
            await page.locator("#email").fill("owner@example.com");
            await page
              .locator("#password")
              .fill("correct horse battery staple");
            await bounded(
              "submit-login",
              () => page.locator("#submit").click(),
              page,
              record,
            );
            await bounded(
              "wait-for-authenticated-return",
              () =>
                page.waitForURL((url) => url.pathname === path, {
                  timeout: 12_000,
                }),
              page,
              record,
            );
            await bounded(
              "wait-for-session-status",
              () =>
                page.waitForFunction(
                  () =>
                    document
                      .querySelector("#session-status")
                      ?.textContent?.includes("Sessão autenticada"),
                  { timeout: 10_000 },
                ),
              page,
              record,
            );
            record.authenticated = true;
            const form = page.locator(
              pageName === "trials"
                ? "#trial-create-form"
                : "#referral-create-form",
            );
            const controls = await form.locator("input, button").all();
            const heights = await Promise.all(
              controls.map(
                async (node) => (await node.boundingBox())?.height ?? 0,
              ),
            );
            assert.ok(
              heights.length > 1 && heights.every((height) => height >= 44),
              pageName +
                " touch target is too small: " +
                JSON.stringify(heights),
            );
            record.minTouchHeight = Math.min(...heights);
            const route = `/api/crm/${pageName}`;
            const requestPromise = page.waitForRequest(
              (req) =>
                new URL(req.url()).pathname === route &&
                req.method() === "POST",
              { timeout: 12_000 },
            );
            const responsePromise = page.waitForResponse(
              (res) =>
                new URL(res.url()).pathname === route &&
                res.request().method() === "POST",
              { timeout: 12_000 },
            );
            await form
              .locator('[name="leadId"], [name="referrerLeadId"]')
              .fill(leadId);
            const referralMarker =
              pageName === "referrals"
                ? "Prova de indicação E2E-" + process.pid + "-" + Date.now()
                : null;
            if (referralMarker)
              await form.locator('[name="referredName"]').fill(referralMarker);
            await bounded(
              "submit-crm-mutation",
              () => form.locator('button[type="submit"]').click(),
              page,
              record,
            );
            const [request, response] = await bounded(
              "wait-for-crm-mutation-response",
              () => Promise.all([requestPromise, responsePromise]),
              page,
              record,
            );
            const csrf = request.headers()["x-csrf-token"];
            assert.ok(
              typeof csrf === "string" && csrf.length >= 10,
              pageName + " missing CSRF header",
            );
            record.csrf = true;
            record.mutationStatus = response.status();
            assert.ok(
              response.ok(),
              pageName + " action rejected: HTTP " + response.status(),
            );
            // Browser POST response bodies can be held by Chromium despite a
            // completed 200 and a successful application-side fetch. In that
            // case, use a distinct authenticated GET to verify persistence.
            let createdId = null;
            if (pageName === "trials") {
              const json = await bounded(
                "parse-trial-mutation-body",
                () => response.json(),
                page,
                record,
              );
              assert.ok(json?.data, "trials action missing persisted data");
              createdId = Number(json.data.id);
              assert.ok(
                Number.isSafeInteger(createdId) && createdId > 0,
                "trials creation missing new record ID",
              );
            }
            const successId =
              pageName === "trials"
                ? "#trial-create-status"
                : "#referral-create-status";
            await bounded(
              "wait-for-mutation-status",
              () =>
                page.waitForFunction(
                  (id) =>
                    /criado com sucesso|Salvo\./u.test(
                      document.querySelector(id)?.textContent || "",
                    ),
                  successId,
                  { timeout: 10_000 },
                ),
              page,
              record,
            );
            const verifiedGet = await bounded(
              "independent-authenticated-crm-get",
              () => context.request.get(origin + route, { timeout: 10_000 }),
              page,
              record,
            );
            assert.equal(
              verifiedGet.status(),
              200,
              pageName + " independent GET rejected",
            );
            const verifiedPayload = await bounded(
              "parse-independent-crm-get",
              () => verifiedGet.json(),
              page,
              record,
            );
            assert.ok(
              Array.isArray(verifiedPayload?.data),
              pageName + " independent GET missing list",
            );
            if (pageName === "referrals") {
              const created = verifiedPayload.data.filter(
                (item) =>
                  item.referredName === referralMarker &&
                  Number(item.referrerLeadId) === Number(leadId),
              );
              assert.equal(
                created.length,
                1,
                "referrals unique created record missing from DB-backed GET",
              );
              createdId = Number(created[0].id);
            } else {
              assert.ok(
                verifiedPayload.data.some(
                  (item) => Number(item.id) === createdId,
                ),
                "trials created record missing from DB-backed GET",
              );
            }
            assert.ok(
              Number.isSafeInteger(createdId) && createdId > 0,
              pageName + " missing persisted ID",
            );
            const listSelector =
              pageName === "trials" ? "#trials-list" : "#referrals-list";
            const createdHeading =
              (pageName === "trials" ? "Trial #" : "Registro #") + createdId;
            await bounded(
              "wait-for-persisted-record-readback",
              () =>
                page.waitForFunction(
                  ({ listSelector, createdHeading }) =>
                    Array.from(
                      document.querySelectorAll(listSelector + " h2"),
                    ).some(
                      (heading) =>
                        heading.textContent?.trim() === createdHeading,
                    ),
                  { listSelector, createdHeading },
                  { timeout: 10_000 },
                ),
              page,
              record,
            );
            const listControls = await page
              .locator(listSelector + " :is(input, button)")
              .all();
            const listHeights = await Promise.all(
              listControls.map(
                async (node) => (await node.boundingBox())?.height ?? 0,
              ),
            );
            assert.ok(
              listHeights.length > 0 &&
                listHeights.every((height) => height >= 44),
              pageName +
                " rendered list touch target is too small: " +
                JSON.stringify(listHeights),
            );
            record.minTouchHeight = Math.min(
              record.minTouchHeight,
              ...listHeights,
            );
            record.persistedId = createdId;
            record.readback = true;
            record.pageErrors = errors.length;
            assert.deepEqual(errors, [], pageName + " JS errors");
            record.stage = "complete";
            record.failures = failures;
            evidence.pages.push(record);
          } catch (error) {
            record.url = page.url();
            record.pageErrors = errors.length;
            record.errors = errors.slice(0, 8);
            record.failures = failures.slice(0, 12);
            record.error =
              error instanceof Error
                ? error.message.slice(0, 350)
                : "NON_ERROR";
            evidence.pages.push(record);
            console.error("CRM_HTML_BROWSER_FAILURE", JSON.stringify(record));
            try {
              await page.screenshot({
                path: `/tmp/crm-m141-evidence/${pageName}-failure.png`,
                fullPage: true,
                timeout: 5_000,
              });
            } catch {}
            throw error;
          } finally {
            await context.close({ reason: "CRM browser proof finalization" });
          }
        }
        evidence.result = "PASS";
      } finally {
        mkdirSync("/tmp/crm-m141-evidence", { recursive: true });
        writeFileSync(
          "/tmp/crm-m141-evidence/crm-html-browser-evidence.json",
          JSON.stringify(evidence, null, 2) + "\n",
        );
        await browser.close();
      }
      assert.equal(evidence.result, "PASS");
    },
  );
}
