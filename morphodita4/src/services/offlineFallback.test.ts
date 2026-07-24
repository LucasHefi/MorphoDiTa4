import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  appSettings: {
    useOfflineMode: true,
    offlineFallbackEnabled: true,
  },
  setTransportStatus: vi.fn(),
  sidecar: {
    getCurrentOfflineBaseUrl: vi.fn(),
    start: vi.fn(),
  },
  fetch: vi.fn(),
}));

vi.mock('./offlineSidecar', () => ({ OfflineSidecar: state.sidecar }));
vi.mock('../store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({ ...state.appSettings, setTransportStatus: state.setTransportStatus }),
  },
}));

import { MorphoDiTaAPI } from './api';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', state.fetch);
  state.appSettings.useOfflineMode = true;
  state.appSettings.offlineFallbackEnabled = true;
  state.sidecar.getCurrentOfflineBaseUrl.mockReturnValue(null);
  state.sidecar.start.mockRejectedValue(
    Object.assign(new Error('sidecar binary missing'), {
      name: 'OfflineSidecarError',
      code: 'OFFLINE_SIDECAR_UNAVAILABLE',
      recoveryActions: ['configure-local-assets', 'retry', 'switch-online'],
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('offline mode fail-closed boundary', () => {
  it('does not fall back to the remote API when the sidecar is unavailable', async () => {
    await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({
      name: 'OfflineSidecarError',
      code: 'OFFLINE_SIDECAR_UNAVAILABLE',
      recoveryActions: ['configure-local-assets', 'retry', 'switch-online'],
    });

    expect(state.fetch).not.toHaveBeenCalled();
  });
});

describe('online-first fallback boundary', () => {
  it('tries the online API first and then uses the local fallback after server failure', async () => {
    vi.useFakeTimers();
    state.appSettings.useOfflineMode = false;
    state.sidecar.start.mockResolvedValue('http://127.0.0.1:8765');
    state.fetch.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://lindat.mff.cuni.cz')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'service unavailable',
          headers: { get: () => null },
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ models: { 'local-model': ['tag'] } }),
      });
    });

    const request = MorphoDiTaAPI.getModels();
    await vi.runAllTimersAsync();
    await expect(request).resolves.toMatchObject({ models: { 'local-model': expect.anything() } });

    expect(state.fetch.mock.calls[0][0]).toContain('https://lindat.mff.cuni.cz');
    expect(state.fetch.mock.calls[state.fetch.mock.calls.length - 1]?.[0]).toContain('http://127.0.0.1:8765');
    expect(state.sidecar.start).toHaveBeenCalledTimes(1);
    expect(state.setTransportStatus).toHaveBeenCalledWith('offline', 'offline-fallback');
  });

  it('does not use the local fallback for permanent client errors', async () => {
    state.appSettings.useOfflineMode = false;
    state.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'invalid request',
      headers: { get: () => null },
    });

    await expect(MorphoDiTaAPI.getModels()).rejects.toMatchObject({ status: 400 });
    expect(state.sidecar.start).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
});
