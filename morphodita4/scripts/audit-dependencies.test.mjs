// @vitest-environment node
import { expect, it } from 'vitest';
import { evaluateAudit } from './audit-dependencies.mjs';
const advisory = { name: 'picomatch', url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf' };
const report = { metadata: { vulnerabilities: { high: 2 } }, vulnerabilities: {
  picomatch: { severity: 'high', nodes: ['node_modules/picomatch'], via: [advisory] },
  vite: { severity: 'high', nodes: ['node_modules/vite'], via: ['picomatch'] },
} };
const lock = { packages: { 'node_modules/picomatch': { dev: true }, 'node_modules/vite': { dev: true } } };
const exceptions = { 'GHSA-fc5q-39xc-vjpf': { package: 'picomatch', expires: '2026-12-18' } };
it('accepts only the identified unpatched dev-only advisory and its transitive reports', () => {
  expect(evaluateAudit(report, lock, exceptions, '2026-11-18')).toMatchObject({ status: 'PASS', failed: [], accepted: [{ name: 'picomatch' }, { name: 'vite' }] });
});
it('fails for production exposure, critical severity, unknown advisories and expiry', () => {
  const production = structuredClone(lock); production.packages['node_modules/picomatch'].dev = false;
  expect(evaluateAudit(report, production, exceptions, '2026-11-18').status).toBe('FAIL');
  const critical = structuredClone(report); critical.vulnerabilities.picomatch.severity = 'critical';
  expect(evaluateAudit(critical, lock, exceptions, '2026-11-18').status).toBe('FAIL');
  const unknown = structuredClone(report); unknown.vulnerabilities.picomatch.via[0].url = 'https://github.com/advisories/GHSA-new';
  expect(evaluateAudit(unknown, lock, exceptions, '2026-11-18').status).toBe('FAIL');
  expect(evaluateAudit(report, lock, exceptions, '2026-12-19').status).toBe('FAIL');
  expect(() => evaluateAudit({ error: {} }, lock, exceptions)).toThrow();
});
