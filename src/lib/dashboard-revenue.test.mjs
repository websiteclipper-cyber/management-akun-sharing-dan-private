import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./dashboard-revenue.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { buildRevenueHistory, jakartaDateKey } = context.exports;
const order = (created_at, total_amount, payment_status = 'paid') => ({ created_at, total_amount, payment_status });

test('retains old revenue, fills empty days, and excludes unpaid/future orders', () => {
  const days = buildRevenueHistory([
    order('2025-12-31T10:00:00Z', 100),
    order('2026-01-01T10:00:00Z', 200),
    order('2025-01-01T10:00:00Z', 900, 'pending_payment'),
    order('2026-10-07T10:00:00Z', 900),
  ], new Date('2026-10-06T12:00:00Z'));
  assert.equal(days[0].dateKey, '2025-12-31');
  assert.equal(days.at(-1).dateKey, '2026-10-06');
  assert.equal(days.reduce((sum, day) => sum + day.revenue, 0), 300);
  assert.equal(days[2].revenue, 0);
  assert.equal(days[2].orders, 0);
  assert.equal(new Set(days.map(day => day.dateKey)).size, days.length);
});

test('groups at midnight WIB independently of server timezone', () => {
  assert.equal(jakartaDateKey('2026-10-05T17:00:00Z'), '2026-10-06');
  const days = buildRevenueHistory([
    order('2026-10-05T16:59:59Z', 100),
    order('2026-10-05T17:00:00Z', 200),
    order('2026-10-06T02:00:00Z', 300),
  ], new Date('2026-10-06T12:00:00Z'));
  assert.equal(days.at(-2).revenue, 100);
  assert.equal(days.at(-1).revenue, 500);
  assert.equal(days.at(-1).orders, 2);
});

test('empty history still provides 30 zero days and includes leap day', () => {
  const days = buildRevenueHistory([], new Date('2024-03-01T00:00:00Z'));
  assert.equal(days.length, 30);
  assert.equal(days.at(-2).dateKey, '2024-02-29');
  assert.ok(days.every(day => day.revenue === 0 && day.orders === 0));
});
