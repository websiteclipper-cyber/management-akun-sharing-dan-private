import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function load(file, dependencies, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const context = {
    exports: {}, Request, Response, AbortSignal, Error, SyntaxError, console, ...globals,
    require: name => {
      assert.ok(name in dependencies, `Unexpected import: ${name}`);
      return dependencies[name];
    },
  };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

const HOUR = 60 * 60 * 1000;
const BASE = Date.parse('2026-11-16T00:00:00Z');
const admin = { id: 1, email: 'owner@example.test', name: 'Owner', role: 'super_admin', password_hash: 'hash', token_version: 0 };

// Exercise the actual route and security helpers against persisted event rows
// with a controllable clock. No production accounts or database are touched.
function system() {
  let now = BASE;
  const state = { events: [], history: [], jobs: [], passwordChecks: 0, tokens: 0, readError: false, writeError: false };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const db = { from(table) {
    const filters = [];
    let operation = 'select';
    let payload;
    let countOnly = false;
    let rowLimit = Infinity;
    let sort;
    const query = {
      select(_columns, options) { countOnly = options?.head || false; return query; },
      eq(column, value) { filters.push(row => row[column] === value); return query; },
      ilike(column, value) { filters.push(row => row[column]?.toLowerCase() === value.replace(/\\([\\%_])/g, '$1')); return query; },
      gte(column, value) { filters.push(row => row[column] >= value); return query; },
      lt(column, value) { filters.push(row => row[column] < value); return query; },
      order(column, options) { sort = { column, ...options }; return query; },
      limit(value) { rowLimit = value; return query; },
      abortSignal() { return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      delete() { operation = 'delete'; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      async maybeSingle() { const result = await execute(); return { ...result, data: result.data?.[0] || null }; },
      then(resolve, reject) { return execute().then(resolve, reject); },
    };
    async function execute() {
      if ((operation === 'select' && state.readError) || (operation !== 'select' && state.writeError)) {
        return { data: null, error: { message: 'private storage detail' } };
      }
      const rows = table === 'admins' ? [{ ...admin, status: 'active' }] : state.events;
      if (operation === 'insert') {
        rows.push({ ...payload, attempted_at: new Clock().toISOString() });
        return { data: null, error: null };
      }
      let matches = rows.filter(row => filters.every(filter => filter(row)));
      if (operation === 'delete') {
        for (const row of matches) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      if (operation === 'update') return { data: null, error: null };
      if (sort) matches.sort((a, b) => (sort.ascending ? 1 : -1) * a[sort.column].localeCompare(b[sort.column]));
      return { data: countOnly ? null : matches.slice(0, rowLimit), count: matches.length, error: null };
    }
    return query;
  } };
  const security = load('./adminAuthSecurity.ts', {
    crypto: { default: crypto },
    '@/lib/supabase': { supabaseAdmin: db },
    '@/lib/adminLoginMetadata': { getAdminClientIp: request => request.headers.get('x-real-ip') },
  }, { Date: Clock, process: { env: { JWT_SECRET: 'synthetic-test-secret-for-cooldown-123456' } } });
  const route = load('../app/api/admin/auth/login/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) }, after: job => state.jobs.push(job) },
    '@/lib/supabase': { supabaseAdmin: db },
    '@/lib/adminAuthSecurity': security,
    '@/lib/publicApiSecurity': { readJsonBody: request => request.json() },
    '@/lib/adminLoginHistory': { recordAdminLoginAttempt: async (_request, entry) => state.history.push(entry) },
    bcryptjs: { default: { compare: async password => { state.passwordChecks++; await state.beforePassword?.(password); return password === 'correct'; } } },
    '@/lib/auth': { signToken: () => { state.tokens++; return 'synthetic-token'; } },
  }, { Date: Clock });
  const request = ({ email = admin.email, ip = '203.0.113.1', password = 'wrong' } = {}) => new Request('https://example.test/api/admin/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify({ email, password }),
  });
  return {
    state, security, at: elapsed => { now = BASE + elapsed; },
    login: options => route.POST(request(options)),
    maintenance: async () => { for (const job of state.jobs.splice(0)) await job(); },
  };
}

async function lock(app) {
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await app.login()).status, 401);
  assert.equal((await app.login()).status, 429);
}

test('the fifth failed login immediately starts a five-hour cooldown and records the failed password', async () => {
  const app = system();
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await app.login();
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('retry-after'), null);
  }
  const response = await app.login();
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '18000');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.retryAfterSeconds, 18000);
  assert.match(body.error, /5 jam/);
  assert.equal(app.state.events.length, 5);
  assert.deepEqual(app.state.history.map(row => row.outcome), Array(5).fill('failed'));
  assert.equal(app.state.passwordChecks, 5);
  assert.equal(app.state.tokens, 0);
});

