import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./buyerOrdersClient.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);

function setup(responses, session = { access_token: 'supabase-session' }) {
  const storage = new Map([['buyer_token', 'expired-buyer-token']]);
  const requests = [];
  let sessionReads = 0;
  const context = {
    AbortSignal,
    exports: {},
    require: () => ({
      supabase: { auth: { getSession: async () => {
        sessionReads++;
        return { data: { session }, error: null };
      } } },
    }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      const next = responses.shift();
      assert.ok(next, 'Unexpected extra request');
      if (next instanceof Error) throw next;
      return {
        ok: next.status >= 200 && next.status < 300,
        status: next.status,
        json: async () => next.body,
      };
    },
  };
  vm.runInNewContext(outputText, context);
  return { ...context.exports, storage, requests, sessionReads: () => sessionReads };
}

test('expired app token renews through Supabase and retrieves existing orders', async () => {
  const orders = [{ id: 42, order_number: 'PP-EXISTING' }];
  const buyer = { id: 7, name: 'Buyer', email: 'buyer@example.com', phone: '08123456789' };
  const client = setup([
    { status: 401, body: { error: 'Unauthorized' } },
    { status: 200, body: { token: 'renewed-buyer-token', buyer } },
    { status: 200, body: { orders } },
  ]);

  assert.deepEqual(await client.fetchBuyerOrders(), orders);
  assert.equal(client.storage.get('buyer_token'), 'renewed-buyer-token');
  assert.deepEqual(JSON.parse(client.storage.get('buyer_session')), buyer);
  assert.equal(client.requests[1].url, '/api/buyer/auth/exchange');
  assert.equal(client.requests[1].headers.Authorization, 'Bearer supabase-session');
  assert.equal(client.requests[2].headers.Authorization, 'Bearer renewed-buyer-token');
});

test('missing Supabase session requires login instead of returning empty history', async () => {
  const client = setup([{ status: 401, body: {} }], null);
  await assert.rejects(client.fetchBuyerOrders(), error => error.status === 401);
  assert.equal(client.requests.length, 1);
});

test('failed or forbidden exchange is reported and never overwrites the stored token', async () => {
  for (const status of [401, 403, 500]) {
    const client = setup([
      { status: 401, body: {} },
      { status, body: { error: 'Exchange failed' } },
    ]);
    await assert.rejects(client.fetchBuyerOrders(), error => error.status === status);
    assert.equal(client.storage.get('buyer_token'), 'expired-buyer-token');
    assert.equal(client.requests.length, 2);
  }
});

test('a rejected renewed token is not retried indefinitely', async () => {
  const client = setup([
    { status: 401, body: {} },
    { status: 200, body: { token: 'renewed', buyer: { id: 7 } } },
    { status: 401, body: {} },
  ]);
  await assert.rejects(client.fetchBuyerOrders(), error => error.status === 401);
  assert.equal(client.requests.length, 3);
});

test('server, network and malformed response failures are not empty order histories', async () => {
  for (const response of [
    { status: 500, body: { error: 'Database unavailable' } },
    { status: 200, body: {} },
    new Error('Offline'),
  ]) {
    const client = setup([response]);
    await assert.rejects(client.fetchBuyerOrders());
    assert.equal(client.sessionReads(), 0);
  }
});

test('a successful empty history remains a valid result', async () => {
  const client = setup([{ status: 200, body: { orders: [] } }]);
  assert.deepEqual(await client.fetchBuyerOrders(), []);
  assert.equal(client.sessionReads(), 0);
});
