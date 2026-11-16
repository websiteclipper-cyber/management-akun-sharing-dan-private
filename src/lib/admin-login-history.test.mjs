import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import crypto from 'node:crypto';
import net from 'node:net';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const context = { exports: {}, Request, Response, URL, Buffer, AbortSignal, Error, SyntaxError, JSON, process: { env: {} }, ...globals,
    require: name => { assert.ok(name in dependencies, `Unexpected import: ${name}`); return dependencies[name]; } };
  vm.runInNewContext(outputText, context);
  return context.exports;
}
const next = { NextResponse: { json: (body, init) => Response.json(body, init) } };
const copy = value => JSON.parse(JSON.stringify(value));
const metadata = env => load('./adminLoginMetadata.ts', { 'node:net': net }, { process: { env } });
const fingerprint = { emailHash: 'email-hash', ipHash: 'ip-hash' };
const admin = { id: 1, name: 'Test Admin', email: 'owner@example.test', role: 'super_admin', status: 'active', password_hash: 'hash', token_version: 4 };

test('production IP evidence uses the Vercel-overwritten IP, validates it, and ignores spoofable alternatives', () => {
  const { getAdminClientIp } = metadata({ NODE_ENV: 'production', VERCEL: '1' });
  for (const [ip, expected] of [['203.0.113.1', '203.0.113.1'], ['2001:DB8::1', '2001:db8::1'], ['::ffff:192.0.2.1', '192.0.2.1'], ['untrusted', null], ['203.0.113.1:443', null]]) {
    assert.equal(getAdminClientIp(new Request('https://example.test', { headers: {
      'x-vercel-forwarded-for': ip, 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2',
    } })), expected);
  }
  assert.equal(metadata({ NODE_ENV: 'production' }).getAdminClientIp(new Request('https://example.test', { headers: { 'x-forwarded-for': '198.51.100.1' } })), null);
});

test('device detection distinguishes desktop, Android, iPhone and tablet browsers', () => {
  const detect = metadata({ VERCEL: '1' }).getAdminLoginMetadata;
  for (const [ua, type, browser, os] of [
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0', 'desktop', 'Edge 130.0', 'Windows 10 / 11'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36', 'mobile', 'Chrome 130.0', 'Android 14'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1', 'mobile', 'Safari 18.0', 'iOS 18.0'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1', 'tablet', 'Safari 18.0', 'iOS 18.0'],
    ['Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0 Safari/537.36 SamsungBrowser/26.0', 'tablet', 'Samsung Internet 26.0', 'Android 14'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) Firefox/132.0', 'desktop', 'Firefox 132.0', 'macOS 14.1'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36 OPR/85.0', 'mobile', 'Opera 85.0', 'Android 14'],
  ]) {
    const result = detect(new Request('https://example.test', { headers: { 'user-agent': ua } }));
    assert.equal(result.device_type, type); assert.equal(result.browser, browser); assert.equal(result.os, os);
  }
});

test('network location comes only from Vercel; missing or malformed evidence never becomes a default location', () => {
  const headers = { 'x-vercel-ip-country': 'ID', 'x-vercel-ip-country-region': 'JK', 'x-vercel-ip-city': 'Jakarta%20Selatan', cookie: 'pp_country=SG' };
  const detect = metadata({ VERCEL: '1' }).getAdminLoginMetadata;
  const found = detect(new Request('https://example.test', { headers }));
  assert.equal(found.city, 'Jakarta Selatan'); assert.equal(found.country_code, 'ID'); assert.equal(found.location_source, 'vercel');
  const local = metadata({ NODE_ENV: 'development' }).getAdminLoginMetadata(new Request('http://localhost', { headers }));
  assert.equal(local.city, null); assert.equal(local.country_code, null); assert.equal(local.location_source, 'unavailable');
  const missing = detect(new Request('https://example.test'));
  assert.equal(missing.city, null); assert.equal(missing.country_code, null); assert.equal(missing.device_type, 'unknown');
  const invalid = detect(new Request('https://example.test', { headers: { 'x-vercel-ip-country': 'XX', 'x-vercel-ip-city': '%invalid', 'user-agent': 'x'.repeat(1000) } }));
  assert.equal(invalid.city, null); assert.equal(invalid.country_code, null); assert.equal(invalid.user_agent.length, 512);
});

