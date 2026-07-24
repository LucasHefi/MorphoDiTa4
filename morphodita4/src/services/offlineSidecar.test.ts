import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  child: { kill: vi.fn() },
  command: {
    on: vi.fn(),
    spawn: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  },
  sidecar: vi.fn(),
  getBundledModelsDir: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { sidecar: mocks.sidecar },
}));

vi.mock('./platformPaths', () => ({
  getBundledModelsDir: mocks.getBundledModelsDir,
}));

import { OfflineSidecar, OfflineSidecarError } from './offlineSidecar';

describe('OfflineSidecar platform path handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.child.kill.mockResolvedValue(undefined);
    mocks.command.spawn.mockResolvedValue(mocks.child);
    mocks.sidecar.mockReturnValue(mocks.command);
    mocks.getBundledModelsDir.mockResolvedValue('/opt/morphodita/resources/models');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(async () => {
    await OfflineSidecar.stop();
    vi.unstubAllGlobals();
  });

  it('passes the Tauri resource path unchanged on Linux-style paths', async () => {
    await expect(OfflineSidecar.start()).resolves.toBe('http://127.0.0.1:8765');

    expect(mocks.sidecar).toHaveBeenCalledWith('morphodita-server', [
      '8765',
      'czech-250909',
      '/opt/morphodita/resources/models/czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
    ]);
  });

  it('passes a Windows-style explicit model path unchanged', async () => {
    await expect(OfflineSidecar.start('C:\\Program Files\\MorphoDiTa\\models')).resolves.toBe('http://127.0.0.1:8765');

    expect(mocks.sidecar).toHaveBeenCalledWith('morphodita-server', [
      '8765',
      'czech-250909',
      'C:\\Program Files\\MorphoDiTa\\models\\czech.tagger',
      'https://hdl.handle.net/11234/1-5985',
    ]);
    expect(mocks.getBundledModelsDir).not.toHaveBeenCalled();
  });

  it('returns a typed fail-closed error with explicit recovery actions', async () => {
    mocks.command.spawn.mockRejectedValueOnce(new Error('sidecar binary missing'));

    await expect(OfflineSidecar.start()).rejects.toMatchObject({
      name: 'OfflineSidecarError',
      code: 'OFFLINE_SIDECAR_UNAVAILABLE',
      recoveryActions: ['configure-local-assets', 'retry', 'switch-online'],
    } satisfies Partial<OfflineSidecarError>);
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
