import { join } from '@tauri-apps/api/path';
import { exists, mkdir, open, readDir, readFile, remove, rename, stat, writeFile } from '@tauri-apps/plugin-fs';
import type { ModelCapability, ModelInfo } from '../types/api';
import { getLocalModelsDir } from './platformPaths';

const MODEL_MANIFEST_FILE = 'model.json';
const MODEL_ARTIFACT_EXTENSIONS = ['.mor', '.tagger'] as const;
const MODEL_MANIFEST_VERSION = 1;
const MAX_MODEL_ARTIFACT_BYTES = 512 * 1024 * 1024;

const textDecoder = new TextDecoder();

export interface ModelManifest {
  schemaVersion: number;
  id: string;
  version: string;
  language: string;
  artifact: string;
  artifactSizeBytes: number;
  artifactSha256: string;
  sourceUrl: string;
  license: ModelLicense;
  notices: string[];
  serverCompatibility: ModelCompatibility;
  description?: string;
  capabilities: ModelCapability[];
}

export interface ModelLicense {
  spdx: string;
  url?: string;
}

export interface ModelCompatibility {
  minServerVersion: string;
  maxServerVersion?: string;
}

export interface LocalModelInfo extends ModelInfo {
  path: string;
  version: string;
  sizeBytes: number;
  sha256: string;
  artifact: string;
  sourceUrl: string;
  license: ModelLicense;
  notices: string[];
  serverCompatibility: ModelCompatibility;
  manifest: ModelManifest;
}

export interface RejectedLocalModel {
  name: string;
  reason: string;
}

export interface LocalModelsInventory {
  directory: string;
  models: Record<string, LocalModelInfo>;
  rejected: RejectedLocalModel[];
}

export class LocalModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalModelError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function getUserModelsDir(): Promise<string> {
  try {
    return await getLocalModelsDir();
  } catch (error) {
    throw new LocalModelError(`User model directory is unavailable: ${errorDetail(error)}`);
  }
}

export async function getLocalModels(serverVersion?: string): Promise<LocalModelsInventory> {
  const directory = await getUserModelsDir();
  try {
    await mkdir(directory, { recursive: true });
    await reconcileRollbackDirectories(directory);
    const entries = await readDir(directory);
    const models: Record<string, LocalModelInfo> = {};
    const rejected: RejectedLocalModel[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory || entry.isSymlink || ROLLBACK_DIRECTORY_PATTERN.test(entry.name)) continue;
      try {
        const model = await validateLocalModelDirectory(await join(directory, entry.name), entry.name);
        if (serverVersion) assertModelCompatible(model.manifest, serverVersion);
        models[model.name] = model;
      } catch (error) {
        rejected.push({ name: entry.name, reason: errorDetail(error) });
      }
    }

    return { directory, models, rejected };
  } catch (error) {
    throw new LocalModelError(`Local model inventory failed: ${errorDetail(error)}`);
  }
}

export interface LocalModelImportOptions {
  allowUpdate?: boolean;
  serverVersion?: string;
}