function historyModule(db = {}, env = { VERCEL: '1' }) {
  return load('./adminLoginHistory.ts', {
    '@/lib/supabase': { supabaseAdmin: db },
    '@/lib/adminAuthSecurity': { createAdminAuthAbortSignal: () => AbortSignal.timeout(1000) },
    '@/lib/adminLoginMetadata': metadata(env),
  });
}

test('history stores only account and request evidence, never password, token or client-supplied IP fields', async () => {
  let inserted;
  const history = historyModule({ from: table => {
    assert.equal(table, 'admin_login_history');
    return { insert: row => { inserted = row; return { abortSignal: async () => ({ error: null }) }; } };
  } });
  await history.recordAdminLoginAttempt(new Request('https://example.test/login', {
    method: 'POST', headers: { 'x-vercel-forwarded-for': '203.0.113.1', authorization: 'Bearer secret-token' },
    body: JSON.stringify({ password: 'private-password', ip_address: '198.51.100.1', country: 'SG' }),
  }), { email: 'owner@example.test', outcome: 'success', admin });
  assert.equal(inserted.ip_address, '203.0.113.1'); assert.equal(inserted.admin_id, 1); assert.equal(inserted.outcome, 'success');
  assert.ok(!JSON.stringify(inserted).includes('private-password')); assert.ok(!JSON.stringify(inserted).includes('secret-token'));
  assert.ok(!('occurred_at' in inserted));
  const offline = historyModule({ from: () => ({ insert: () => ({ abortSignal: async () => ({ error: { message: 'offline' } }) }) }) });
  await assert.rejects(offline.recordAdminLoginAttempt(new Request('https://example.test'), { email: 'nobody@example.test', outcome: 'failed' }), /persist/);
});

test('rate-limit hashing and history agree on the trusted client IP', () => {
  const detect = metadata({ VERCEL: '1', NODE_ENV: 'production' });
  const security = load('./adminAuthSecurity.ts', {
    crypto: { default: crypto }, '@/lib/supabase': { supabaseAdmin: {} }, '@/lib/adminLoginMetadata': detect,
  }, { process: { env: { JWT_SECRET: 'synthetic-secret-for-testing-123456789' } } });
  const request = xff => new Request('https://example.test', { headers: { 'x-vercel-forwarded-for': '203.0.113.1', 'x-forwarded-for': xff } });
  assert.equal(security.getAdminAuthFingerprint(request('192.0.2.1'), 'owner@example.test').ipHash, security.getAdminAuthFingerprint(request('192.0.2.2'), 'owner@example.test').ipHash);
});

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = n => ({ id: id(n), occurred_at: '2026-11-11T05:00:00.123456+00:00', outcome: 'success' });

test('pagination preserves microsecond precision and rejects tampered query syntax', () => {
  const history = historyModule();
  const cursor = history.encodeLoginHistoryCursor(row(25));
  assert.deepEqual(copy(history.decodeLoginHistoryCursor(cursor)), { at: row(25).occurred_at, id: id(25) });
  for (const value of ['', 'x'.repeat(513), 'not-json', Buffer.from(JSON.stringify({ at: '2026-11-11T05:00:00Z),outcome.eq.success', id: id(1) })).toString('base64url'), Buffer.from(JSON.stringify({ at: row(1).occurred_at, id: `${id(1)},outcome.eq.success` })).toString('base64url')]) {
    assert.equal(history.decodeLoginHistoryCursor(value), null);
  }
});

