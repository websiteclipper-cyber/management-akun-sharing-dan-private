// Explicit opt-in: creates and simulates one sandbox transaction, without touching app orders.
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
if (!process.argv.includes('--create-and-simulate') || process.env.KIPAY_ENV !== 'sandbox') {
  console.error('Requires KIPAY_ENV=sandbox and --create-and-simulate. Never run against production.');
  process.exit(1);
}

// Use the real server client while avoiding app/Next.js startup and database side effects.
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/kipay.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const context = {
  exports: {}, process, fetch, AbortSignal, Buffer, Headers,
  require: name => {
    if (name === 'node:crypto') return crypto;
    throw new Error('Unexpected import in KiPay client.');
  },
};
vm.runInNewContext(outputText, context);
const api = context.exports;

try {
  const note = `KIPAY-INTEGRATION-TEST-${Date.now()}`;
  console.log(JSON.stringify({ step: 'start', note, mode: 'sandbox' }));
  const created = await api.createKiPayTransaction(note, 10000);
  console.log(JSON.stringify({ step: 'create', trx_id: created.trx_id, mode: created.mode,
    status: created.status, requested_amount: created.requested_amount, total_amount: created.amount }));
  const image = await api.getKiPayQrImage(created.trx_id);
  console.log(JSON.stringify({ step: 'qr', valid_png: image.startsWith('data:image/png;base64,'),
    bytes: Buffer.from(image.split(',')[1], 'base64').length }));

  const key = process.env.KIPAY_API_KEY.trim();
  const response = await fetch(`https://api.kipay.id/api/pay/${encodeURIComponent(key)}/transactions/${encodeURIComponent(created.trx_id)}/simulate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ provider: 'shopeepay' }), redirect: 'error', signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Sandbox simulation failed (HTTP ${response.status}).`);
  const paid = await api.getKiPayTransaction(created.trx_id);
  if (paid.mode !== 'sandbox' || paid.status !== 'paid' || paid.note !== note || paid.amount !== created.amount) {
    throw new Error('Sandbox verification mismatch.');
  }
  console.log(JSON.stringify({ step: 'verify', trx_id: paid.trx_id, mode: paid.mode, status: paid.status, amount_matches: true }));
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Sandbox check failed:', message.replace(/(?:qpg_|apg_|whsec_)[A-Za-z0-9_-]+/g, '[REDACTED]'));
  process.exitCode = 1;
}
