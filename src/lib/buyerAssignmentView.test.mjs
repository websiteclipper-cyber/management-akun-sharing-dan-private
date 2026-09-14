import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./buyerAssignmentView.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } },
);
const context = { exports: {} };
vm.runInNewContext(outputText, context);
const { serializeBuyerAssignment } = context.exports;

const now = Date.parse('2026-09-14T00:00:00.000Z');
const stockAccount = {
  id: 9,
  account_identifier: 'account@example.com',
  account_type: 'sharing',
  profile_info: 'Profile 1',
  pin_info: '1234',
  two_factor_secret_encrypted: 'encrypted-secret',
};

test('an active unexpired assignment exposes only buyer-safe account fields', () => {
  const result = serializeBuyerAssignment({
    id: 1,
    status: 'active',
    expired_at: '2026-09-15T00:00:00.000Z',
    stock_account: stockAccount,
  }, now);

  assert.equal(result.credential_available, true);
  assert.equal(result.stock_account.account_identifier, 'account@example.com');
  assert.equal(result.stock_account.has_two_factor_secret, true);
  assert.equal('two_factor_secret_encrypted' in result.stock_account, false);
});

test('an active assignment past its expiry remains in history without credentials', () => {
  const result = serializeBuyerAssignment({
    id: 2,
    status: 'active',
    expired_at: '2026-09-13T00:00:00.000Z',
    stock_account: [stockAccount],
  }, now);

  assert.equal(result.status, 'active');
  assert.equal(result.credential_available, false);
  assert.equal(result.stock_account.id, 9);
  assert.equal(result.stock_account.account_type, 'sharing');
  assert.equal('account_identifier' in result.stock_account, false);
  assert.equal('profile_info' in result.stock_account, false);
  assert.equal('pin_info' in result.stock_account, false);
});

test('a non-active assignment is retained but redacted even before its expiry', () => {
  const result = serializeBuyerAssignment({
    id: 3,
    status: 'replaced',
    expired_at: '2026-09-15T00:00:00.000Z',
    stock_account: stockAccount,
  }, now);

  assert.equal(result.credential_available, false);
  assert.equal('account_identifier' in result.stock_account, false);
});