function api({ identity = admin, rows = [], error = null } = {}) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'order', 'eq', 'gte', 'or', 'limit']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = async () => ({ data: rows, error });
  const route = load('../app/api/admin/login-history/route.ts', {
    'next/server': next,
    '@/lib/auth': { getAdminFromRequest: async () => identity, isSuperAdmin: value => value?.role === 'super_admin' },
    '@/lib/supabase': { supabaseAdmin: { from: table => { calls.push(['from', table]); return query; } } },
    '@/lib/adminAuthSecurity': { createAdminAuthAbortSignal: () => undefined },
    '@/lib/adminLoginHistory': historyModule(),
  });
  return { route, calls };
}

test('history API blocks anonymous, buyer and regular admin access before reading history', async () => {
  for (const [identity, status] of [[null, 401], [{ role: 'admin' }, 403]]) {
    const { route, calls } = api({ identity });
    const response = await route.GET(new Request('https://example.test/api/admin/login-history'));
    assert.equal(response.status, status); assert.deepEqual(calls, []);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
});

test('history API validates filters and cursors instead of accepting raw database filters', async () => {
  for (const params of ['outcome=anything', 'days=-1', 'days=1000000', 'cursor=garbage', 'cursor=']) {
    const { route, calls } = api();
    assert.equal((await route.GET(new Request(`https://example.test/api/admin/login-history?${params}`))).status, 400);
    assert.deepEqual(calls, []);
  }
});

test('history API uses stable pagination, applies filters, and never caches admin IP data', async () => {
  const { route, calls } = api({ rows: Array.from({ length: 26 }, (_, n) => row(n + 1)) });
  const cursor = historyModule().encodeLoginHistoryCursor(row(50));
  const response = await route.GET(new Request(`https://example.test/api/admin/login-history?outcome=failed&days=7&cursor=${cursor}`));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(response.headers.get('vary'), 'Authorization');
  const data = await response.json();
  assert.equal(data.logs.length, 25); assert.equal(historyModule().decodeLoginHistoryCursor(data.nextCursor).id, id(25));
  assert.ok(calls.some(call => call[0] === 'or' && call[1] === `occurred_at.lt.${row(50).occurred_at},and(occurred_at.eq.${row(50).occurred_at},id.lt.${id(50)})`));
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'outcome' && call[2] === 'failed'));
  assert.deepEqual(calls.filter(call => call[0] === 'order').map(call => call[1]), ['occurred_at', 'id']);
  const last = await api({ rows: [row(1)] }).route.GET(new Request('https://example.test/api/admin/login-history?days=all'));
  assert.equal((await last.json()).nextCursor, null);
});

test('history API distinguishes database errors from an empty login history', async () => {
  const response = await api({ error: { message: 'internal database detail' } }).route.GET(new Request('https://example.test/api/admin/login-history'));
  assert.equal(response.status, 503);
  assert.ok(!JSON.stringify(await response.json()).includes('internal database detail'));
});