export async function importLocalModel(
  sourceDirectory: string,
  options: LocalModelImportOptions = {},
): Promise<LocalModelInfo> {
  const sourceModel = await validateLocalModelDirectory(sourceDirectory);
  if (options.serverVersion) assertModelCompatible(sourceModel.manifest, options.serverVersion);
  const targetDirectory = await getUserModelsDir();
  const targetModelDirectory = await join(targetDirectory, sourceModel.manifest.id);
  const targetExists = await exists(targetModelDirectory);
  let existingModel: LocalModelInfo | undefined;
  if (targetExists) {
    if (!options.allowUpdate) {
      throw new LocalModelError(
        `Model import rejected: target already exists for ${sourceModel.manifest.id}`,
      );
    }
    existingModel = await validateLocalModelDirectory(targetModelDirectory, sourceModel.manifest.id);
    if (compareVersions(sourceModel.version, existingModel.version) <= 0) {
      throw new LocalModelError(
        `Model update rejected: ${sourceModel.version} is not newer than ${existingModel.version}`,
      );
    }
  }

  const temporaryDirectory = await join(
    targetDirectory,
    `.${sourceModel.manifest.id}.importing-${uniqueToken()}`,
  );
  const sourceEntries = await readDir(sourceDirectory);
  const declaredFiles = new Set([MODEL_MANIFEST_FILE, sourceModel.manifest.artifact, ...sourceModel.manifest.notices]);
  const filesToCopy = sourceEntries.filter(
    (entry) => entry.isFile && !entry.isSymlink && declaredFiles.has(entry.name),
  );

  try {
    await mkdir(temporaryDirectory, { recursive: true });
    for (const entry of filesToCopy) {
      const sourcePath = await join(sourceDirectory, entry.name);
      const targetPath = await join(temporaryDirectory, entry.name);
      await writeFile(targetPath, await readFile(sourcePath), { createNew: true });
    }

    const currentSourceModel = await validateLocalModelDirectory(sourceDirectory, sourceModel.manifest.id);
    if (!manifestsEqual(currentSourceModel.manifest, sourceModel.manifest)) {
      throw new LocalModelError('copied model manifest does not match the validated source');
    }

    // Revalidate the copied bytes before moving anything over an existing model.
    const copiedModel = await validateLocalModelDirectory(temporaryDirectory, sourceModel.manifest.id);
    if (!manifestsEqual(copiedModel.manifest, sourceModel.manifest)) {
      throw new LocalModelError('copied model manifest does not match the validated source');
    }

    let rollbackDirectory: string | null = null;
    if (existingModel) {
      rollbackDirectory = await join(
        targetDirectory,
        `.${sourceModel.manifest.id}.rollback-${uniqueToken()}`,
      );
      await rename(targetModelDirectory, rollbackDirectory);
    }
    try {
      await rename(temporaryDirectory, targetModelDirectory);
    } catch (error) {
      if (rollbackDirectory) {
        const rollbackErrors: string[] = [];
        try {
          if (await exists(targetModelDirectory)) {
            await remove(targetModelDirectory, { recursive: true });
          }
        } catch (cleanupError) {
          rollbackErrors.push(`cleanup failed: ${errorDetail(cleanupError)}`);
        }
        try {
          await rename(rollbackDirectory, targetModelDirectory);
        } catch (restoreError) {
          rollbackErrors.push(`rollback failed: ${errorDetail(restoreError)}`);
        }
        if (rollbackErrors.length > 0) {
          throw new LocalModelError(
            `atomic model replacement failed: publish failed: ${errorDetail(error)}; ${rollbackErrors.join('; ')}`,
          );
        }
      }
      throw error;
    }
    if (rollbackDirectory) {
      try {
        await remove(rollbackDirectory, { recursive: true });
      } catch (cleanupError) {
        const rollbackErrors: string[] = [];
        try {
          if (await exists(targetModelDirectory)) {
            await remove(targetModelDirectory, { recursive: true });
          }
        } catch (removeError) {
          rollbackErrors.push(`new model removal failed: ${errorDetail(removeError)}`);
        }
        try {
          await rename(rollbackDirectory, targetModelDirectory);
        } catch (restoreError) {
          rollbackErrors.push(`rollback failed: ${errorDetail(restoreError)}`);
        }
        if (rollbackErrors.length > 0) {
          throw new LocalModelError(
            `model import cleanup failed: ${errorDetail(cleanupError)}; ${rollbackErrors.join('; ')}`,
          );
        }
        throw new LocalModelError(
          `model import cleanup failed but prior model restored: ${errorDetail(cleanupError)}`,
        );
      }
    }
    return await validateLocalModelDirectory(targetModelDirectory, sourceModel.manifest.id);
  } catch (error) {
    let finalError = errorDetail(error);
    try {
      if (await exists(temporaryDirectory)) {
        await remove(temporaryDirectory, { recursive: true });
      }
    } catch (cleanupError) {
      finalError += `; temporary import cleanup failed: ${errorDetail(cleanupError)}`;
    }
    throw new LocalModelError(`Model import failed: ${finalError}`);
  }
}

export async function updateLocalModel(
  sourceDirectory: string,
  serverVersion?: string,
): Promise<LocalModelInfo> {
  return importLocalModel(sourceDirectory, { allowUpdate: true, serverVersion });
}

