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
  const [source, packageManifest, packageLock, cargoToml, tauriConfig, modelCatalog, bundledModelArtifacts] = await Promise.all([
    readJson('release-metadata.json'),
    readJson('package.json'),
    readJson('package-lock.json'),
    readFile(join(appRoot, 'src-tauri/Cargo.toml'), 'utf8'),
    readJson('src-tauri/tauri.conf.json'),
    readJson('model-catalog.json'),
    findBundledModelArtifacts(join(appRoot, 'models')),
  ]);

  return {
    ...source,
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
  const versions = Object.entries(metadata.manifestVersions);
  const mismatchedVersions = versions.filter(([, version]) => version !== metadata.version);
  if (mismatchedVersions.length > 0) {
    throw new Error(`release version mismatch: ${JSON.stringify(mismatchedVersions)}`);
  }
  if (metadata.license !== 'MPL-2.0' || metadata.packageLicense !== 'MPL-2.0') {
    throw new Error('application license must be MPL-2.0 in metadata and package.json');
  }
  if (metadata.modelLicenses.length !== metadata.models.length) {
    throw new Error('every declared model must expose one SPDX license');
  }
  if (metadata.bundledModelArtifacts.length > 0) {
    throw new Error(`bundled model artifacts are forbidden: ${metadata.bundledModelArtifacts.join(', ')}`);
  }
  for (const model of metadata.models) {
    const catalogModel = metadata.modelCatalog.models.find((candidate) => candidate.id === model.id);
    if (
      !model.license ||
      !model.sourceUrl ||
      !model.downloadUrl ||
      model.noticeFiles?.length === 0 ||
      !catalogModel ||
      catalogModel.downloadUrl !== model.downloadUrl ||
      model.noticeFiles.some((file) => file.startsWith('models/'))
    ) {
      throw new Error(`model ${model.id} is missing provenance or notice metadata`);
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
