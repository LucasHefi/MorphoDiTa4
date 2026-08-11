// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readReleaseMetadata, validateReleaseMetadata } from './releaseMetadata.mjs';

describe('release metadata', () => {
  it('keeps the application version aligned across all release manifests', async () => {
    const metadata = await readReleaseMetadata();

    expect(metadata.schemaVersion.source).toBe(4);
    expect(metadata.schemaVersion.docs).toHaveLength(4);
    expect(validateReleaseMetadata(metadata)).toEqual({
      version: '0.1.0',
      license: 'MPL-2.0',
      modelLicenses: ['CC BY-NC-SA 4.0'],
      repository: 'https://github.com/LucasHefi/MorphoDiTa4',
      authors: ['MorphoDiTa Client contributors'],
      openGates: ['model-commercial-distribution'],
    });
  });

  it.each([
    ['version', (model) => { model.version = '9.9.9'; }],
    ['source URL', (model) => { model.sourceUrl = 'https://example.invalid/source'; }],
    ['checksum', (model) => { model.archiveSha256 = '0'.repeat(64); }],
    ['license SPDX', (model) => { model.licenseSpdx = 'MIT'; }],
    ['commercial-use flag', (model) => { model.commercialUse = true; }],
    ['size', (model) => { model.artifactSizeBytes += 1; }],
    ['capability', (model) => { model.capabilities = ['tag']; }],
  ])('rejects a model-catalog %s mutation', async (_field, mutate) => {
    const metadata = structuredClone(await readReleaseMetadata());
    mutate(metadata.models[0]);

    expect(() => validateReleaseMetadata(metadata)).toThrow(/does not match model-catalog|SPDX/);
  });

  it('rejects duplicate and non-exact model ID sets', async () => {
    const duplicate = structuredClone(await readReleaseMetadata());
    duplicate.models.push(structuredClone(duplicate.models[0]));
    expect(() => validateReleaseMetadata(duplicate)).toThrow(/IDs must be unique/);

    const missing = structuredClone(await readReleaseMetadata());
    missing.models = [];
    expect(() => validateReleaseMetadata(missing)).toThrow(/exactly match/);

    const extra = structuredClone(await readReleaseMetadata());
    extra.modelCatalog.models.push({ ...extra.modelCatalog.models[0], id: 'extra-model' });
    expect(() => validateReleaseMetadata(extra)).toThrow(/exactly match/);
  });
});