export function assertModelCompatible(manifest: ModelManifest, serverVersion: string): void {
  if (!isVersion(serverVersion)) {
    throw new LocalModelError(`invalid server version: ${serverVersion}`);
  }
  if (compareVersions(serverVersion, manifest.serverCompatibility.minServerVersion) < 0) {
    throw new LocalModelError(
      `model ${manifest.id} requires server >= ${manifest.serverCompatibility.minServerVersion}`,
    );
  }
  if (
    manifest.serverCompatibility.maxServerVersion &&
    compareVersions(serverVersion, manifest.serverCompatibility.maxServerVersion) > 0
  ) {
    throw new LocalModelError(
      `model ${manifest.id} supports server <= ${manifest.serverCompatibility.maxServerVersion}`,
    );
  }
}

export async function validateLocalModelDirectory(modelDirectory: string, expectedManifestId?: string): Promise<LocalModelInfo> {
  const directoryInfo = await stat(modelDirectory);
  if (!directoryInfo.isDirectory || directoryInfo.isSymlink) {
    throw new LocalModelError('model path is not a regular directory');
  }

  const entries = await readDir(modelDirectory);
  if (entries.some((entry) => entry.isSymlink || !entry.isFile)) {
    throw new LocalModelError('model directory contains an unsupported nested or symlink entry');
  }

  const manifestEntry = entries.find((entry) => entry.name === MODEL_MANIFEST_FILE);
  if (!manifestEntry) {
    throw new LocalModelError(`missing ${MODEL_MANIFEST_FILE}`);
  }

  const manifestPath = await join(modelDirectory, MODEL_MANIFEST_FILE);
  if (manifestEntry.isSymlink || !manifestEntry.isFile) {
    throw new LocalModelError('model manifest is not a regular file');
  }
  const manifest = parseManifest(textDecoder.decode(await readBoundedFile(manifestPath, 1024 * 1024, 'model manifest')));
  if (expectedManifestId !== undefined && manifest.id !== expectedManifestId) {
    throw new LocalModelError(`model manifest id does not match expected id ${expectedManifestId}`);
  }
  for (const notice of manifest.notices) {
    const noticeEntry = entries.find((entry) => entry.isFile && entry.name === notice);
    if (!noticeEntry) throw new LocalModelError(`missing declared notice file: ${notice}`);
  }
  const artifactEntries = entries.filter(
    (entry) => entry.isFile && isModelArtifact(entry.name),
  );
  if (artifactEntries.length !== 1 || artifactEntries[0].name !== manifest.artifact) {
    throw new LocalModelError('model directory must contain exactly the manifest artifact');
  }

  const artifactPath = await join(modelDirectory, manifest.artifact);
  if (manifest.artifactSizeBytes > MAX_MODEL_ARTIFACT_BYTES) {
    throw new LocalModelError('model artifact exceeds the 512 MiB limit');
  }
  const artifact = await readBoundedFile(artifactPath, MAX_MODEL_ARTIFACT_BYTES, 'model artifact', manifest.artifactSizeBytes);
  const sha256 = await sha256Hex(artifact);
  if (sha256 !== manifest.artifactSha256) {
    throw new LocalModelError(
      `model artifact SHA-256 mismatch: expected ${manifest.artifactSha256}, got ${sha256}`,
    );
  }

  return {
    name: manifest.id,
    language: titleCase(manifest.language),
    description: manifest.description || 'Offline model (local server)',
    capabilities: manifest.capabilities,
    path: modelDirectory,
    version: manifest.version,
    sizeBytes: artifact.byteLength,
    sha256,
    artifact: manifest.artifact,
    sourceUrl: manifest.sourceUrl,
    license: manifest.license,
    notices: manifest.notices,
    serverCompatibility: manifest.serverCompatibility,
    manifest,
  };
}

async function readBoundedFile(
  path: string,
  maximumBytes: number,
  description: string,
  expectedSize?: number,
): Promise<Uint8Array> {
  const file = await open(path, { read: true });
  try {
    const initial = await file.stat();
    if (!initial.isFile || initial.isSymlink) {
      throw new LocalModelError(`${description} is not a bounded regular file`);
    }
    if (initial.size === 0) throw new LocalModelError(`${description} is empty`);
    if (initial.size > maximumBytes) {
      throw new LocalModelError(`${description} exceeds the ${maximumBytes === 1024 * 1024 ? '1 MiB' : '512 MiB'} limit`);
    }
    if (expectedSize !== undefined && initial.size !== expectedSize) {
      throw new LocalModelError(`${description} size mismatch: expected ${expectedSize}, got ${initial.size}`);
    }
    const buffer = new Uint8Array(expectedSize ?? initial.size);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const count = await file.read(buffer.subarray(offset));
      if (count === null || count === 0) {
        throw new LocalModelError(`${description} was truncated while being read`);
      }
      offset += count;
    }
    const extra = new Uint8Array(1);
    const extraCount = await file.read(extra);
    if (extraCount !== null && extraCount > 0) {
      throw new LocalModelError(`${description} grew while being read`);
    }
    const final = await file.stat();
    if (!sameOpenedFile(initial, final) || final.size !== buffer.byteLength) {
      throw new LocalModelError(`${description} was replaced or changed while being read`);
    }
    return buffer;
  } finally {
    await file.close();
  }
}

