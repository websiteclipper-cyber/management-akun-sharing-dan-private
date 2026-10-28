import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const env = { KIPAY_API_KEY: 'synthetic-project-key', KIPAY_ENV: 'sandbox', KIPAY_WEBHOOK_SECRET: 'synthetic-webhook-secret' };
const transaction = {
  trx_id: 'SBX-20261028-TEST01', mode: 'sandbox', requested_amount: 10000,
  amount: 10215, status: 'pending', note: 'PP-TEST', expires_at: '2026-10-28 12:15:00',
  qr_payload: '000201-test', qr_url: 'https://api.kipay.id/api/pay/synthetic-project-key/qr.png',
};
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };

function load(path, dependencies = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const context = {
    exports: {}, Buffer, Headers, Response, Request, AbortSignal,
    process: { env }, console: { error() {} },
    require: name => {
      assert.ok(name in dependencies, `Unexpected import ${name}`);
      return dependencies[name];
    }, ...globals,
  };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

function client(fetch = async () => Response.json(transaction), overrides = {}) {
  return load('./kipay.ts', { 'node:crypto': crypto }, { fetch, process: { env: { ...env, ...overrides } } });
}

const { KiPayApiError } = client();

function signedHeaders(body, timestamp = new Date().toISOString()) {
  const delivery = 'delivery-test';
  const signature = createHmac('sha256', env.KIPAY_WEBHOOK_SECRET).update(`${timestamp}.${delivery}.${body}`).digest('hex');
  return new Headers({ 'content-type': 'application/json', 'x-webhook-timestamp': timestamp,
    'x-webhook-delivery': delivery, 'x-webhook-signature': `sha256=${signature}`, 'x-webhook-event': 'transaction.paid' });
}

test('KiPay POST uses server credentials, order reference and base amount; removes credential-bearing URL', async () => {
  let request;
  const api = client(async (url, init) => { request = { url, ...init }; return Response.json(transaction); });
  const created = await api.createKiPayTransaction('PP-TEST', 10000);
  assert.equal(request.url, 'https://api.kipay.id/api/pay/synthetic-project-key/transactions');
  assert.deepEqual(JSON.parse(request.body), { amount: 10000, note: 'PP-TEST' });
  assert.equal(request.cache, 'no-store');
  assert.equal(request.redirect, 'error');
  assert.equal(created.amount, 10215);
  assert.ok(!JSON.stringify(created).includes(env.KIPAY_API_KEY));
  assert.equal(created.qr_url, undefined);
});

test('KiPay rejects amount, reference, mode and transaction-ID mismatches', async () => {
  for (const changes of [{ amount: 9999 }, { requested_amount: 10001 }, { note: 'OTHER' }, { mode: 'production' }, { status: 'paid' }]) {
    await assert.rejects(client(async () => Response.json({ ...transaction, ...changes })).createKiPayTransaction('PP-TEST', 10000));
  }
  await assert.rejects(client().getKiPayTransaction('OTHER'));
  for (const amount of [0, -1, 1.5, NaN, Infinity]) await assert.rejects(client().createKiPayTransaction('PP-TEST', amount));
});

test('upstream errors cannot disclose a credential URL or upstream body', async () => {
  for (const fetch of [
    async url => { throw new Error(`fetch failed: ${url}`); },
    async () => new Response(env.KIPAY_API_KEY, { status: 500 }),
    async () => new Response('invalid JSON'),
  ]) {
    await assert.rejects(client(fetch).createKiPayTransaction('PP-TEST', 10000), error => !String(error).includes(env.KIPAY_API_KEY));
  }
});

test('QR images are fetched server-side and returned as PNG data, never a remote secret URL', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const api = client(async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
  assert.equal(await api.getKiPayQrImage(transaction.trx_id), `data:image/png;base64,${png.toString('base64')}`);
  await assert.rejects(client(async () => new Response('<html>no</html>', { headers: { 'content-type': 'image/png' } })).getKiPayQrImage(transaction.trx_id));
});

test('webhook HMAC binds raw body, timestamp and delivery ID and rejects stale or future replays', () => {
  const api = client();
  const body = JSON.stringify({ event: 'transaction.paid', transaction });
  const headers = signedHeaders(body);
  assert.equal(api.verifyKiPayWebhook(body, headers), true);
  assert.equal(api.verifyKiPayWebhook(`${body} `, headers), false);
  const altered = new Headers(headers);
  altered.set('x-webhook-delivery', 'other');
  assert.equal(api.verifyKiPayWebhook(body, altered), false);
  altered.set('x-webhook-signature', 'sha256=broken');
  assert.equal(api.verifyKiPayWebhook(body, altered), false);
  for (const delta of [-301000, 301000]) {
    assert.equal(api.verifyKiPayWebhook(body, signedHeaders(body, new Date(Date.now() + delta).toISOString())), false);
  }
  assert.equal(client(undefined, { KIPAY_WEBHOOK_SECRET: '' }).verifyKiPayWebhook(body, headers), false);
});

// A small stateful query fake exercises actual compare-and-set filters and retry paths.
function database(rows) {
  return {
    from(table) {
      let values, operation = 'read';
      const filters = [];
      const query = {
        select: () => query, order: () => query, limit: () => query,
        eq: (key, value) => { filters.push(row => row[key] === value); return query; },
        is: (key, value) => { filters.push(row => row[key] === value); return query; },
        in: (key, value) => { filters.push(row => value.includes(row[key])); return query; },
        update: value => { values = value; operation = 'update'; return query; },
        insert: value => { values = value; operation = 'insert'; return query; },
        maybeSingle: async () => execute(true), single: async () => execute(true),
        then: (resolve, reject) => Promise.resolve(execute(false)).then(resolve, reject),
      };
      function execute(single) {
        if (operation === 'insert') {
          const row = { id: (rows[table]?.length || 0) + 1, ...values };
          (rows[table] ||= []).push(row);
          return { data: single ? row : [row], error: null };
        }
        const matches = (rows[table] || []).filter(row => filters.every(filter => filter(row)));
        if (operation === 'update') matches.forEach(row => Object.assign(row, values));
        const results = matches.map(row => ({ ...row }));
        return { data: single ? results[0] || null : results, error: null };
      }
      return query;
    },
  };
}

function checkoutSetup(createTransaction = async () => client().normalizeKiPayTransaction(transaction)) {
  const rows = { orders: [{ id: 1, order_number: 'PP-TEST', total_amount: 10000, payment_status: 'pending_payment', payment_reference: null }], payments: [] };
  const db = database(rows);
  let creates = 0;
  const helpers = { getStoredCreateData: payment => payment.payload_raw?.create };
  const checkout = load('./kipay-checkout.ts', {
    'next/server': next, '@/lib/supabase': { supabaseAdmin: db },
    '@/lib/klikqris-payment': helpers,
    '@/lib/kipay-payment': {
      findKiPayPayment: async id => rows.payments.find(row => row.order_id === id) || null,
      kiPayCreateData: value => ({ ...value, total_amount: value.amount }),
    },
    '@/lib/kipay': {
      KiPayApiError,
      getKiPayConfig: () => ({}), getKiPayQrImage: async () => 'data:image/png;base64,test',
      createKiPayTransaction: async (...args) => { creates++; return createTransaction(...args); },
    },
  });
  return { ...checkout, rows, creates: () => creates };
}

test('checkout reuses one transaction across simultaneous requests and refreshes', async () => {
  const checkout = checkoutSetup();
  const order = checkout.rows.orders[0];
  await Promise.all([checkout.createOrLoadKiPayPayment(order), checkout.createOrLoadKiPayPayment(order)]);
  const response = await checkout.createOrLoadKiPayPayment(order);
  assert.equal(checkout.creates(), 1);
  assert.equal(checkout.rows.payments.length, 1);
  const result = await response.json();
  assert.equal(result.payment.total_amount, 10215);
  assert.equal(result.payment.amount, 10000);
  assert.equal(result.payment.qris_url, null);
  assert.ok(!JSON.stringify(result).includes(env.KIPAY_API_KEY));
  assert.ok(!JSON.stringify(checkout.rows.payments).includes(env.KIPAY_API_KEY));
});

test('an ambiguous creation failure is not automatically retried and cannot create a second payable invoice', async () => {
  const checkout = checkoutSetup(async () => { throw new Error('timeout'); });
  await assert.rejects(checkout.createOrLoadKiPayPayment(checkout.rows.orders[0]), /timeout/);
  const response = await checkout.createOrLoadKiPayPayment(checkout.rows.orders[0]);
  assert.equal(response.status, 409);
  assert.equal(checkout.creates(), 1);
});

test('documented create rejections release the claim so corrected configuration can retry', async () => {
  for (const status of [400, 404, 409]) {
    let attempts = 0;
    const checkout = checkoutSetup(async () => {
      if (attempts++ === 0) throw new KiPayApiError(status);
      return client().normalizeKiPayTransaction(transaction);
    });
    const order = checkout.rows.orders[0];
    await assert.rejects(checkout.createOrLoadKiPayPayment(order), error => error.httpStatus === status);
    assert.equal(order.payment_reference, null);
    const response = await checkout.createOrLoadKiPayPayment(order);
    assert.equal(response.status, 200);
    assert.equal(checkout.rows.payments.length, 1);
  }
});

test('upstream server failures keep the claim because invoice creation is uncertain', async () => {
  const checkout = checkoutSetup(async () => { throw new KiPayApiError(500); });
  const order = checkout.rows.orders[0];
  await assert.rejects(checkout.createOrLoadKiPayPayment(order));
  assert.equal(order.payment_reference, 'kipay-creating');
  assert.equal((await checkout.createOrLoadKiPayPayment(order)).status, 409);
  assert.equal(checkout.creates(), 1);
});

test('expired checkout records stay closed without creating another transaction', async () => {
  const checkout = checkoutSetup();
  await checkout.createOrLoadKiPayPayment(checkout.rows.orders[0]);
  checkout.rows.payments[0].status = 'failed';
  const response = await checkout.createOrLoadKiPayPayment(checkout.rows.orders[0]);
  assert.equal((await response.json()).status, 'EXPIRED');
  assert.equal(checkout.creates(), 1);
});

function syncSetup(detail) {
  const payment = { id: 1, order_id: 1, status: 'pending', amount: 10215, gateway_reference: transaction.trx_id,
    payload_raw: { create: { ...transaction, qr_url: undefined, total_amount: 10215 } } };
  const rows = { payments: [payment], orders: [{ id: 1, payment_status: 'pending_payment' }] };
  let confirmations = 0;
  const service = load('./kipay-payment.ts', {
    '@/lib/supabase': { supabaseAdmin: database(rows) },
    '@/lib/kipay': { getKiPayTransaction: async () => detail },
    '@/lib/klikqris-payment': {
      getStoredCreateData: value => value.payload_raw.create,
      completeGatewayPayment: async confirmation => {
        confirmations++;
        assert.equal(confirmation.amount, 10000);
        assert.equal(confirmation.totalAmount, 10215);
        assert.equal(confirmation.gatewayReference, transaction.trx_id);
        return { newlyPaid: true, assigned: true };
      },
    },
  });
  return { ...service, payment, rows, confirmations: () => confirmations };
}

test('payment verification uses current API status and rejects mismatched amounts, notes and modes', async () => {
  for (const changes of [{ amount: 10216 }, { requested_amount: 9999 }, { note: 'OTHER' }, { mode: 'production' }]) {
    const service = syncSetup({ ...transaction, status: 'paid', ...changes });
    await assert.rejects(service.syncKiPayPayment(service.payment, 'PP-TEST'));
    assert.equal(service.confirmations(), 0);
  }
  const service = syncSetup({ ...transaction, status: 'paid' });
  assert.equal((await service.syncKiPayPayment(service.payment, 'PP-TEST')).status, 'paid');
  assert.equal(service.confirmations(), 1);
});

test('expired confirmations fail pending orders but cannot downgrade paid orders', async () => {
  for (const status of ['pending_payment', 'paid']) {
    const service = syncSetup({ ...transaction, status: 'expired' });
    service.rows.orders[0].payment_status = status;
    if (status === 'paid') service.payment.status = 'success';
    await service.syncKiPayPayment(service.payment, 'PP-TEST');
    assert.equal(service.rows.orders[0].payment_status, status === 'paid' ? 'paid' : 'failed');
    assert.equal(service.payment.status, status === 'paid' ? 'success' : 'failed');
    assert.equal(service.confirmations(), 0);
  }
});

test('webhook route rejects forgery before querying storage and confirms signed events through API', async () => {
  let syncs = 0, reads = 0;
  const rows = { payments: [{ id: 1, order_id: 1, gateway_name: 'kipay', gateway_reference: transaction.trx_id }], orders: [{ id: 1, order_number: 'PP-TEST' }] };
  const db = database(rows);
  const route = load('../app/api/webhooks/kipay/route.ts', {
    'next/server': next, '@/lib/kipay': client(),
    '@/lib/supabase': { supabaseAdmin: { from: table => { reads++; return db.from(table); } } },
    '@/lib/kipay-payment': { syncKiPayPayment: async () => { syncs++; return { status: 'pending', synced: false }; } },
  });
  const body = JSON.stringify({ event: 'transaction.paid', transaction: { trx_id: transaction.trx_id, status: 'paid' } });
  const headers = signedHeaders(body);
  const forged = new Headers(headers);
  forged.set('x-webhook-signature', `sha256=${'0'.repeat(64)}`);
  const send = (value, requestHeaders) => route.POST(new Request('https://example.com/api/webhooks/kipay', { method: 'POST', headers: requestHeaders, body: value }));
  assert.equal((await send(body, forged)).status, 401);
  assert.equal(reads, 0);
  const response = await send(body, headers);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'pending');
  assert.equal(syncs, 1);
  rows.payments = [];
  assert.equal((await send(body, headers)).status, 503);
});