test('rotating IPs or email spelling cannot bypass the email cooldown; rotating emails cannot bypass the IP cooldown', async () => {
  const app = system();
  await lock(app);
  for (const options of [
    { ip: '203.0.113.99', email: ' OWNER@EXAMPLE.TEST ', password: 'correct' },
    { email: 'other@example.test' },
  ]) {
    const response = await app.login(options);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '18000');
    assert.equal(app.state.history.at(-1).outcome, 'blocked');
  }
  assert.equal(app.state.passwordChecks, 5);
  assert.equal(app.state.tokens, 0);
  assert.equal(app.state.events.length, 5);
  assert.equal((await app.login({ email: 'other@example.test', ip: '203.0.113.99' })).status, 401);
});

test('five failures from different IPs count together for one email', async () => {
  const app = system();
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await app.login({ ip: `203.0.113.${attempt + 1}` });
    assert.equal(response.status, attempt === 4 ? 429 : 401);
  }
});

test('cooldown starts at the fifth failure and survives earlier failures aging out of the five-hour window', async () => {
  const app = system();
  for (let attempt = 0; attempt < 5; attempt++) {
    app.at(attempt * HOUR);
    assert.equal((await app.login()).status, attempt === 4 ? 429 : 401);
  }
  app.at(5 * HOUR + 30 * 60 * 1000);
  const response = await app.login({ password: 'correct' });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), String(3.5 * 3600));
  app.at(9 * HOUR - 1);
  assert.equal((await app.login()).headers.get('retry-after'), '1');
  assert.equal(app.state.events.length, 5);
  assert.equal(app.state.passwordChecks, 5);
  app.at(9 * HOUR);
  assert.equal((await app.login({ password: 'correct' })).status, 200);
  assert.equal(app.state.tokens, 1);
});

test('blocked attempts do not extend the cooldown and expiry gives five fresh attempts', async () => {
  const app = system();
  await lock(app);
  app.at(HOUR);
  assert.equal((await app.login()).headers.get('retry-after'), '14400');
  app.at(5 * HOUR - 1);
  assert.equal((await app.login()).headers.get('retry-after'), '1');
  app.at(5 * HOUR);
  await lock(app);
  assert.equal(app.state.events.length, 10);
  assert.equal(app.state.passwordChecks, 10);
});

test('failures spread beyond five hours do not lock a new attempt', async () => {
  const app = system();
  for (let attempt = 0; attempt < 5; attempt++) {
    app.at(attempt * 2 * HOUR);
    assert.equal((await app.login()).status, 401);
  }
});

test('successful login resets earlier email failures without deleting login history', async () => {
  const app = system();
  for (let attempt = 0; attempt < 4; attempt++) assert.equal((await app.login()).status, 401);
  app.at(1);
  assert.equal((await app.login({ password: 'correct' })).status, 200);
  await app.maintenance();
  assert.equal(app.state.events.length, 0);
  assert.equal(app.state.history.length, 5);
  assert.equal(app.state.history.at(-1).outcome, 'success');
  await lock(app);
});

test('delayed maintenance from an earlier successful login cannot clear a newer cooldown', async () => {
  const app = system();
  assert.equal((await app.login({ password: 'correct' })).status, 200);
  app.at(1);
  await lock(app);
  await app.maintenance();
  assert.equal(app.state.events.length, 5);
  assert.equal((await app.login({ password: 'correct' })).status, 429);
  assert.equal(app.state.tokens, 1);
});

test('cooldown storage errors fail closed without issuing a token or leaking storage details', async () => {
  for (const error of ['readError', 'writeError']) {
    const app = system();
    app.state[error] = true;
    const response = await app.login();
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(await response.json()).includes('private storage detail'));
    assert.equal(app.state.tokens, 0);
  }
});

test('password-reset limits remain separate from login cooldowns', async () => {
  const app = system();
  await lock(app);
  const fingerprint = app.security.getAdminAuthFingerprint(new Request('https://example.test', { headers: { 'x-real-ip': '203.0.113.1' } }), admin.email);
  const options = { eventType: 'password_reset_request', windowMinutes: 60, maxPerEmail: 3, maxPerIp: 10 };
  assert.equal((await app.security.checkAdminAuthRateLimit(fingerprint, options)).limited, false);
  for (let i = 0; i < 3; i++) await app.security.recordAdminAuthEvent(fingerprint, 'password_reset_request');
  assert.equal((await app.security.checkAdminAuthRateLimit(fingerprint, options)).limited, true);
  app.at(HOUR + 1);
  assert.equal((await app.security.checkAdminAuthRateLimit(fingerprint, options)).limited, false);
  assert.equal((await app.login()).status, 429);
});


test('a correct password already being checked cannot bypass a concurrently triggered cooldown', async () => {
  const app = system();
  let resume;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  app.state.beforePassword = password => password === 'correct'
    ? new Promise(resolve => { resume = resolve; entered(); })
    : undefined;
  const pending = app.login({ password: 'correct' });
  await started;
  app.at(1);
  await lock(app);
  resume();
  const response = await pending;
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '18000');
  assert.equal(app.state.tokens, 0);
  assert.equal(app.state.jobs.length, 0);
  assert.equal(app.state.history.at(-1).outcome, 'blocked');
});
