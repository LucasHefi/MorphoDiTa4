import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => {
  const directories = new Set<string>();
  const files = new Map<string, Uint8Array>();
  const normalize = (path: string) => path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const addDirectory = (path: string) => {
    const normalized = normalize(path);
    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    directories.add('/');
    for (const part of parts) {
      current += `/${part}`;
      directories.add(current);
    }
  };
  const addFile = (path: string, content: string | Uint8Array) => {
    const normalized = normalize(path);
    addDirectory(normalized.slice(0, normalized.lastIndexOf('/')) || '/');
    files.set(normalized, typeof content === 'string' ? new TextEncoder().encode(content) : content);
  };
  const directEntries = (path: string) => {
    const normalized = normalize(path);
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    const entries = new Map<string, { name: string; isDirectory: boolean; isFile: boolean; isSymlink: boolean }>();
    for (const directory of Array.from(directories)) {
      if (!directory.startsWith(prefix) || directory === normalized) continue;
      const name = directory.slice(prefix.length).split('/')[0];
      if (name && !entries.has(name)) entries.set(name, { name, isDirectory: true, isFile: false, isSymlink: false });
    }
    for (const file of Array.from(files.keys())) {
      if (!file.startsWith(prefix)) continue;
      const name = file.slice(prefix.length).split('/')[0];
      if (name && !entries.has(name)) entries.set(name, { name, isDirectory: false, isFile: true, isSymlink: false });
    }
    return Array.from(entries.values());
  };
  const reset = () => {
    directories.clear();
    files.clear();
    addDirectory('/data/models');
    addDirectory('/downloads');
  };
  const moveTree = (oldPath: string, newPath: string) => {
    const oldPrefix = `${normalize(oldPath)}/`;
    const newPrefix = `${normalize(newPath)}/`;
    const movedDirectories = Array.from(directories)
      .filter((path) => path === normalize(oldPath) || path.startsWith(oldPrefix))
      .map((path) => [path, path === normalize(oldPath) ? normalize(newPath) : `${newPrefix}${path.slice(oldPrefix.length)}`] as const);
    const movedFiles = Array.from(files.entries())
      .filter(([path]) => path.startsWith(oldPrefix))
      .map(([path, content]) => [`${newPrefix}${path.slice(oldPrefix.length)}`, content] as const);
    for (const path of Array.from(directories)) if (path === normalize(oldPath) || path.startsWith(oldPrefix)) directories.delete(path);
    for (const path of Array.from(files.keys())) if (path.startsWith(oldPrefix)) files.delete(path);
    for (const [from, to] of movedDirectories) {
      void from;
      directories.add(to);
    }
    for (const [path, content] of movedFiles) files.set(path, content);
  };
  const appDataDir = vi.fn(async () => '/data');
  const join = vi.fn(async (...parts: string[]) => normalize(parts.join('/')));
  const exists = vi.fn(async (path: string) => directories.has(normalize(path)) || files.has(normalize(path)));
  const mkdir = vi.fn(async (path: string) => addDirectory(path));
  const readDir = vi.fn(async (path: string) => directEntries(path));
  const readFile = vi.fn(async (path: string) => {
    const content = files.get(normalize(path));
    if (!content) throw new Error(`missing file: ${path}`);
    return content.slice();
  });
  const stat = vi.fn(async (path: string) => {
    const normalized = normalize(path);
    if (directories.has(normalized)) return { isDirectory: true, isFile: false, isSymlink: false, size: 0 };
    const content = files.get(normalized);
    if (content) return { isDirectory: false, isFile: true, isSymlink: false, size: content.byteLength };
    throw new Error(`missing path: ${path}`);
  });
  const writeFile = vi.fn(async (path: string, content: Uint8Array, options?: { createNew?: boolean }) => {
    const normalized = normalize(path);
    if (options?.createNew && (directories.has(normalized) || files.has(normalized))) throw new Error('already exists');
    addFile(normalized, content);
  });
  const rename = vi.fn(async (oldPath: string, newPath: string) => {
    const destination = normalize(newPath);
    if (directories.has(destination) || files.has(destination)) throw new Error('destination exists');
    moveTree(oldPath, newPath);
  });
  const remove = vi.fn(async (path: string) => {
    const normalized = normalize(path);
    for (const directory of Array.from(directories)) if (directory === normalized || directory.startsWith(`${normalized}/`)) directories.delete(directory);
    for (const file of Array.from(files.keys())) if (file === normalized || file.startsWith(`${normalized}/`)) files.delete(file);
  });
  return { directories, files, reset, addDirectory, addFile, appDataDir, join, exists, mkdir, readDir, readFile, stat, writeFile, rename, remove };
});

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: fsState.appDataDir, join: fsState.join }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: fsState.exists,
  mkdir: fsState.mkdir,
  readDir: fsState.readDir,
  readFile: fsState.readFile,
  remove: fsState.remove,
  rename: fsState.rename,
  stat: fsState.stat,
  writeFile: fsState.writeFile,
}));

import { assertModelCompatible, getLocalModels, importLocalModel, updateLocalModel } from './localModels';

