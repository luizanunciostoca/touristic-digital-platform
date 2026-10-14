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
