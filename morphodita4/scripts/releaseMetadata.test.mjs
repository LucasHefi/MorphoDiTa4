import { describe, expect, it } from 'vitest';
import { readReleaseMetadata, validateReleaseMetadata } from './releaseMetadata.mjs';

describe('release metadata', () => {
  it('keeps the application version aligned across all release manifests', async () => {
    const metadata = await readReleaseMetadata();

    expect(validateReleaseMetadata(metadata)).toEqual({
      version: '0.1.0',
      license: 'MPL-2.0',
      modelLicenses: ['CC BY-NC-SA 4.0'],
      repository: null,
      authors: ['MorphoDiTa Client contributors'],
      openGates: ['repository-mapping', 'model-commercial-distribution'],
    });
  });
});
