const { chromium } = require('/tmp/pw/node_modules/playwright');
const candidate = 'e0d35bb2ec8d65861a4f64ceb3959617390c1071';
const pagePath = '/apps/morro-digital-platform/public/business-onboarding.html';
const clean = v => String(v ?? '').replace(/[\r\n]/g, ' ').slice(0, 400);

async function secure(page, name) {
  for (let i = 0; i < 120; i += 1) {
    for (const frame of page.frames()) {
      const locator = frame.locator(`input[name="${name}"]`).first();
      try {
        if ((await locator.count()) && (await locator.isVisible())) return locator;
      } catch {}
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`SECURE_FIELD_MISSING:${name}`);
}

async function typeSecure(page, name, value) {
  const locator = await secure(page, name);
  await locator.click();
  await locator.pressSequentially(value, { delay: 45 });
  await locator.press('Tab').catch(() => undefined);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageUrl = `${process.env.STAGING_URL}${pagePath}`;
    const initial = await page.goto(pageUrl, { waitUntil: 'load', timeout: 60_000 });
    if (!initial || initial.status() !== 200) throw new Error(`STAGING_HTTP_${initial?.status() ?? 0}`);

    await page.waitForFunction(() => Boolean(globalThis.__MORRO_RUNTIME_ENV__), null, { timeout: 20_000 });
    const hasPublicKey = await page.evaluate(() => Boolean(globalThis.__MORRO_RUNTIME_ENV__?.VITE_MERCADO_PAGO_PUBLIC_KEY));
    if (!hasPublicKey) throw new Error('TEST_PUBLIC_KEY_NOT_AVAILABLE');

    await page.evaluate(() => {
      globalThis.__FINAL3 = { verified: null, failed: null };
      addEventListener('businessPaymentVerified', event => { globalThis.__FINAL3.verified = event.detail; });
      addEventListener('businessPaymentVerificationFailed', event => { globalThis.__FINAL3.failed = event.detail; });
    });
    await page.waitForTimeout(2200);

    const acceptedAt = new Date().toISOString();
    const sessionId = `provider_final3_${Date.now()}`;
    const handoff = {
      sessionId,
      planId: 'provider_acceptance_test',
      contractor: {
        name: 'Morro Digital Provider Acceptance',
        email: 'payments.acceptance.20260824@example.com',
        phone: '+55 75 99999-0000',
        document: '12345678909',
      },
      businessDraft: {
        demoBusinessId: 'provider-final3',
        displayName: 'Morro Digital Provider Acceptance',
        categoryId: 'restaurant',
        specialty: 'Provider TEST',
        environment: 'sandbox',
        publishable: false,
      },
      acceptedTerms: [
        { type: 'terms', version: 'terms_v1', acceptedAt },
        { type: 'privacy', version: 'privacy_v1', acceptedAt },
      ],
      returnUrl: pageUrl,
      tutorial: false,
      requiresPaymentsCapability: true,
    };

    const checkoutPromise = page.waitForResponse(
      response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/payments/v1/checkouts',
      { timeout: 30_000 },
    );
    await page.evaluate(detail => dispatchEvent(new CustomEvent('businessCheckoutRequested', { detail })), handoff);
    const checkoutResponse = await checkoutPromise;
    const checkoutBody = await checkoutResponse.json();
    const checkoutId = checkoutBody?.data?.checkoutId;
    if (checkoutResponse.status() !== 201 || !String(checkoutId || '').startsWith('ord_')) {
      throw new Error(`CHECKOUT_FAILED:${checkoutResponse.status()}:${clean(checkoutBody?.error)}`);
    }

    const overlay = page.locator('[data-morro-payments-brick="card"]');
    await overlay.waitFor({ state: 'visible', timeout: 30_000 });
    await typeSecure(page, 'cardNumber', ['5480', '8328', '0103', '3311'].join(''));
    await page.waitForTimeout(1200);
    await typeSecure(page, 'expirationDate', '1130');
    await typeSecure(page, 'securityCode', '123');

    const holder = overlay.locator('input[name="HOLDER_NAME"]').first();
    await holder.fill('APRO');
    await holder.press('Tab');

    const documentSelect = overlay.locator('select').first();
    if (await documentSelect.count()) {
      const options = await documentSelect.locator('option').evaluateAll(nodes =>
        nodes.map(node => ({ value: node.value, text: (node.textContent || '').trim() })),
      );
      const cpf = options.find(option => /CPF/iu.test(option.text) && option.value);
      if (cpf) await documentSelect.selectOption(cpf.value);
    }
    const documentField = overlay.locator('input[name="DOCUMENT"]').first();
    await documentField.fill(['123', '456', '789', '09'].join(''));
    await documentField.press('Tab');

    await overlay.getByText('Selecione o número de parcelas', { exact: false }).waitFor({ state: 'visible', timeout: 20_000 });
    const installmentClick = await overlay.evaluate(root => {
      const labels = Array.from(root.querySelectorAll('label'));
      const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
      const target = labels.find(label => /^1x\b/iu.test(normalize(label.textContent)));
      if (!target) return { clicked: false, labels: labels.map(label => normalize(label.textContent)).filter(Boolean).slice(0, 20) };
      const text = normalize(target.textContent);
      target.click();
      return { clicked: true, text };
    });
    if (!installmentClick.clicked) throw new Error(`INSTALLMENT_LABEL_NOT_FOUND:${JSON.stringify(installmentClick.labels)}`);
    await page.waitForFunction(() => {
      const text = (document.querySelector('[data-morro-payments-brick="card"]')?.textContent || '').replace(/\s+/g, ' ');
      return !/Escolha uma opção para avançar/iu.test(text) && !/Preencha todos os dados para continuar/iu.test(text);
    }, null, { timeout: 10_000 });

    const cardPromise = page.waitForResponse(response => {
      const pathname = new URL(response.url()).pathname;
      return response.request().method() === 'POST' && /\/api\/payments\/v1\/checkouts\/ord_[^/]+\/card$/u.test(pathname);
    }, { timeout: 45_000 });
    await overlay.locator('button[type="submit"]').first().click();
    const cardResponse = await cardPromise;
    const cardBody = await cardResponse.json();
    if (!cardResponse.ok()) throw new Error(`CARD_FAILED:${cardResponse.status()}:${clean(cardBody?.error)}`);

    await page.waitForFunction(() => Boolean(globalThis.__FINAL3?.verified || globalThis.__FINAL3?.failed), null, { timeout: 120_000 });
    const outcome = await page.evaluate(() => globalThis.__FINAL3);
    if (outcome?.failed) throw new Error(`VERIFICATION_FAILED:${clean(outcome.failed.code)}`);
    if (!outcome?.verified?.verified) throw new Error('VERIFICATION_NOT_CONFIRMED');

    console.log('PROVIDER_FINAL3_CARD_E2E=' + JSON.stringify({
      candidate,
      staging: true,
      realMoney: false,
      realCard: false,
      checkoutId,
      checkoutHttp: checkoutResponse.status(),
      cardHttp: cardResponse.status(),
      cardStatus: cardBody?.data?.status ?? null,
      verified: true,
      reference: outcome.verified.reference ?? null,
      activationStatus: outcome.verified.activationStatus ?? null,
    }));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('PROVIDER_FINAL3_CARD_E2E_FAILED=' + (error?.stack || error));
  process.exit(1);
});
