import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import {
  MODEL_CATALOG,
  ModelDownloadError,
  downloadModel,
  parseModelCatalog,
} from './modelDownload';

describe('model download contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('contains the pinned official LINDAT source and non-commercial license', () => {
    const model = MODEL_CATALOG.models[0];
    expect(model.downloadUrl).toMatch(/^https:\/\/lindat\.mff\.cuni\.cz\/repository\/server\/api\/core\/bitstreams\//);
    expect(model.sourceUrl).toBe('https://hdl.handle.net/11234/1-5985');
    expect(model.archiveSizeBytes).toBe(102852507);
    expect(model.license).toMatchObject({ spdx: 'CC-BY-NC-SA-4.0', commercialUse: false });
  });

  it('rejects malformed catalog data', () => {
    expect(() => parseModelCatalog({ schemaVersion: 1, models: [{}] })).toThrow(ModelDownloadError);
  });

  it('does not invoke a download when consent is absent', async () => {
    await expect(downloadModel('czech-250909', false)).rejects.toThrow('explicit license consent');
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('invokes only the allowlisted model ID after consent', async () => {
    mocks.invoke.mockResolvedValue({
      id: 'czech-250909',
      version: '2.1.0',
      path: '/appdata/models/czech-250909',
      artifact: 'czech.tagger',
      sha256: '173ea80a38d4ebb53a3e85a74f91ad02827738472809f155d965ce225d27cc3e',
    });
    await expect(downloadModel('czech-250909', true)).resolves.toMatchObject({ id: 'czech-250909' });
    expect(mocks.invoke).toHaveBeenCalledWith('download_model', { modelId: 'czech-250909', consent: true });
  });
});
