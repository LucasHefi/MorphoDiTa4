#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 ? resolve(args[rootIndex + 1]) : repoRoot;
const packageRoot = existsSync(join(root, 'usr/bin/morphodita-server'));
const sidecar = packageRoot
  ? join(root, 'usr/bin/morphodita-server')
  : join(root, 'src-tauri/binaries/morphodita-server-x86_64-unknown-linux-gnu');
const model = packageRoot
  ? join(root, 'usr/lib/MorphoDiTa Client/models/czech.tagger')
  : join(root, 'models/czech-250909/czech.tagger');
const port = 8780 + (process.pid % 100);
const base = `http://127.0.0.1:${port}`;
const blockedExternalRequests = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'lindat.mff.cuni.cz') {
    blockedExternalRequests.push(url.href);
    throw new Error(`blocked external request: ${url.href}`);
  }
  return realFetch(input, init);
};

if (!existsSync(sidecar) || !existsSync(model)) {
  console.error(JSON.stringify({ status: 'BLOCKED', sidecar, model, reason: 'offline artifacts are missing' }));
  process.exitCode = 2;
} else {
  let child;
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await new Promise((resolveStop) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolveStop();
      }, 5000);
      child.once('exit', () => {
        clearTimeout(timeout);
        resolveStop();
      });
    });
  };
  const waitForModels = async () => {
    let lastError;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`${base}/models`);
        if (response.ok) return response.json();
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    throw lastError ?? new Error('sidecar readiness timeout');
  };
  const runOnce = async () => {
    child = spawn(sidecar, [String(port), 'czech-250909', model, 'https://hdl.handle.net/11234/1-5985'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const models = await waitForModels();
    const tagResponse = await fetch(`${base}/tag?data=Ko%C4%8Dka%20b%C4%9B%C5%BE%C3%AD.&output=json`);
    const tagged = await tagResponse.json();
    if (tagged.result?.[0]?.[0]?.lemma !== 'kočka') {
      throw new Error(`unexpected local tag result: ${JSON.stringify(tagged)}`);
    }
    await stop();
    return models;
  };
  try {
    const first = await runOnce();
    const second = await runOnce();
    if (blockedExternalRequests.length !== 0) {
      throw new Error(`external requests observed: ${blockedExternalRequests.join(', ')}`);
    }
    console.log(JSON.stringify({
      status: 'PASS',
      transport: 'offline-loopback',
      externalRequests: blockedExternalRequests.length,
      restarts: 2,
      models: [first.models, second.models],
    }, null, 2));
  } catch (error) {
    await stop();
    console.error(JSON.stringify({
      status: 'PARTIAL',
      externalRequests: blockedExternalRequests.length,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exitCode = 1;
  }
}
