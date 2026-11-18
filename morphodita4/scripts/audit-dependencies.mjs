import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function evaluateAudit(report, lock, exceptions, today = new Date().toISOString().slice(0, 10)) {
  if (report.error || !report.vulnerabilities || !report.metadata) throw new Error('npm audit did not return a complete vulnerability report');
  const vulnerabilities = report.vulnerabilities;
  const roots = (name, seen = new Set()) => {
    if (seen.has(name)) return [];
    const entry = vulnerabilities[name];
    if (!entry) throw new Error(`Unknown transitive advisory: ${name}`);
    const next = new Set([...seen, name]);
    return entry.via.flatMap(via => typeof via === 'string' ? roots(via, next) : [via]);
  };
  const failed = [], accepted = [];
  for (const [name, issue] of Object.entries(vulnerabilities)) {
    if (!['high', 'critical'].includes(issue.severity)) continue;
    const advisories = roots(name);
    const devOnly = issue.nodes?.length > 0 && issue.nodes.every(node => lock.packages?.[node]?.dev === true);
    const allowed = issue.severity !== 'critical' && devOnly && advisories.length > 0 && advisories.every(advisory => {
      const id = advisory.url?.match(/^https:\/\/github\.com\/advisories\/(GHSA-[\w-]+)$/)?.[1];
      const exception = exceptions[id];
      return exception && exception.package === advisory.name && exception.expires >= today;
    });
    (allowed ? accepted : failed).push({ name, severity: issue.severity, advisories: [...new Set(advisories.map(a => a.url))] });
  }
  return { status: failed.length ? 'FAIL' : 'PASS', totals: report.metadata.vulnerabilities, accepted, failed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npm, ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0 && result.status !== 1) throw new Error(`npm audit failed with status ${result.status}: ${result.stderr}`);
    const report = JSON.parse(result.stdout);
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
    const exceptions = JSON.parse(readFileSync(resolve(root, 'scripts/audit-exceptions.json'), 'utf8'));
    const evaluation = evaluateAudit(report, lock, exceptions);
    console.log(JSON.stringify(evaluation, null, 2));
    if (evaluation.accepted.length) console.warn('Known unpatched DEV-ONLY advisory exception expires on 2026-12-18; see scripts/audit-exceptions.json.');
    process.exitCode = evaluation.failed.length ? 1 : 0;
  } catch (error) {
    console.error(String(error)); process.exitCode = 1;
  }
}
