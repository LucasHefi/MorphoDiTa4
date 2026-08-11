import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentWindow: vi.fn(),
  stop: vi.fn(),
  destroy: vi.fn(),
  onCloseRequested: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: mocks.getCurrentWindow }));
vi.mock('./offlineSidecar', () => ({ OfflineSidecar: { stop: mocks.stop } }));

import { registerAppCloseHook } from './appLifecycle';

describe('app close lifecycle', () => {
  beforeEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('prevents close, awaits sidecar stop, destroys the window, and cleans up', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    const unlisten = vi.fn();
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
    mocks.onCloseRequested.mockImplementation((listener: typeof handler) => {
      handler = listener;
      return Promise.resolve(unlisten);
    });
    mocks.getCurrentWindow.mockReturnValue({ onCloseRequested: mocks.onCloseRequested, destroy: mocks.destroy });
    mocks.stop.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(undefined);

    const cleanup = await registerAppCloseHook();
    const preventDefault = vi.fn();
    await handler?.({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.stop.mock.invocationCallOrder[0]).toBeLessThan(mocks.destroy.mock.invocationCallOrder[0]);
    cleanup?.();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('returns no cleanup handle when the browser preview has no Tauri window', async () => {
    mocks.getCurrentWindow.mockImplementation(() => { throw new Error('window.__TAURI_INTERNALS__ is unavailable'); });

    await expect(registerAppCloseHook()).resolves.toBeNull();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it('rejects native registration failures instead of treating them as browser preview', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} });
    const registrationError = new Error('registration details must remain a rejection');
    mocks.getCurrentWindow.mockReturnValue({
      onCloseRequested: vi.fn().mockRejectedValue(registrationError),
    });

    await expect(registerAppCloseHook()).rejects.toBe(registrationError);
  });
});
