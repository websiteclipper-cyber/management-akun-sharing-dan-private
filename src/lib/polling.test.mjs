import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./polling.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const context = { exports: {}, setTimeout, clearTimeout, Date, AbortController };
  vm.runInNewContext(outputText, context);
  return context.exports;
}

async function advance(t, ms) {
  t.mock.timers.tick(ms);
  // Flush the async task and its catch/finally before advancing time again.
  await Promise.resolve();
  await Promise.resolve();
}

test('slow requests and manual refresh never overlap; interval starts after completion', async t => {
  const { startPolling } = setup(t);
  let calls = 0;
  let complete;
  const poller = startPolling(() => {
    calls++;
    return new Promise(resolve => { complete = resolve; });
  }, { intervalMs: 15_000, requestTimeoutMs: 60_000, isVisible: () => true });
  t.after(poller.stop);
  await advance(t, 0);
  await advance(t, 30_000);
  await poller.refresh();
  assert.equal(calls, 1);
  complete();
  await advance(t, 0);
  await poller.refresh();
  await advance(t, 14_999);
  assert.equal(calls, 1);
  await advance(t, 1);
  assert.equal(calls, 2);
  complete();
});

test('hidden tabs do no work and terminal status stops all future checks', async t => {
  const { startPolling } = setup(t);
  let visible = false;
  let calls = 0;
  const poller = startPolling(async () => { calls++; return false; }, {
    intervalMs: 15_000, isVisible: () => visible,
  });
  t.after(poller.stop);
  await advance(t, 0);
  await advance(t, 15_000);
  assert.equal(calls, 0);
  visible = true;
  await advance(t, 15_000);
  assert.equal(calls, 1);
  await advance(t, 60_000);
  await poller.refresh();
  assert.equal(calls, 1);
});

test('429 Retry-After also blocks manual attempts and resets after a successful request', async t => {
  const { startPolling, PollingError } = setup(t);
  let calls = 0;
  const poller = startPolling(async () => {
    calls++;
    if (calls === 1) throw new PollingError('Limited', 300_000);
  }, { intervalMs: 15_000, isVisible: () => true });
  t.after(poller.stop);
  await advance(t, 0);
  await poller.refresh();
  await advance(t, 299_999);
  assert.equal(calls, 1);
  await advance(t, 1);
  assert.equal(calls, 2);
  await advance(t, 15_000);
  assert.equal(calls, 3);
});

test('repeated failures back off, and network timeout aborts before retry', async t => {
  const { startPolling } = setup(t);
  let calls = 0;
  let signal;
  const poller = startPolling(currentSignal => {
    calls++;
    signal = currentSignal;
    return new Promise((resolve, reject) => {
      currentSignal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  }, { intervalMs: 15_000, requestTimeoutMs: 5_000, isVisible: () => true });
  t.after(poller.stop);
  await advance(t, 0);
  await advance(t, 5_000);
  assert.equal(signal.aborted, true);
  await advance(t, 29_999);
  assert.equal(calls, 1);
  await advance(t, 1);
  assert.equal(calls, 2);
  await advance(t, 5_000);
  await advance(t, 59_999);
  assert.equal(calls, 2);
  await advance(t, 1);
  assert.equal(calls, 3);
});

test('deadline aborts a pending request and cleanup prevents subsequent polling', async t => {
  const { startPolling } = setup(t);
  let calls = 0;
  let expired = 0;
  let signal;
  const poller = startPolling(currentSignal => {
    signal = currentSignal;
    calls++;
    return new Promise((resolve, reject) => {
      currentSignal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  }, {
    intervalMs: 15_000,
    requestTimeoutMs: 60_000,
    maxDurationMs: 30_000,
    isVisible: () => true,
    onExpire: () => { expired++; },
  });
  await advance(t, 0);
  await advance(t, 30_000);
  assert.equal(expired, 1);
  assert.equal(signal.aborted, true);
  await advance(t, 120_000);
  await poller.refresh();
  assert.equal(calls, 1);

  const cancelled = startPolling(async () => { calls++; }, {
    intervalMs: 15_000, isVisible: () => true,
  });
  cancelled.stop();
  await advance(t, 60_000);
  assert.equal(calls, 1);
});

test('Retry-After accepts both seconds and HTTP dates, ignoring malformed values', t => {
  const { getRetryAfterMs } = setup(t);
  const response = value => ({ headers: { get: () => value } });
  assert.equal(getRetryAfterMs(response('120')), 120_000);
  assert.equal(getRetryAfterMs(response('Thu, 01 Jan 1970 00:03:00 GMT')), 180_000);
  assert.equal(getRetryAfterMs(response('-1')), 0);
  assert.equal(getRetryAfterMs(response('invalid')), 0);
  assert.equal(getRetryAfterMs(response(null)), 0);
});