test('webhook rejects oversized bodies and accepts signed dashboard test events', async () => {
  const route = load('../app/api/webhooks/kipay/route.ts', {
    'next/server': next, '@/lib/kipay': client(), '@/lib/supabase': {}, '@/lib/kipay-payment': {},
  });
  const body = JSON.stringify({ event: 'webhook.test' });
  const headers = signedHeaders(body);
  headers.set('x-webhook-event', 'webhook.test');
  assert.equal((await route.POST(new Request('https://example.com', { method: 'POST', headers, body }))).status, 200);
  assert.equal((await route.POST(new Request('https://example.com', { method: 'POST', headers, body: 'a'.repeat(65537) }))).status, 413);
});

test('repeated and concurrent confirmations deliver at most the purchased quantity and notify once', async () => {
  const rows = {
    orders: [{ id: 1, order_number: 'PP-TEST', product_id: 2, reseller_id: null, quantity: 2, total_amount: 10000, payment_status: 'pending_payment' }],
    payments: [{ id: 1, order_id: 1, gateway_name: 'kipay', gateway_reference: transaction.trx_id, amount: 10215,
      status: 'pending', payload_raw: { create: { ...transaction, total_amount: 10215 } } }],
    account_assignments: [], products: [{ id: 2, name: 'Test product' }],
  };
  let notifications = 0;
  const db = database(rows);
  db.rpc = async () => {
    if (rows.account_assignments.length >= 2) return { data: { success: true, already_assigned: true } };
    const id = rows.account_assignments.length + 1;
    rows.account_assignments.push({ id, order_id: 1, status: 'active' });
    return { data: { success: true, assignment_id: id } };
  };
  const service = load('./klikqris-payment.ts', {
    '@/lib/supabase': { supabaseAdmin: db },
    '@/lib/telegram': { sendTelegramNotification: () => { notifications++; } },
    '@/lib/product-stock': { getAvailableStock: async () => 10 },
  });
  const confirmation = { gatewayName: 'kipay', gatewayReference: transaction.trx_id, orderNumber: 'PP-TEST', amount: 10000, totalAmount: 10215, payload: {} };
  await assert.rejects(service.completeGatewayPayment({ ...confirmation, totalAmount: 10216 }));
  assert.equal(rows.orders[0].payment_status, 'pending_payment');
  const results = await Promise.all([service.completeGatewayPayment(confirmation), service.completeGatewayPayment(confirmation)]);
  await service.completeGatewayPayment(confirmation);
  assert.equal(results.filter(value => value.newlyPaid).length, 1);
  assert.equal(rows.account_assignments.length, 2);
  assert.equal(notifications, 1);
  assert.equal(rows.orders[0].payment_status, 'paid');
  assert.equal(rows.orders[0].payment_reference, transaction.trx_id);
  assert.equal(rows.payments[0].status, 'success');
});

test('checkout requires an active buyer and rejects another buyer\'s order before any provider request', async () => {
  for (const access of [null, { status: 'banned', buyer: { id: 7 } }, { status: 'active', buyer: { id: 7 } }]) {
    const route = load('../app/api/public/payments/create/route.ts', {
      'next/server': next, '@/lib/kipay-checkout': {}, '@/lib/kipay-payment': {}, '@/lib/klikqris': {}, '@/lib/klikqris-payment': {},
      '@/lib/auth': { getBuyerAccessFromRequest: async () => access },
      '@/lib/buyerBan': {},
      '@/lib/supabase': { supabaseAdmin: database({ orders: [{ id: 1, buyer_id: 8, order_number: 'PP-TEST' }] }) },
      '@/lib/publicApiSecurity': { consumePublicRateLimit: async () => ({ limited: false }), readJsonBody: async () => ({ order_number: 'PP-TEST' }) },
    });
    const response = await route.POST(new Request('https://example.com', { method: 'POST' }));
    assert.equal(response.status, !access ? 401 : access.status !== 'active' ? 403 : 404);
  }
});
