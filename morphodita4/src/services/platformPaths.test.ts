import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveResource } from '@tauri-apps/api/path';
import { getBundledModelsDir } from './platformPaths';

vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: vi.fn(),
}));

describe('getBundledModelsDir', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the Tauri-resolved resource path without assuming a host separator', async () => {
    vi.mocked(resolveResource).mockResolvedValue('C:\\Program Files\\MorphoDiTa\\resources\\models');

    await expect(getBundledModelsDir()).resolves.toBe('C:\\Program Files\\MorphoDiTa\\resources\\models');
    expect(resolveResource).toHaveBeenCalledWith('models');
  });

  it('keeps a missing resource explicit', async () => {
    vi.mocked(resolveResource).mockRejectedValue(new Error('resource lookup failed'));

    await expect(getBundledModelsDir()).rejects.toThrow(
      'Bundled MorphoDiTa models resource is unavailable: resource lookup failed',
    );
  });
});