const manifest = (id = 'czech-sample', version = '1.0.0') =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    version,
    language: 'czech',
    artifact: 'model.mor',
    sourceUrl: 'https://models.example.test/czech-sample',
    license: { spdx: 'CC-BY-4.0', url: 'https://spdx.org/licenses/CC-BY-4.0.html' },
    notices: ['NOTICE.txt'],
    serverCompatibility: { minServerVersion: '1.0.0', maxServerVersion: '2.0.0' },
    description: 'Fixture model',
    capabilities: ['tag'],
  });

function addValidModel(directory: string, id = 'czech-sample', version = '1.0.0') {
  fsState.addDirectory(directory);
  fsState.addFile(`${directory}/model.json`, manifest(id, version));
  fsState.addFile(`${directory}/model.mor`, new Uint8Array([1, 2, 3]));
  fsState.addFile(`${directory}/NOTICE.txt`, 'Fixture notice');
}

describe('local model inventory and import', () => {
  beforeAll(() => {
    vi.stubGlobal('crypto', webcrypto);
  });

  beforeEach(() => {
    fsState.reset();
    vi.clearAllMocks();
  });

  it('inventories only valid app-data models and reports rejected directories', async () => {
    addValidModel('/data/models/czech-sample');
    fsState.addDirectory('/data/models/partial');
    fsState.addFile('/data/models/partial/model.json', manifest('partial'));
    fsState.addFile('/data/models/partial/NOTICE.txt', 'Fixture notice');

    const inventory = await getLocalModels();

    expect(inventory.directory).toBe('/data/models');
    expect(inventory.models['czech-sample']).toMatchObject({
      version: '1.0.0',
      sizeBytes: 3,
      artifact: 'model.mor',
    });
    expect(inventory.models['czech-sample'].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inventory.rejected).toEqual([{ name: 'partial', reason: 'model directory must contain exactly the manifest artifact' }]);
  });

  it('copies a valid model into a temporary directory and publishes it with rename', async () => {
    fsState.addDirectory('/downloads/czech-sample');
    fsState.addFile('/downloads/czech-sample/model.json', manifest());
    fsState.addFile('/downloads/czech-sample/model.mor', new Uint8Array([4, 5, 6]));
    fsState.addFile('/downloads/czech-sample/NOTICE.txt', 'Fixture notice');
    fsState.addFile('/downloads/czech-sample/README.txt', 'fixture');
    fsState.addFile('/downloads/czech-sample/untrusted.bin', new Uint8Array([9]));

    const imported = await importLocalModel('/downloads/czech-sample');

    expect(imported.path).toBe('/data/models/czech-sample');
    expect(fsState.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/data\/models\/\.czech-sample\.importing-/),
      '/data/models/czech-sample',
    );
    expect(fsState.files.has('/data/models/czech-sample/model.json')).toBe(true);
    expect(fsState.files.has('/data/models/czech-sample/model.mor')).toBe(true);
    expect(fsState.files.has('/data/models/czech-sample/NOTICE.txt')).toBe(true);
    expect(fsState.files.has('/data/models/czech-sample/README.txt')).toBe(true);
    expect(fsState.files.has('/data/models/czech-sample/untrusted.bin')).toBe(false);
  });

  it('rejects a partial import before creating or renaming a target', async () => {
    fsState.addDirectory('/downloads/broken');
    fsState.addFile('/downloads/broken/model.json', manifest('broken'));
    fsState.addFile('/downloads/broken/NOTICE.txt', 'Fixture notice');

    await expect(importLocalModel('/downloads/broken')).rejects.toThrow(
      'model directory must contain exactly the manifest artifact',
    );
    expect(fsState.rename).not.toHaveBeenCalled();
    expect(Array.from(fsState.directories).some((path) => path.includes('.broken.importing-'))).toBe(false);
  });

  it('rejects duplicate ids and atomically updates only to a newer version', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/downloads/czech-sample-v2', 'czech-sample', '2.0.0');
    fsState.addFile('/downloads/czech-sample-v2/model.mor', new Uint8Array([7, 8, 9]));

    await expect(importLocalModel('/downloads/czech-sample-v2')).rejects.toThrow('target already exists');
    const updated = await updateLocalModel('/downloads/czech-sample-v2', '1.5.0');

    expect(updated.version).toBe('2.0.0');
    expect(updated.sizeBytes).toBe(3);
    expect(fsState.files.get('/data/models/czech-sample/model.mor')).toEqual(new Uint8Array([7, 8, 9]));
    expect(Array.from(fsState.directories).some((path) => path.includes('.rollback-'))).toBe(false);
  });

  it('reports incompatible models explicitly and fails closed before activation', async () => {
    addValidModel('/data/models/czech-sample');
    const modelManifest = JSON.parse(manifest());

    expect(() => assertModelCompatible(modelManifest, '0.9.0')).toThrow('requires server >= 1.0.0');
    const inventory = await getLocalModels(undefined, '0.9.0');
    expect(inventory.models).toEqual({});
    expect(inventory.rejected[0].reason).toContain('requires server >= 1.0.0');
  });
});
