import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./public-home-data.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);

function setup() {
  let failure;
  let queryCount = 0;
  let products = [{ id: 1, name: 'Existing product', status: 'active' }];
  let settings = [];
  const caches = new Map();
  const signals = [];
  const service = {
    from(table) {
      queryCount++;
      let allowedKeys;
      const query = {
        select: () => query,
        in: (column, values) => {
          if (column === 'key') allowedKeys = values;
          return query;
        },
        order: () => query,
        eq: () => query,
        lte: () => query,
        gte: () => query,
        abortSignal: signal => { signals.push(signal); return query; },
        then(resolve, reject) {
          return Promise.resolve({
            data: table === 'products' ? products : table === 'site_settings'
              ? settings.filter(row => !allowedKeys || allowedKeys.includes(row.key))
              : [],
            error: failure === table ? new Error('Database unavailable') : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const context = {
    exports: {},
    AbortSignal,
    require(name) {
      if (name === 'next/cache') return {
        unstable_cache: (query, keys) => {
          let value;
          let cached = false;
          const refresh = async () => {
            const fresh = await query();
            value = fresh;
            cached = true;
            return value;
          };
          caches.set(keys[0], { refresh });
          return async () => cached ? value : refresh();
        },
      };
      if (name === '@/lib/supabase') return { getServiceClient: () => service };
      if (name === '@/lib/product-stock') return {
        getAvailableStockByProductIds: async (ids, signal) => {
          signals.push(signal);
          if (failure === 'stock') throw new Error('Stock unavailable');
          return new Map(ids.map(id => [id, 3]));
        },
      };
      if (name === '@/lib/maintenance') return { DEFAULT_MAINTENANCE_ANNOUNCEMENT: '' };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  vm.runInNewContext(outputText, context);
  return {
    getCatalog: context.exports.getPublicCatalog,
    getSettings: context.exports.getPublicSettings,
    setSettings: rows => { settings = rows; },
    refreshSettings: () => caches.get('public-home-settings').refresh(),
    fail: stage => { failure = stage; },
    empty: () => { products = []; },
    queryCount: () => queryCount,
    refresh: () => caches.get('public-home-catalog').refresh(),
    signals,
  };
}

test('failed product, promo or stock load is not cached and the next request can recover', async () => {
  for (const stage of ['products', 'promos', 'stock']) {
    const client = setup();
    client.fail(stage);
    const unavailable = await client.getCatalog();
    assert.equal(unavailable.error, true);
    assert.equal(unavailable.products.length, 0);
    client.fail(undefined);
    const recovered = await client.getCatalog();
    assert.equal(recovered.error, false);
    assert.equal(recovered.products[0].name, 'Existing product');
    assert.equal(recovered.products[0].available_stock, 3);
    assert.equal(client.queryCount(), 4);
    await client.getCatalog();
    assert.equal(client.queryCount(), 4, 'successful data should be reused');
  }
});

test('failed revalidation rejects instead of overwriting a successful catalog with empty data', async () => {
  const client = setup();
  const catalog = await client.getCatalog();
  client.fail('stock');
  await assert.rejects(client.refresh(), /Stock unavailable/);
  assert.equal(await client.getCatalog(), catalog);
  assert.equal(catalog.error, false);
});

test('a genuinely empty catalog is valid and cached, and all queries share one deadline', async () => {
  const client = setup();
  client.empty();
  const catalog = await client.getCatalog();
  assert.equal(catalog.error, false);
  assert.equal(catalog.products.length, 0);
  await client.getCatalog();
  assert.equal(client.queryCount(), 2);
  assert.equal(client.signals.length, 3);
  assert.ok(client.signals[0] instanceof AbortSignal);
  assert.ok(client.signals.every(signal => signal === client.signals[0]));
});

test('public settings exclude legacy global tutorials and private settings', async () => {
  const client = setup();
  const initial = await client.getSettings();
  assert.equal(Object.hasOwn(initial, 'credential_tutorial_content'), false);

  client.setSettings([
    { key: 'support_whatsapp', value: '081234567890' },
    { key: 'credential_tutorial_enabled', value: 'true' },
    { key: 'credential_tutorial_title', value: 'Panduan Login dari Admin' },
    { key: 'credential_tutorial_content', value: 'Tutorial global lama' },
    { key: 'leaderboard_min_commission', value: '50000' },
  ]);
  await client.refreshSettings();
  const saved = await client.getSettings();
  assert.equal(saved.support_whatsapp, '081234567890');
  assert.equal(Object.hasOwn(saved, 'credential_tutorial_enabled'), false);
  assert.equal(Object.hasOwn(saved, 'credential_tutorial_title'), false);
  assert.equal(Object.hasOwn(saved, 'credential_tutorial_content'), false);
  assert.equal(Object.hasOwn(saved, 'leaderboard_min_commission'), false);
});