function sameOpenedFile(left: { size: number; dev?: number | null; ino?: number | null }, right: { size: number; dev?: number | null; ino?: number | null }): boolean {
  return left.size === right.size &&
    (left.dev === null || left.dev === undefined || right.dev === null || right.dev === undefined || left.dev === right.dev) &&
    (left.ino === null || left.ino === undefined || right.ino === null || right.ino === undefined || left.ino === right.ino);
}

const ROLLBACK_DIRECTORY_PATTERN = /^\.([^/\\]+)\.rollback-([^/\\]+)$/;

async function reconcileRollbackDirectories(directory: string): Promise<void> {
  const entries = await readDir(directory);
  const candidates = new Map<string, Array<{ name: string; token: string }>>();
  for (const entry of entries) {
    if (!entry.isDirectory || entry.isSymlink) continue;
    const match = ROLLBACK_DIRECTORY_PATTERN.exec(entry.name);
    if (!match || !isSafeName(match[1]) || !isSafeName(match[2])) continue;
    const candidatePath = await join(directory, entry.name);
    const candidateInfo = await stat(candidatePath);
    if (!candidateInfo.isDirectory || candidateInfo.isSymlink) continue;
    const group = candidates.get(match[1]) || [];
    group.push({ name: entry.name, token: match[2] });
    candidates.set(match[1], group);
  }

  for (const [id, group] of candidates) {
    const targetDirectory = await join(directory, id);
    if (await exists(targetDirectory)) continue;
    group.sort((left, right) => right.token.localeCompare(left.token) || right.name.localeCompare(left.name));
    for (const candidate of group) {
      const candidatePath = await join(directory, candidate.name);
      try {
        await validateLocalModelDirectory(candidatePath, id);
        await rename(candidatePath, targetDirectory);
        break;
      } catch {
        // Retain invalid rollback evidence and try the next deterministic candidate.
      }
    }
  }
}

function parseManifest(raw: string): ModelManifest {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new LocalModelError('model manifest is not valid JSON');
  }
  if (!isRecord(candidate)) {
    throw new LocalModelError('model manifest must be an object');
  }
  const manifest: ModelManifest = {
    schemaVersion: candidate.schemaVersion as number,
    id: candidate.id as string,
    version: candidate.version as string,
    language: candidate.language as string,
    artifact: candidate.artifact as string,
    artifactSizeBytes: candidate.artifactSizeBytes as number,
    artifactSha256: candidate.artifactSha256 as string,
    sourceUrl: candidate.sourceUrl as string,
    license: candidate.license as ModelLicense,
    notices: candidate.notices as string[],
    serverCompatibility: candidate.serverCompatibility as ModelCompatibility,
    description: candidate.description as string | undefined,
    capabilities: candidate.capabilities as ModelCapability[],
  };
  if (manifest.schemaVersion !== MODEL_MANIFEST_VERSION) {
    throw new LocalModelError(`unsupported model manifest schema ${String(manifest.schemaVersion)}`);
  }
  if (
    !isSafeName(manifest.id) ||
    !isVersion(manifest.version) ||
    typeof candidate.language !== 'string' ||
    (candidate.description !== undefined && typeof candidate.description !== 'string') ||
    !manifest.language.trim() ||
    !isHttpsUrl(manifest.sourceUrl)
  ) {
    throw new LocalModelError('model manifest has invalid id, version, language or source URL');
  }
  if (!isSafeName(manifest.artifact) || !isModelArtifact(manifest.artifact)) {
    throw new LocalModelError('model manifest has an invalid model artifact name');
  }
  if (
    !isRecord(manifest.license) ||
    typeof manifest.license.spdx !== 'string' ||
    !manifest.license.spdx.trim() ||
    (manifest.license.url !== undefined && !isHttpsUrl(manifest.license.url))
  ) {
    throw new LocalModelError('model manifest has invalid license metadata');
  }
  if (
    !isSafeInteger(manifest.artifactSizeBytes) ||
    !isSha256(manifest.artifactSha256)
  ) {
    throw new LocalModelError('model manifest has invalid artifact size or SHA-256');
  }
  manifest.artifactSha256 = manifest.artifactSha256.toLowerCase();
  if (
    !Array.isArray(manifest.notices) ||
    manifest.notices.length === 0 ||
    manifest.notices.some((notice) => !isSafeName(notice) || !isNoticeFile(notice)) ||
    new Set(manifest.notices).size !== manifest.notices.length
  ) {
    throw new LocalModelError('model manifest must declare safe notice files');
  }
  if (
    !isRecord(manifest.serverCompatibility) ||
    !isVersion(manifest.serverCompatibility.minServerVersion) ||
    (manifest.serverCompatibility.maxServerVersion !== undefined &&
      !isVersion(manifest.serverCompatibility.maxServerVersion)) ||
    (manifest.serverCompatibility.maxServerVersion !== undefined &&
      compareVersions(manifest.serverCompatibility.minServerVersion, manifest.serverCompatibility.maxServerVersion) > 0)
  ) {
    throw new LocalModelError('model manifest has invalid server compatibility metadata');
  }
  if (!isCapabilityArray(manifest.capabilities)) {
    throw new LocalModelError('model manifest capabilities must be nonempty and duplicate-free');
  }
  return manifest;
}

