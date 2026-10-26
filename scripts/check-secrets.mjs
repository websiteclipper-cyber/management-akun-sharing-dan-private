import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Report locations and credential types only. Never print matching values.
export function findSecrets(source) {
  const findings = [];
  const record = (kind, index) => findings.push({
    kind,
    line: source.slice(0, index).split('\n').length,
  });
  for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString());
      if (payload.role === 'service_role') record('Supabase service-role JWT', match.index);
    } catch {
      // Ordinary source text may resemble a JWT without being one.
    }
  }
  for (const [kind, pattern] of [
    ['Supabase secret API key', /sb_secret_[A-Za-z0-9_-]{12,}/g],
    ['Postgres URL containing a password', /\bpostgres(?:ql)?:\/\/[^\s/:@]+:[^\s@]+@/gi],
    ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ]) {
    for (const match of source.matchAll(pattern)) record(kind, match.index);
  }
  return findings;
}

export function checkRepository() {
  const filenames = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  let count = 0;
  for (const filename of new Set(filenames)) {
    const buffer = readFileSync(filename);
    if (buffer.includes(0)) continue;
    for (const finding of findSecrets(buffer.toString('utf8'))) {
      console.error(`${filename}:${finding.line}: ${finding.kind}`);
      count++;
    }
  }
  if (count) {
    console.error(`Secret scan failed: ${count} finding(s). Remove credentials and rotate any exposed keys.`);
    return false;
  }
  console.log('Secret scan passed: no credential patterns found in repository files.');
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = checkRepository() ? 0 : 1;
}
