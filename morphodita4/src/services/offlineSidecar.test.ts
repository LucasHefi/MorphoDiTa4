import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Vite imports the capability as raw JSON so the test exercises the shipped contract.
import capabilityJson from '../../src-tauri/capabilities/default.json?raw';

const mocks = vi.hoisted(() => ({
  child: { kill: vi.fn() },
  command: {
    on: vi.fn(),
    spawn: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  },
  sidecar: vi.fn(),
  getLocalModelsDir: vi.fn(),
  validateLocalModelDirectory: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { sidecar: mocks.sidecar },
}));

vi.mock('./platformPaths', () => ({
  getLocalModelsDir: mocks.getLocalModelsDir,
}));

vi.mock('./localModels', () => ({
  validateLocalModelDirectory: mocks.validateLocalModelDirectory,
}));

import { OfflineSidecar, OfflineSidecarError } from './offlineSidecar';

const capability = JSON.parse(
  capabilityJson,
) as {
  permissions: Array<string | { identifier: string; allow?: Array<{ args?: Array<string | { validator?: string }> }> }>;
};

function getModelPathValidator(): RegExp {
  const shellPermission = capability.permissions.find(
    (permission): permission is { identifier: string; allow: Array<{ args?: Array<string | { validator?: string }> }> } =>
      typeof permission !== 'string' && permission.identifier === 'shell:allow-spawn',
  );
  const validator = shellPermission?.allow[0]?.args?.[3];
  if (typeof validator !== 'object' || !validator.validator) {
    throw new Error('Bundled model path validator is missing');
  }
  return new RegExp(validator.validator, 'u');
}

