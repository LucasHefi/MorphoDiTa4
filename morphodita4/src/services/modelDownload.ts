import { invoke } from '@tauri-apps/api/core';
import type { ModelCapability } from '../types/api';

export interface ModelCatalogLicense {
  spdx: string;
  name: string;
  url: string;
  commercialUse: boolean;
}

export interface ModelCatalogNotice {
  archivePath: string;
  fileName: string;
}

export interface ModelCatalogEntry {
  id: string;
  version: string;
  language: string;
  sourceUrl: string;
  downloadUrl: string;
  archiveName: string;
  archiveSizeBytes: number;
  archiveMd5: string;
  archiveSha256: string;
  archivePrefix: string;
  archiveEntries: string[];
  artifactPath: string;
  artifactName: string;
  artifactSizeBytes: number;
  artifactSha256: string;
  license: ModelCatalogLicense;
  noticeEntries: ModelCatalogNotice[];
  serverCompatibility: {
    minServerVersion: string;
    maxServerVersion?: string;
  };
  capabilities: ModelCapability[];
}

export interface ModelCatalog {
  schemaVersion: number;
  models: ModelCatalogEntry[];
}

export interface DownloadedModel {
  id: string;
  version: string;
  path: string;
  artifact: string;
  sha256: string;
}

export class ModelDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelDownloadError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function parseModelCatalog(value: unknown): ModelCatalog {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.models) || value.models.length === 0) {
    throw new ModelDownloadError('model catalog is malformed');
  }
  const models = value.models.map((candidate) => parseModelCatalogEntry(candidate));
  const ids = new Set(models.map((model) => model.id));
  if (ids.size !== models.length) throw new ModelDownloadError('model catalog contains duplicate IDs');
  return { schemaVersion: 1, models };
}

function parseModelCatalogEntry(value: unknown): ModelCatalogEntry {
  if (!isRecord(value)) throw new ModelDownloadError('model catalog entry is malformed');
  const requiredStrings = [
    'id', 'version', 'language', 'sourceUrl', 'downloadUrl', 'archiveName', 'archiveMd5',
    'archiveSha256', 'archivePrefix', 'artifactPath', 'artifactName', 'artifactSha256',
  ];
  if (requiredStrings.some((key) => typeof value[key] !== 'string' || !String(value[key]).trim())) {
    throw new ModelDownloadError('model catalog entry has missing string metadata');
  }
  if (
    !isSafeInteger(value.archiveSizeBytes) || !isSafeInteger(value.artifactSizeBytes) ||
    !Array.isArray(value.archiveEntries) || value.archiveEntries.length === 0 ||
    !value.archiveEntries.every((entry) => typeof entry === 'string') ||
    typeof value.artifactPath !== 'string' || !value.archiveEntries.includes(value.artifactPath) ||
    !isRecord(value.license) || typeof value.license.spdx !== 'string' ||
    typeof value.license.name !== 'string' || typeof value.license.url !== 'string' ||
    !isHttpsUrl(value.license.url) ||
    value.license.commercialUse !== false || !Array.isArray(value.noticeEntries) ||
    !value.noticeEntries.every((notice) => isRecord(notice) && typeof notice.archivePath === 'string' && typeof notice.fileName === 'string') ||
    !isRecord(value.serverCompatibility) || typeof value.serverCompatibility.minServerVersion !== 'string' ||
    !isHttpsUrl(value.sourceUrl) || !isHttpsUrl(value.downloadUrl) ||
    !isVersion(value.version) || !isVersion(value.serverCompatibility.minServerVersion) ||
    (value.serverCompatibility.maxServerVersion !== undefined && !isVersion(value.serverCompatibility.maxServerVersion)) ||
    !isHex(value.archiveMd5, 32) || !isSha256(value.archiveSha256) || !isSha256(value.artifactSha256) ||
    !isCapabilityArray(value.capabilities)
  ) {
    throw new ModelDownloadError('model catalog entry has invalid integrity or license metadata');
  }
  return {
    ...(value as unknown as ModelCatalogEntry),
    archiveSha256: String(value.archiveSha256).toLowerCase(),
    artifactSha256: String(value.artifactSha256).toLowerCase(),
  };
}

export const MODEL_CATALOG = parseModelCatalog({
  schemaVersion: 1,
  models: [{
    id: 'czech-250909',
    version: '2.1.0',
    language: 'czech',
    sourceUrl: 'https://hdl.handle.net/11234/1-5985',
    downloadUrl: 'https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/a5d20e52-fc3d-4bc4-9df9-5b4c36839dcc/content',
    archiveName: 'czech-morfflex2.1-pdtc2.0-250909.zip',
    archiveSizeBytes: 102852507,
    archiveMd5: '6d4a664404947ef33083076845db7655',
    archiveSha256: '4dcc33862cd4a2919c1079cd843d0e68b8ebbe01ea8895bb02179805e03774e7',
    archivePrefix: 'czech-morfflex2.1-pdtc2.0-250909/',
    archiveEntries: [
      'czech-morfflex2.1-pdtc2.0-250909/',
      'czech-morfflex2.1-pdtc2.0-250909/LICENSE',
      'czech-morfflex2.1-pdtc2.0-250909/README',
      'czech-morfflex2.1-pdtc2.0-250909/README.html',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-250909.dict',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-250909-no_dia.dict',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-250909-no_dia-pos_only.dict',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-250909-pos_only.dict',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-pdtc2.0-250909-no_dia.tagger',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-pdtc2.0-250909-no_dia-pos_only.tagger',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-pdtc2.0-250909-pos_only.tagger',
      'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-pdtc2.0-250909.tagger',
    ],
    artifactPath: 'czech-morfflex2.1-pdtc2.0-250909/czech-morfflex2.1-pdtc2.0-250909.tagger',
    artifactName: 'czech.tagger',
    artifactSizeBytes: 26176905,
    artifactSha256: '173ea80a38d4ebb53a3e85a74f91ad02827738472809f155d965ce225d27cc3e',
    license: {
      spdx: 'CC-BY-NC-SA-4.0',
      name: 'CC BY-NC-SA 4.0',
      url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      commercialUse: false,
    },
    noticeEntries: [
      { archivePath: 'czech-morfflex2.1-pdtc2.0-250909/LICENSE', fileName: 'LICENSE.txt' },
      { archivePath: 'czech-morfflex2.1-pdtc2.0-250909/README', fileName: 'README.txt' },
    ],
    serverCompatibility: { minServerVersion: '1.11.3', maxServerVersion: '1.11.3' },
    capabilities: ['tag', 'analyze', 'generate', 'tokenize'],
  }],
});

export function getModelCatalog(): ModelCatalog {
  return MODEL_CATALOG;
}

export async function downloadModel(modelId: string, consent: boolean): Promise<DownloadedModel> {
  if (!consent) throw new ModelDownloadError('model download requires explicit license consent');
  const model = MODEL_CATALOG.models.find((candidate) => candidate.id === modelId);
  if (!model) throw new ModelDownloadError(`model is not available in the catalog: ${modelId}`);
  return invoke<DownloadedModel>('download_model', { modelId: model.id, consent: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === 'string' && new RegExp(`^[0-9a-fA-F]{${length}}$`).test(value);
}

function isVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return false;
  return (value.split('-')[1]?.split('.') ?? []).every((identifier) =>
    !/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0'),
  );
}

function isCapabilityArray(value: unknown): value is ModelCapability[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const allowed = new Set<ModelCapability>(['tag', 'analyze', 'generate', 'tokenize']);
  return value.every((capability) => allowed.has(capability as ModelCapability)) && new Set(value).size === value.length;
}
