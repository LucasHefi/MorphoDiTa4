import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(appRoot, relativePath), 'utf8'));
}

function readCargoVersion(cargoToml) {
  const match = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error('Cargo.toml is missing package.version');
  return match[1];
}

export async function readReleaseMetadata() {
  const [source, packageManifest, packageLock, cargoToml, tauriConfig, modelCatalog, bundledModelArtifacts, schemaSource, schemaDocs] = await Promise.all([
    readJson('release-metadata.json'),
    readJson('package.json'),
    readJson('package-lock.json'),
    readFile(join(appRoot, 'src-tauri/Cargo.toml'), 'utf8'),
    readJson('src-tauri/tauri.conf.json'),
    readJson('model-catalog.json'),
    findBundledModelArtifacts(join(appRoot, 'models')),
    readFile(join(appRoot, 'src-tauri/src/db.rs'), 'utf8'),
    Promise.all([
      readFile(join(appRoot, '../docs/database-recovery.md'), 'utf8'),
      readFile(join(appRoot, '../docs/development_guide.md'), 'utf8'),
      readFile(join(appRoot, '../README.md'), 'utf8'),
      readFile(join(appRoot, 'README.md'), 'utf8'),
    ]),
  ]);
  const schemaVersionMatch = schemaSource.match(/pub const SCHEMA_VERSION: i32 = (\d+);/);
  if (!schemaVersionMatch) throw new Error('db.rs is missing SCHEMA_VERSION');

  return {
    ...source,
    models: source.models.map((model) => {
      const catalogModel = modelCatalog.models.find((candidate) => candidate.id === model.id);
      return {
        ...model,
        language: catalogModel?.language,
        licenseSpdx: catalogModel?.license?.spdx,
        archivePrefix: catalogModel?.archivePrefix,
        archiveEntries: catalogModel?.archiveEntries,
        artifactPath: catalogModel?.artifactPath,
        serverCompatibility: catalogModel?.serverCompatibility,
        capabilities: catalogModel?.capabilities,
      };
    }),
    schemaVersion: {
      source: Number(schemaVersionMatch[1]),
      docs: schemaDocs,
    },
    manifestVersions: {
      source: source.version,
      package: packageManifest.version,
      packageLock: packageLock.version,
      packageLockRoot: packageLock.packages?.['']?.version,
      cargo: readCargoVersion(cargoToml),
      tauri: tauriConfig.version,
    },
    packageLicense: packageManifest.license,
    modelLicenses: modelCatalog.models.map((model) => model.license?.spdx),
    modelCatalog,
    bundledModelArtifacts,
  };
}

export function validateReleaseMetadata(metadata) {
  const sourceIds = metadata.models.map((model) => model.id);
  const catalogIds = metadata.modelCatalog.models.map((model) => model.id);
  if (new Set(sourceIds).size !== sourceIds.length || new Set(catalogIds).size !== catalogIds.length) {
    throw new Error('release metadata model IDs must be unique');
  }
  if (sourceIds.length !== catalogIds.length || sourceIds.some((id) => !catalogIds.includes(id)) || catalogIds.some((id) => !sourceIds.includes(id))) {
    throw new Error('release metadata model IDs must exactly match model-catalog');
  }
  const versions = Object.entries(metadata.manifestVersions);
  const mismatchedVersions = versions.filter(([, version]) => version !== metadata.version);
  if (mismatchedVersions.length > 0) {
    throw new Error(`release version mismatch: ${JSON.stringify(mismatchedVersions)}`);
  }
  if (metadata.license !== 'MIT' || metadata.packageLicense !== 'MIT') {
    throw new Error('application license must be MIT in metadata and package.json');
  }
  if (
    metadata.modelLicenses.length !== metadata.models.length ||
    metadata.models.length !== metadata.modelCatalog.models.length
  ) {
    throw new Error('every declared model must expose one SPDX license');
  }
  if (metadata.modelLicenses.some((license, index) => license !== metadata.modelCatalog.models[index]?.license?.spdx)) {
    throw new Error('declared model SPDX licenses do not match model-catalog');
  }
  if (metadata.bundledModelArtifacts.length > 0) {
    throw new Error(`bundled model artifacts are forbidden: ${metadata.bundledModelArtifacts.join(', ')}`);
  }
  if (
    metadata.schemaVersion.source !== 4 ||
    !metadata.schemaVersion.docs[0].includes('current accepted schema version is `4`') ||
    !metadata.schemaVersion.docs[1].includes('canonical version-4') ||
    !metadata.schemaVersion.docs[2].includes('PRAGMA user_version = 4') ||
    !metadata.schemaVersion.docs[3].includes('schema version 4')
  ) {
    throw new Error('schema version references are not synchronized to canonical version 4');
  }
  for (const model of metadata.models) {
    const catalogModel = metadata.modelCatalog.models.find((candidate) => candidate.id === model.id);
    if (
      !catalogModel ||
      model.version !== catalogModel.version ||
      model.sourceUrl !== catalogModel.sourceUrl ||
      model.downloadUrl !== catalogModel.downloadUrl ||
      model.archiveName !== catalogModel.archiveName ||
      model.archiveSizeBytes !== catalogModel.archiveSizeBytes ||
      model.archiveMd5 !== catalogModel.archiveMd5 ||
      model.archiveSha256 !== catalogModel.archiveSha256 ||
      model.artifactName !== catalogModel.artifactName ||
      model.artifactSizeBytes !== catalogModel.artifactSizeBytes ||
      model.artifactSha256 !== catalogModel.artifactSha256 ||
      model.license !== catalogModel.license?.name ||
      model.licenseSpdx !== catalogModel.license?.spdx ||
      model.commercialUse !== catalogModel.license?.commercialUse ||
      model.language !== catalogModel.language ||
      model.archivePrefix !== catalogModel.archivePrefix ||
      !sameArray(model.archiveEntries, catalogModel.archiveEntries) ||
      model.artifactPath !== catalogModel.artifactPath ||
      !sameArray(
        model.noticeFiles,
        catalogModel.noticeEntries?.map((notice) => `runtime:${notice.fileName}`),
      ) ||
      !sameObject(model.serverCompatibility, catalogModel.serverCompatibility) ||
      !sameArray(model.capabilities, catalogModel.capabilities) ||
      model.noticeFiles?.length === 0 ||
      model.noticeFiles.some((file) => file.startsWith('models/'))
    ) {
      throw new Error(`model ${model.id} does not match model-catalog provenance`);
    }
  }
  return {
    version: metadata.version,
    license: metadata.license,
    modelLicenses: metadata.models.map((model) => model.license),
    repository: metadata.repository,
    authors: metadata.authors,
    openGates: metadata.openGates,
  };
}

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameObject(left, right) {
  return left && right &&
    left.minServerVersion === right.minServerVersion &&
    left.maxServerVersion === right.maxServerVersion;
}

async function findBundledModelArtifacts(directory) {
  try {
    await access(directory);
  } catch {
    return [];
  }
  const artifacts = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (/\.(?:tagger|mor|zip)$/i.test(entry.name)) {
        artifacts.push(path);
      }
    }
  }
  await visit(directory);
  return artifacts;
}
