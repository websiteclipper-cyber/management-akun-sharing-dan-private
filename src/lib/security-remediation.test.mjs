import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { findSecrets } from '../../scripts/check-secrets.mjs';

function load(path, dependencies, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const context = { exports: {}, ...globals, require: name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };

test('a previously issued reseller token cannot read commissions after deactivation', async () => {
  for (const [row, error, status] of [
    [{ id: 'r1', ref_code: 'TEST', status: 'inactive' }, null, 401],
    [{ id: 'r1', ref_code: 'CHANGED', status: 'active' }, null, 401],
    [null, null, 401],
    [null, { message: 'offline' }, 503],
  ]) {
    const tables = [];
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row, error }) };
    const route = load('../app/api/reseller/dashboard/route.ts', {
      'next/server': next,
      '@/lib/auth': { getResellerFromRequest: () => ({ id: 'r1', ref_code: 'TEST' }) },
      '@/lib/supabase': { supabaseAdmin: { from: table => { tables.push(table); return query; } } },
    });
    const response = await route.GET(new Request('https://example.com/api/reseller/dashboard'));
    assert.equal(response.status, status);
    assert.deepEqual(tables, ['resellers']);
  }
});

test('server configuration rejects public and legacy keys and accepts a modern secret key', () => {
  for (const key of ['sb_publishable_' + 'test', 'legacy-jwt', 'sb_secret_' + 'test']) {
    let configuredKey;
    const service = load('./supabase.ts', {
      '@supabase/supabase-js': { createClient: (_url, value) => { configuredKey = value; return {}; } },
    }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.com', SUPABASE_SERVICE_ROLE_KEY: ` ${key}\n` } } });
    if (key.startsWith('sb_secret_')) {
      service.getServiceClient();
      assert.equal(configuredKey, key);
    } else {
      assert.throws(() => service.getServiceClient(), /must contain a secret API key/);
      assert.equal(configuredKey, undefined);
    }
  }
});

test('secret checks identify reported leak types without returning credential values', () => {
  const jwt = role => [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(JSON.stringify({ role })).toString('base64url'),
    'synthetic-signature',
  ].join('.');
  const fixtures = [
    jwt('service_role'),
    'sb_secret_' + 'synthetic'.repeat(4),
    'postgres' + 'ql://postgres:' + 'synthetic-password' + '@localhost/postgres',
    '-----BEGIN ' + 'PRIVATE KEY-----',
  ];
  for (const fixture of fixtures) {
    const findings = findSecrets(`example\n${fixture}`);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].line, 2);
    assert.ok(!JSON.stringify(findings).includes(fixture));
  }
  assert.deepEqual(findSecrets(jwt('anon')), []);
  assert.deepEqual(findSecrets('sb_publishable_' + 'synthetic'.repeat(4)), []);
  assert.deepEqual(findSecrets('postgres' + 'ql://postgres@localhost/postgres'), []);
});

test('server database client fails closed when privileged configuration is missing', () => {
  let clientsCreated = 0;
  const service = load('./supabase.ts', {
    '@supabase/supabase-js': { createClient: () => { clientsCreated++; return {}; } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.com', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key' } } });
  assert.throws(() => service.getServiceClient(), /configuration is missing/);
  assert.equal(clientsCreated, 0);
  service.getSupabaseClient();
  assert.equal(clientsCreated, 1);
});

test('invalid reseller credentials return the same 401; storage errors remain 503', async () => {
  for (const [row, dbError, expected] of [
    [null, null, 401],
    [{ id: 'r1', status: 'active', pin: 'different' }, null, 401],
    [{ id: 'r1', status: 'inactive', pin: '1234' }, null, 401],
    [null, { message: 'offline' }, 503],
  ]) {
    let failures = 0;
    const query = { select: () => query, eq: () => query, gte: () => query,
      abortSignal: () => query, maybeSingle: async () => ({ data: row, error: dbError }),
      then: resolve => resolve({ count: 0, error: dbError }) };
    const route = load('../app/api/reseller/auth/login/route.ts', {
      'next/server': { ...next, after: () => assert.fail('No maintenance on failed login') },
      '@/lib/supabase': { supabaseAdmin: { from: () => query } },
      '@/lib/auth': { signToken: () => assert.fail('No token on failed login') },
      bcryptjs: { default: { compare: async () => false } },
      '@/lib/resellerAuthSecurity': {
        normalizeResellerRefCode: value => value,
        getResellerClientIp: () => 'test',
        checkResellerRequestRateLimit: () => ({ limited: false }),
        createResellerAuthAbortSignal: () => undefined,
        recordResellerLoginFailure: async () => { failures++; },
      },
    });
    const response = await route.POST(new Request('https://example.com/api/reseller/auth/login', {
      method: 'POST', body: JSON.stringify({ ref_code: 'TEST', pin: '1234' }),
    }));
    assert.equal(response.status, expected);
    if (expected === 401) assert.equal((await response.json()).error, 'Kode referral atau PIN tidak valid');
    if (expected === 401) assert.equal(failures, 1);
  }
});
