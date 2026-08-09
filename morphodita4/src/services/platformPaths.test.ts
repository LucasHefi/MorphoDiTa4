import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appDataDir, join } from '@tauri-apps/api/path';
import { getLocalModelsDir } from './platformPaths';

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(),
  join: vi.fn(),
}));

describe('getLocalModelsDir', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('resolves the app-data models directory without assuming a host separator', async () => {
    vi.mocked(appDataDir).mockResolvedValue('C:\\Users\\test\\AppData');
    vi.mocked(join).mockResolvedValue('C:\\Users\\test\\AppData\\models');

    await expect(getLocalModelsDir()).resolves.toBe('C:\\Users\\test\\AppData\\models');
    expect(appDataDir).toHaveBeenCalledOnce();
    expect(join).toHaveBeenCalledWith('C:\\Users\\test\\AppData', 'models');
  });

  it('keeps an unavailable app-data directory explicit', async () => {
    vi.mocked(appDataDir).mockRejectedValue(new Error('app data lookup failed'));

    await expect(getLocalModelsDir()).rejects.toThrow(
      'Local MorphoDiTa models directory is unavailable: app data lookup failed',
    );
  });
});