function login({ account = admin, dbError = null, passwordValid = true, limited = false, historyFails = false } = {}) {
  const calls = [];
  const jobs = [];
  const query = {};
  for (const method of ['select', 'ilike', 'eq', 'update']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.abortSignal = () => query;
  query.maybeSingle = async () => ({ data: account, error: dbError });
  const db = { from: table => { calls.push(['from', table]); return query; } };
  const read = load('./publicApiSecurity.ts', { crypto: { default: crypto }, '@/lib/supabase': { supabaseAdmin: db } });
  const route = load('../app/api/admin/auth/login/route.ts', {
    'next/server': { ...next, after: job => jobs.push(job) },
    '@/lib/supabase': { supabaseAdmin: db },
    bcryptjs: { default: { compare: async () => { calls.push(['password']); return passwordValid; } } },
    '@/lib/auth': { signToken: payload => { calls.push(['token', payload]); return 'synthetic-admin-token'; } },
    '@/lib/publicApiSecurity': read,
    '@/lib/adminLoginHistory': { recordAdminLoginAttempt: async (_request, attempt) => { calls.push(['history', attempt]); if (historyFails) throw new Error('offline'); } },
    '@/lib/adminAuthSecurity': {
      normalizeAdminEmail: value => typeof value === 'string' ? value.trim().toLowerCase() : '',
      getAdminAuthFingerprint: () => fingerprint,
      checkAdminLoginCooldown: async () => ({ limited, retryAfterSeconds: 18000 }),
      recordAdminAuthEvent: async (_fp, type) => calls.push(['rate-event', type]),
      createAdminAuthAbortSignal: () => undefined,
      DUMMY_ADMIN_PASSWORD_HASH: 'dummy-hash',
      clearAdminLoginFailures: async () => calls.push(['clear-rate-limit']),
      cleanupAdminAuthEvents: async () => calls.push(['cleanup-rate-limit']),
    },
  });
  return { route, calls, jobs };
}
const loginRequest = (body = { email: ' OWNER@EXAMPLE.TEST ', password: 'PrivatePassword1' }) => new Request('https://example.test/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('a successful login is durably recorded before a token is issued; maintenance does not remove history', async () => {
  const { route, calls, jobs } = login();
  const response = await route.POST(loginRequest());
  assert.equal(response.status, 200);
  const auditIndex = calls.findIndex(call => call[0] === 'history');
  assert.ok(auditIndex < calls.findIndex(call => call[0] === 'token'));
  assert.equal(calls[auditIndex][1].outcome, 'success'); assert.equal(calls[auditIndex][1].email, admin.email);
  assert.equal(calls.find(call => call[0] === 'token')[1].tokenVersion, admin.token_version);
  assert.equal(jobs.length, 1); await jobs[0]();
  assert.equal(calls.filter(call => call[0] === 'history').length, 1);
  assert.ok(!calls.some(call => call[0] === 'from' && call[1] === 'admin_login_history'));
});

test('incorrect credentials and unknown accounts are recorded without account enumeration or token issuance', async () => {
  for (const options of [{ passwordValid: false }, { account: null }]) {
    const { route, calls, jobs } = login(options);
    const response = await route.POST(loginRequest());
    assert.equal(response.status, 401); assert.equal((await response.json()).error, 'Email atau password salah');
    assert.equal(calls.find(call => call[0] === 'history')[1].outcome, 'failed');
    assert.ok(calls.some(call => call[0] === 'rate-event')); assert.ok(!calls.some(call => call[0] === 'token')); assert.equal(jobs.length, 0);
  }
});

test('rate-limited attempts are recorded as blocked and do not check a password or issue access', async () => {
  const { route, calls } = login({ limited: true });
  const response = await route.POST(loginRequest());
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '18000');
  assert.equal(calls.find(call => call[0] === 'history')[1].outcome, 'blocked');
  assert.ok(!calls.some(call => ['password', 'token'].includes(call[0])));
});

test('history storage failure prevents token issuance rather than permitting an unlogged admin login', async () => {
  const { route, calls, jobs } = login({ historyFails: true });
  const response = await route.POST(loginRequest());
  assert.equal(response.status, 503); assert.ok(!calls.some(call => call[0] === 'token')); assert.equal(jobs.length, 0);
});

test('malformed and oversized login input is rejected before database access', async () => {
  for (const [request, status] of [
    [loginRequest({ email: 'a'.repeat(255), password: 'pw' }), 400],
    [loginRequest({ email: 'owner@example.test', password: 123 }), 400],
    [loginRequest({ email: 'owner@example.test', password: 'x'.repeat(129) }), 400],
    [loginRequest(null), 400],
    [loginRequest({ email: 'owner@example.test', password: 'x'.repeat(5000) }), 413],
    [new Request('https://example.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }), 400],
  ]) {
    const { route, calls } = login();
    assert.equal((await route.POST(request)).status, status); assert.deepEqual(calls, []);
  }
});

test('admin lookup uses a literal email instead of allowing wildcard matching', async () => {
  const { route, calls } = login({ account: null });
  await route.POST(loginRequest({ email: 'Owner_%@example.test', password: 'PrivatePassword1' }));
  assert.equal(calls.find(call => call[0] === 'ilike')[2], 'owner\\_\\%@example.test');
});
