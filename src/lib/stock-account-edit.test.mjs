import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('../app/api/admin/stock-accounts/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);

function setup({ status = 'full', concurrent = false, authorized = true } = {}) {
  const existing = { max_slot: 10, current_used_slot: 10, status, updated_at: '2026-11-01T01:00:00Z' };
  let write;
  const tags = [];
  const filters = [];
  const client = { from: () => {
    let updating = false;
    const query = {
      select: () => query,
      eq: (key, value) => { if (updating) filters.push([key, value]); return query; },
      single: async () => ({ data: existing, error: null }),
      update: data => { updating = true; write = data; return query; },
      maybeSingle: async () => ({ data: concurrent ? null : { id: 1, ...write }, error: null }),
    };
    return query;
  } };
  const context = { exports: {}, require: name => {
    if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name === '@/lib/supabase') return { supabaseAdmin: client };
    if (name === '@/lib/auth') return { getAdminFromRequest: async () => authorized ? { id: 1 } : null };
    if (name === '@/lib/crypto') return { encrypt: value => `encrypted:${value}` };
    if (name === 'next/cache') return { revalidateTag: (...args) => tags.push(args) };
    throw new Error(name);
  } };
  vm.runInNewContext(outputText, context);
  return {
    put: body => context.exports.PUT({ json: async () => ({ id: 1, ...body }) }),
    get write() { return write; }, tags, filters,
  };
}

test('editing usage reopens full stock and invalidates the catalog', async () => {
  const env = setup();
  const result = await env.put({ current_used_slot: 4 });
  assert.equal(result.status, 200);
  assert.equal(env.write.max_slot, 10);
  assert.equal(env.write.current_used_slot, 4);
  assert.equal(env.write.status, 'active');
  assert.equal(env.tags[0][0], 'public-home-catalog');
  assert.equal(env.tags[0][1].expire, 0);
  assert.ok(env.filters.some(([key, value]) => key === 'current_used_slot' && value === 10));
});

test('capacity can increase and filling an account marks it full', async () => {
  const env = setup();
  assert.equal((await env.put({ max_slot: 12 })).status, 200);
  assert.equal(env.write.max_slot, 12);
  assert.equal(env.write.status, 'active');
  const active = setup({ status: 'active' });
  await active.put({ max_slot: 10, current_used_slot: 10 });
  assert.equal(active.write.status, 'full');
});

test('disabled stock stays disabled after correcting capacity', async () => {
  for (const status of ['inactive', 'suspended', 'broken', 'expired']) {
    const env = setup({ status });
    await env.put({ max_slot: 12 });
    assert.equal(env.write.status, status);
  }
});

test('invalid counts cannot be saved', async () => {
  for (const body of [{ max_slot: 0 }, { max_slot: -1 }, { max_slot: 1.5 }, { current_used_slot: -1 }, { current_used_slot: 11 }, { current_used_slot: '4' }]) {
    const env = setup();
    assert.equal((await env.put(body)).status, 400);
    assert.equal(env.write, undefined);
    assert.equal(env.tags.length, 0);
  }
});

test('stale forms and concurrent purchases cannot overwrite stock', async () => {
  const stale = setup();
  assert.equal((await stale.put({ expected_updated_at: 'old', current_used_slot: 2 })).status, 409);
  assert.equal(stale.write, undefined);
  const concurrent = setup({ concurrent: true });
  assert.equal((await concurrent.put({ current_used_slot: 2 })).status, 409);
  assert.equal(concurrent.tags.length, 0);
});

test('stock editing requires an admin session', async () => {
  const env = setup({ authorized: false });
  assert.equal((await env.put({ current_used_slot: 2 })).status, 401);
  assert.equal(env.write, undefined);
});