describe('OfflineSidecar platform path handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.child.kill.mockResolvedValue(undefined);
    mocks.command.spawn.mockResolvedValue(mocks.child);
    mocks.sidecar.mockReturnValue(mocks.command);
    mocks.getLocalModelsDir.mockResolvedValue('/opt/morphodita/appdata/models');
    mocks.validateLocalModelDirectory.mockImplementation(async (_directory: string, id: string) => ({ manifest: { id, artifact: 'czech.tagger' } }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ models: { 'czech-250909': ['tag', 'analyze', 'generate', 'tokenize'], 'czech-250909-no_dia': ['tag', 'analyze', 'generate', 'tokenize'] } }),
  }));
  });

  afterEach(async () => {
    await OfflineSidecar.stop();
    vi.unstubAllGlobals();
  });

  it('passes the Tauri resource path unchanged on Linux-style paths', async () => {
    await expect(OfflineSidecar.start()).resolves.toBe('http://127.0.0.1:8765');

    expect(mocks.sidecar).toHaveBeenCalledWith('binaries/morphodita-server', [
      '--log_file=',
      '8765',
      'czech-250909',
      '/opt/morphodita/appdata/models/czech-250909/czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
      'czech-250909-no_dia',
      '/opt/morphodita/appdata/models/czech-250909-no_dia/czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
    ]);
  });

  it('always derives the model path from the canonical app-data directory', async () => {
    // @ts-expect-error Caller-supplied model paths are intentionally not part of the API.
    await expect(OfflineSidecar.start('/tmp/attacker-models')).resolves.toBe('http://127.0.0.1:8765');

    expect(mocks.sidecar).toHaveBeenCalledWith('binaries/morphodita-server', [
      '--log_file=',
      '8765',
      'czech-250909',
      '/opt/morphodita/appdata/models/czech-250909/czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
      'czech-250909-no_dia',
      '/opt/morphodita/appdata/models/czech-250909-no_dia/czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
    ]);
    expect(mocks.getLocalModelsDir).toHaveBeenCalledTimes(1);
  });

  it('fails closed before spawning when the local model is missing', async () => {
    mocks.validateLocalModelDirectory.mockRejectedValue(new Error('missing model directory'));

    await expect(OfflineSidecar.start()).rejects.toMatchObject({
      name: 'OfflineSidecarError',
      message: expect.stringContaining('open Settings and consent'),
    });
    expect(mocks.sidecar).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'wrong-id', artifact: 'czech.tagger' }, 'unexpected id or artifact'],
    [{ id: 'czech-250909', artifact: 'other.tagger' }, 'unexpected id or artifact'],
    [new Error('model artifact is empty'), 'model artifact is empty'],
    [new Error('model artifact SHA-256 mismatch'), 'SHA-256 mismatch'],
  ])('rejects an invalid canonical model before spawning: %s', async (result, detail) => {
    if (result instanceof Error) mocks.validateLocalModelDirectory.mockRejectedValue(result);
    else mocks.validateLocalModelDirectory.mockResolvedValue({ manifest: result });

    await expect(OfflineSidecar.start()).rejects.toMatchObject({
      name: 'OfflineSidecarError',
      message: expect.stringContaining(detail),
    });
    expect(mocks.sidecar).not.toHaveBeenCalled();
    expect(mocks.command.spawn).not.toHaveBeenCalled();
  });

  it('rejects an unrelated HTTP service that returns 200 without the bundled model', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ models: { unrelated: ['tag'] } }),
    } as Response);

    await expect(OfflineSidecar.start()).rejects.toMatchObject({ name: 'OfflineSidecarError' });
    expect(OfflineSidecar.getStatus().state).toBe('failed');
    expect(mocks.child.kill).toHaveBeenCalled();
  });

  it.each([
    { models: [] },
    { models: { 'czech-250909': [] } },
    { models: { 'czech-250909': ['tag', 'tag', 'analyze', 'generate', 'tokenize'] } },
    { models: { 'czech-250909': ['tag', 'analyze', 'generate', 'tokenize', 'other'] } },
    { models: { 'czech-250909': ['tag', 'analyze', 'generate'] } },
  ])('rejects malformed readiness capability payloads', async (payload) => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => payload } as Response);

    await expect(OfflineSidecar.start()).rejects.toBeInstanceOf(OfflineSidecarError);
  });

  it('validates the bundled model against its canonical manifest id', async () => {
    await OfflineSidecar.start();

    expect(mocks.validateLocalModelDirectory).toHaveBeenCalledWith(
      '/opt/morphodita/appdata/models/czech-250909',
      'czech-250909',
    );
  });

  it('returns a typed fail-closed error with explicit recovery actions', async () => {
    mocks.command.spawn.mockRejectedValueOnce(new Error('sidecar binary missing'));

    await expect(OfflineSidecar.start()).rejects.toMatchObject({
      name: 'OfflineSidecarError',
      code: 'OFFLINE_SIDECAR_UNAVAILABLE',
      recoveryActions: ['configure-local-assets', 'retry', 'switch-online'],
    } satisfies Partial<OfflineSidecarError>);
  });

  it('recovers from an address-in-use spawn on 8765 by trying 8766', async () => {
    const firstCommand = { ...mocks.command, on: vi.fn(), spawn: vi.fn() };
    const secondCommand = { ...mocks.command, on: vi.fn(), spawn: vi.fn() };
    mocks.sidecar.mockReturnValueOnce(firstCommand).mockReturnValueOnce(secondCommand);
    firstCommand.spawn.mockRejectedValueOnce(Object.assign(new Error('address already in use'), { code: 'EADDRINUSE' }));
    secondCommand.spawn.mockResolvedValueOnce(mocks.child);

    await expect(OfflineSidecar.start()).resolves.toBe('http://127.0.0.1:8766');

    expect(mocks.sidecar).toHaveBeenNthCalledWith(2, 'binaries/morphodita-server', expect.arrayContaining(['8766']));
    expect(mocks.validateLocalModelDirectory).toHaveBeenCalledTimes(2);
  });

  it.each([
    'EADDRINUSE',
    new Error('Address already in use (os error 98)'),
    { code: 'eaddrinuse' },
  ])('recognizes address-in-use rejection form: %s', async (error) => {
    mocks.command.spawn.mockRejectedValueOnce(error);

    await expect(OfflineSidecar.start()).resolves.toBe('http://127.0.0.1:8766');
    expect(mocks.sidecar).toHaveBeenCalledTimes(2);
  });

  it('fails closed for an unrelated spawn error instead of trying another port', async () => {
    mocks.command.spawn.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EACCES' }));

    await expect(OfflineSidecar.start()).rejects.toMatchObject({ name: 'OfflineSidecarError' });
    expect(mocks.sidecar).toHaveBeenCalledTimes(1);
  });

  it('moves to the next port promptly when the child dies during readiness', async () => {
    const firstCommand = { ...mocks.command, on: vi.fn(), spawn: vi.fn() };
    const secondCommand = { ...mocks.command, on: vi.fn(), spawn: vi.fn() };
    let firstClose: ((event: { code: number | null; signal: string | null }) => void) | undefined;
    firstCommand.on.mockImplementation((event: string, listener: typeof firstClose) => {
      if (event === 'close') firstClose = listener;
    });
    mocks.sidecar.mockReturnValueOnce(firstCommand).mockReturnValueOnce(secondCommand);
    firstCommand.spawn.mockResolvedValueOnce(mocks.child);
    secondCommand.spawn.mockResolvedValueOnce(mocks.child);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes(':8765')) throw new Error('not ready');
       return { ok: true, json: async () => ({ models: { 'czech-250909': ['tag', 'analyze', 'generate', 'tokenize'], 'czech-250909-no_dia': ['tag', 'analyze', 'generate', 'tokenize'] } }) } as Response;
    });

    const start = OfflineSidecar.start();
    await vi.waitFor(() => expect(firstClose).toBeDefined());
    firstClose?.({ code: 1, signal: null });
    await expect(start).resolves.toBe('http://127.0.0.1:8766');
    expect(mocks.sidecar).toHaveBeenCalledTimes(2);
  });

  it('awaits stop before restarting the same or a new model', async () => {
    await OfflineSidecar.start();
    let killed = false;
    mocks.child.kill.mockImplementationOnce(async () => {
      await Promise.resolve();
      killed = true;
    });

    // @ts-expect-error Caller-supplied model paths are intentionally not part of the API.
    await expect(OfflineSidecar.restart('/tmp/attacker-models')).resolves.toBe('http://127.0.0.1:8765');
    expect(killed).toBe(true);
    expect(mocks.child.kill).toHaveBeenCalledTimes(1);
    expect(mocks.sidecar).toHaveBeenLastCalledWith(
      'binaries/morphodita-server',
      expect.arrayContaining(['/opt/morphodita/appdata/models/czech-250909/czech.tagger']),
    );
  });

  it('matches only canonical Linux and Windows model paths in the shell contract', () => {
    const validator = getModelPathValidator();
    expect(validator.test('/opt/morphodita/appdata/models/czech-250909/czech.tagger')).toBe(true);
    expect(validator.test('C:\\Users\\Lukáš Novák\\AppData\\Roaming\\cz.ufal.morphodita\\models\\czech-250909\\czech.tagger')).toBe(true);
    expect(validator.test('/home/žluťoučký/.local/share/cz.ufal.morphodita/models/czech-250909/czech.tagger')).toBe(true);
    expect(validator.test('/home/jolanda/.local/share/cz.ufal.morphodita/models/czech-250909/czech.tagger')).toBe(true);
    expect(validator.test('/tmp/.offline-test/models/czech-250909/czech.tagger')).toBe(true);
    expect(validator.test('C:\\Users\\test\\AppData\\models\\czech-250909\\czech.tagger')).toBe(true);
  });

  it.each([
    '/opt/morphodita/appdata/models/../czech-250909/czech.tagger',
    'C:\\Users\\test\\AppData\\models\\..\\czech-250909\\czech.tagger',
    '/opt/morphodita/appdata/models/czech-250909/other.tagger',
    '/opt/morphodita/appdata/models/other/czech.tagger',
    'models/czech-250909/czech.tagger',
    '/opt/morphodita/appdata/models/czech-250909/czech.tagger\n',
    '/opt/morphodita/appdata/models/czech-250909/czech.tagger\0',
    '/tmp/arbitrary-model.tagger',
    '/home/jolanda/../models/czech-250909/czech.tagger',
    '/home/jolanda/./models/czech-250909/czech.tagger',
  ])('rejects unsafe or non-bundled model path: %s', (modelPath) => {
    expect(getModelPathValidator().test(modelPath)).toBe(false);
  });

  it('exposes ready/stopped lifecycle state and bounded diagnostics', async () => {
    mocks.command.stdout.on.mockImplementation((event: string, listener: (line: string) => void) => {
      if (event === 'data') listener('server ready');
    });

    await OfflineSidecar.start();

    expect(OfflineSidecar.getStatus()).toMatchObject({
      state: 'ready',
      port: 8765,
      baseUrl: 'http://127.0.0.1:8765',
    });
    expect(OfflineSidecar.getStatus().diagnostics).toContain('stdout: server ready');

    await OfflineSidecar.stop();

    expect(OfflineSidecar.getStatus()).toMatchObject({
      state: 'stopped',
      port: null,
      baseUrl: null,
      error: null,
    });
    expect(mocks.child.kill).toHaveBeenCalledTimes(1);
  });
});
