import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readFile, remove, rename, stat, writeFile } from '@tauri-apps/plugin-fs';
import type { ModelInfo } from '../types/api';

const USER_MODELS_DIRECTORY = 'models';
const MODEL_MANIFEST_FILE = 'model.json';
const MODEL_ARTIFACT_EXTENSION = '.mor';
const MODEL_MANIFEST_VERSION = 1;

const textDecoder = new TextDecoder();

export interface ModelManifest {
  schemaVersion: number;
  id: string;
  version: string;
  language: string;
  artifact: string;
  sourceUrl: string;
  license: ModelLicense;
  notices: string[];
  serverCompatibility: ModelCompatibility;
  description?: string;
  capabilities?: string[];
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
    return await join(await appDataDir(), USER_MODELS_DIRECTORY);
  } catch (error) {
    throw new LocalModelError(`User model directory is unavailable: ${errorDetail(error)}`);
  }
}

export async function getLocalModels(modelsPath?: string, serverVersion?: string): Promise<LocalModelsInventory> {
  const directory = modelsPath || (await getUserModelsDir());
  try {
    await mkdir(directory, { recursive: true });
    const entries = await readDir(directory);
    const models: Record<string, LocalModelInfo> = {};
    const rejected: RejectedLocalModel[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory || entry.isSymlink) continue;
      try {
        const model = await readModelDirectory(await join(directory, entry.name));
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
  const sourceModel = await readModelDirectory(sourceDirectory);
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
    existingModel = await readModelDirectory(targetModelDirectory);
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
  const filesToCopy = sourceEntries.filter(
    (entry) => entry.isFile && !entry.isSymlink && isAllowedModelFile(entry.name),
  );

  try {
    await mkdir(temporaryDirectory, { recursive: true });
    for (const entry of filesToCopy) {
      const sourcePath = await join(sourceDirectory, entry.name);
      const targetPath = await join(temporaryDirectory, entry.name);
      await writeFile(targetPath, await readFile(sourcePath), { createNew: true });
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
        await remove(targetModelDirectory, { recursive: true }).catch(() => undefined);
        await rename(rollbackDirectory, targetModelDirectory).catch(() => undefined);
      }
      throw error;
    }
    if (rollbackDirectory) await remove(rollbackDirectory, { recursive: true }).catch(() => undefined);
    return await readModelDirectory(targetModelDirectory);
  } catch (error) {
    await remove(temporaryDirectory, { recursive: true }).catch(() => undefined);
    throw new LocalModelError(`Model import failed: ${errorDetail(error)}`);
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

async function readModelDirectory(modelDirectory: string): Promise<LocalModelInfo> {
  const directoryInfo = await stat(modelDirectory);
  if (!directoryInfo.isDirectory || directoryInfo.isSymlink) {
    throw new LocalModelError('model path is not a regular directory');
  }

  const entries = await readDir(modelDirectory);
  if (entries.some((entry) => entry.isSymlink || entry.isDirectory)) {
    throw new LocalModelError('model directory contains an unsupported nested or symlink entry');
  }

  const manifestEntry = entries.find((entry) => entry.isFile && entry.name === MODEL_MANIFEST_FILE);
  if (!manifestEntry) {
    throw new LocalModelError(`missing ${MODEL_MANIFEST_FILE}`);
  }

  const manifestPath = await join(modelDirectory, MODEL_MANIFEST_FILE);
  const manifest = parseManifest(textDecoder.decode(await readFile(manifestPath)));
  for (const notice of manifest.notices) {
    const noticeEntry = entries.find((entry) => entry.isFile && entry.name === notice);
    if (!noticeEntry) throw new LocalModelError(`missing declared notice file: ${notice}`);
  }
  const artifactEntries = entries.filter(
    (entry) => entry.isFile && entry.name.toLowerCase().endsWith(MODEL_ARTIFACT_EXTENSION),
  );
  if (artifactEntries.length !== 1 || artifactEntries[0].name !== manifest.artifact) {
    throw new LocalModelError('model directory must contain exactly the manifest artifact');
  }

  const artifactPath = await join(modelDirectory, manifest.artifact);
  const artifact = await readFile(artifactPath);
  if (artifact.byteLength === 0) {
    throw new LocalModelError('model artifact is empty');
  }
  const artifactInfo = await stat(artifactPath);
  const sha256 = await sha256Hex(artifact);

  return {
    name: manifest.id,
    language: titleCase(manifest.language),
    description: manifest.description || 'Offline model (local server)',
    capabilities: manifest.capabilities || [],
    path: modelDirectory,
    version: manifest.version,
    sizeBytes: artifactInfo.size,
    sha256,
    artifact: manifest.artifact,
    sourceUrl: manifest.sourceUrl,
    license: manifest.license,
    notices: manifest.notices,
    serverCompatibility: manifest.serverCompatibility,
    manifest,
  };
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
    sourceUrl: candidate.sourceUrl as string,
    license: candidate.license as ModelLicense,
    notices: candidate.notices as string[],
    serverCompatibility: candidate.serverCompatibility as ModelCompatibility,
    description: candidate.description as string | undefined,
    capabilities: candidate.capabilities as string[] | undefined,
  };
  if (manifest.schemaVersion !== MODEL_MANIFEST_VERSION) {
    throw new LocalModelError(`unsupported model manifest schema ${String(manifest.schemaVersion)}`);
  }
  if (
    !isSafeName(manifest.id) ||
    !isVersion(manifest.version) ||
    !manifest.language.trim() ||
    !isHttpUrl(manifest.sourceUrl)
  ) {
    throw new LocalModelError('model manifest has invalid id, version, language or source URL');
  }
  if (!isSafeName(manifest.artifact) || !manifest.artifact.toLowerCase().endsWith(MODEL_ARTIFACT_EXTENSION)) {
    throw new LocalModelError('model manifest has an invalid .mor artifact name');
  }
  if (
    !isRecord(manifest.license) ||
    typeof manifest.license.spdx !== 'string' ||
    !manifest.license.spdx.trim() ||
    (manifest.license.url !== undefined && !isHttpUrl(manifest.license.url))
  ) {
    throw new LocalModelError('model manifest has invalid license metadata');
  }
  if (
    !Array.isArray(manifest.notices) ||
    manifest.notices.length === 0 ||
    manifest.notices.some((notice) => !isSafeName(notice) || !isNoticeFile(notice))
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
  if (manifest.capabilities && (!Array.isArray(manifest.capabilities) || manifest.capabilities.some((value) => typeof value !== 'string'))) {
    throw new LocalModelError('model manifest capabilities must be strings');
  }
  return manifest;
}

function isAllowedModelFile(name: string): boolean {
  return name === MODEL_MANIFEST_FILE || name.toLowerCase().endsWith(MODEL_ARTIFACT_EXTENSION) || isNoticeFile(name);
}

function isNoticeFile(name: string): boolean {
  return /^(readme|license|notice)([._-].*)?$/i.test(name);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('-')[0].split('.').map(Number);
  const rightParts = right.split('-')[0].split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
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

function uniqueToken(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