function isModelArtifact(name: string): boolean {
  const lowerName = name.toLowerCase();
  return MODEL_ARTIFACT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function isNoticeFile(name: string): boolean {
  return /^(readme|license|notice)([._-].*)?$/i.test(name);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:';
  } catch {
    return false;
  }
}

function isVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)) return false;
  return (value.split('-')[1]?.split('.') ?? []).every((identifier) =>
    !/^\d+$/.test(identifier) || identifier === '0' || !identifier.startsWith('0'),
  );
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('-')[0].split('.').map(Number);
  const rightParts = right.split('-')[0].split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  const leftPre = left.split('-')[1]?.split('.') ?? [];
  const rightPre = right.split('-')[1]?.split('.') ?? [];
  if (leftPre.length === 0 || rightPre.length === 0) return leftPre.length === rightPre.length ? 0 : leftPre.length === 0 ? 1 : -1;
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index += 1) {
    if (leftPre[index] === undefined) return -1;
    if (rightPre[index] === undefined) return 1;
    const leftIdentifier = leftPre[index];
    const rightIdentifier = rightPre[index];
    if (leftIdentifier === rightIdentifier) continue;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) return Number(leftIdentifier) - Number(rightIdentifier);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function isSafeName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/]/.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 0x20)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new LocalModelError('SHA-256 is unavailable in this runtime');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-fA-F]{64}$/.test(value);
}

function isCapabilityArray(value: unknown): value is ModelCapability[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const allowed = new Set<ModelCapability>(['tag', 'analyze', 'generate', 'tokenize']);
  return value.every((capability): capability is ModelCapability => allowed.has(capability as ModelCapability)) &&
    new Set(value).size === value.length;
}

function manifestsEqual(left: ModelManifest, right: ModelManifest): boolean {
  return left.schemaVersion === right.schemaVersion &&
    left.id === right.id &&
    left.version === right.version &&
    left.language === right.language &&
    left.artifact === right.artifact &&
    left.artifactSizeBytes === right.artifactSizeBytes &&
    left.artifactSha256 === right.artifactSha256 &&
    left.sourceUrl === right.sourceUrl &&
    left.license.spdx === right.license.spdx &&
    left.license.url === right.license.url &&
    left.notices.length === right.notices.length &&
    left.notices.every((notice, index) => notice === right.notices[index]) &&
    left.serverCompatibility.minServerVersion === right.serverCompatibility.minServerVersion &&
    left.serverCompatibility.maxServerVersion === right.serverCompatibility.maxServerVersion &&
    left.description === right.description &&
    left.capabilities.length === right.capabilities.length &&
    left.capabilities.every((capability, index) => capability === right.capabilities[index]);
}

function uniqueToken(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
