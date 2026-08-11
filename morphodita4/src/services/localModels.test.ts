// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fsState = vi.hoisted(() => {
  const directories = new Set<string>();
  const files = new Map<string, Uint8Array>();
  const fileIds = new Map<string, number>();
  const symlinks = new Set<string>();
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
    fileIds.set(normalized, (fileIds.get(normalized) ?? 0) + 1);
  };
  const addSymlink = (path: string) => symlinks.add(normalize(path));
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
    for (const symlink of Array.from(symlinks)) {
      if (!symlink.startsWith(prefix)) continue;
      const name = symlink.slice(prefix.length).split('/')[0];
      if (name && !entries.has(name)) entries.set(name, { name, isDirectory: false, isFile: false, isSymlink: true });
    }
    return Array.from(entries.values());
  };
  const reset = () => {
    directories.clear();
    files.clear();
    fileIds.clear();
    symlinks.clear();
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
    if (symlinks.has(normalized)) return { isDirectory: false, isFile: false, isSymlink: true, size: 0 };
    if (directories.has(normalized)) return { isDirectory: true, isFile: false, isSymlink: false, size: 0 };
    const content = files.get(normalized);
    if (content) return { isDirectory: false, isFile: true, isSymlink: false, size: content.byteLength };
    throw new Error(`missing path: ${path}`);
  });
  const open = vi.fn(async (path: string) => {
    const normalized = normalize(path);
    let offset = 0;
    return {
      stat: async () => {
        const content = files.get(normalized);
        if (!content) throw new Error(`missing file: ${path}`);
        return { isDirectory: false, isFile: true, isSymlink: false, size: content.byteLength, ino: fileIds.get(normalized), dev: 1 };
      },
      read: async (buffer: Uint8Array) => {
        const content = files.get(normalized);
        if (!content || offset >= content.byteLength) return null;
        const count = Math.min(buffer.byteLength, content.byteLength - offset);
        buffer.set(content.subarray(offset, offset + count));
        offset += count;
        return count;
      },
      close: vi.fn(async () => undefined),
    };
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
  return { directories, files, reset, addDirectory, addFile, addSymlink, appDataDir, join, exists, mkdir, readDir, readFile, stat, open, writeFile, rename, remove };
});

vi.mock('@tauri-apps/api/path', () => ({ appDataDir: fsState.appDataDir, join: fsState.join }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: fsState.exists,
  mkdir: fsState.mkdir,
  readDir: fsState.readDir,
  open: fsState.open,
  readFile: fsState.readFile,
  remove: fsState.remove,
  rename: fsState.rename,
  stat: fsState.stat,
  writeFile: fsState.writeFile,
}));

import { assertModelCompatible, getLocalModels, importLocalModel, LocalModelError, updateLocalModel, validateLocalModelDirectory } from './localModels';

const artifactHashes: Record<string, string> = {
  '1,2,3': '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  '4,5,6': '787c798e39a5bc1910355bae6d0cd87a36b2e10fd0202a83e3bb6b005da83472',
  '7,8,9': '66a6757151f8ee55db127716c7e3dce0be8074b64e20eda542e5c1e46ca9c41e',
};
const manifest = (id = 'czech-sample', version = '1.0.0', artifact = 'model.mor', bytes = [1, 2, 3]) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    version,
    language: 'czech',
    artifact,
    artifactSizeBytes: bytes.length,
    artifactSha256: artifactHashes[bytes.join(',')],
    sourceUrl: 'https://models.example.test/czech-sample',
    license: { spdx: 'CC-BY-4.0', url: 'https://spdx.org/licenses/CC-BY-4.0.html' },
    notices: ['NOTICE.txt'],
    serverCompatibility: { minServerVersion: '1.0.0', maxServerVersion: '2.0.0' },
    description: 'Fixture model',
    capabilities: ['tag'],
  });

function addValidModel(directory: string, id = 'czech-sample', version = '1.0.0', bytes = [1, 2, 3]) {
  fsState.addDirectory(directory);
  fsState.addFile(`${directory}/model.json`, manifest(id, version, 'model.mor', bytes));
  fsState.addFile(`${directory}/model.mor`, new Uint8Array(bytes));
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
    expect(fsState.appDataDir).toHaveBeenCalledOnce();
    expect(fsState.join).toHaveBeenCalledWith('/data', 'models');
    expect(inventory.models['czech-sample']).toMatchObject({
      version: '1.0.0',
      sizeBytes: 3,
      artifact: 'model.mor',
    });
    expect(inventory.models['czech-sample'].sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(inventory.rejected).toEqual([{ name: 'partial', reason: 'model directory must contain exactly the manifest artifact' }]);
  });

  it.each([
    ['language', '"language":42'],
    ['description', '"description":42'],
  ])('turns malformed manifest %s into LocalModelError', async (_name, replacement) => {
    const raw = manifest('malformed').replace(
      replacement.startsWith('language') ? '"language":"czech"' : '"description":"Fixture model"',
      replacement,
    );
    fsState.addDirectory('/data/models/malformed');
    fsState.addFile('/data/models/malformed/model.json', raw);
    fsState.addFile('/data/models/malformed/model.mor', new Uint8Array([1, 2, 3]));
    fsState.addFile('/data/models/malformed/NOTICE.txt', 'Fixture notice');

    await expect(validateLocalModelDirectory('/data/models/malformed')).rejects.toBeInstanceOf(LocalModelError);
  });

  it('requires the canonical directory name to match the manifest id', async () => {
    addValidModel('/data/models/wrong-directory', 'czech-sample');

    const inventory = await getLocalModels();

    expect(inventory.models).toEqual({});
    expect(inventory.rejected[0].reason).toContain('manifest id');
  });

  it('accepts the runtime-downloaded tagger artifact format', async () => {
    fsState.addDirectory('/data/models/czech-250909');
    fsState.addFile('/data/models/czech-250909/model.json', manifest('czech-250909', '2.1.0', 'czech.tagger'));
    fsState.addFile('/data/models/czech-250909/czech.tagger', new Uint8Array([1, 2, 3]));
    fsState.addFile('/data/models/czech-250909/NOTICE.txt', 'Fixture notice');

    const inventory = await getLocalModels();

    expect(inventory.models['czech-250909']).toMatchObject({ artifact: 'czech.tagger', sizeBytes: 3 });
  });

  it.each([
    ['grows', (path: string) => fsState.addFile(path, new Uint8Array([1, 2, 3, 4]))],
    ['is truncated', (path: string) => fsState.addFile(path, new Uint8Array([1, 2]))],
    ['is replaced', (path: string) => fsState.addFile(path, new Uint8Array([9, 9, 9]))],
  ])('rejects an artifact that %s after its handle is opened', async (_name, mutate) => {
    addValidModel('/data/models/racy-artifact');
    const realOpen = fsState.open.getMockImplementation()!;
    const wrapHandle = async (path: string, shouldMutate: boolean) => {
      const handle = await realOpen(path);
      if (shouldMutate) {
        const read = handle.read;
        let changed = false;
        handle.read = async (buffer: Uint8Array) => {
          const count = await read(buffer);
          if (!changed) {
            changed = true;
            mutate(path);
          }
          return count;
        };
      }
      return handle;
    };
    fsState.open
      .mockImplementationOnce((path: string) => wrapHandle(path, false))
      .mockImplementationOnce((path: string) => wrapHandle(path, true));

    await expect(validateLocalModelDirectory('/data/models/racy-artifact')).rejects.toThrow();
  });

  it('copies a valid model into a temporary directory and publishes it with rename', async () => {
    fsState.addDirectory('/downloads/czech-sample');
    fsState.addFile('/downloads/czech-sample/model.json', manifest('czech-sample', '1.0.0', 'model.mor', [4, 5, 6]));
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
    expect(fsState.files.has('/data/models/czech-sample/README.txt')).toBe(false);
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

  it('revalidates copied bytes when the source changes after source validation', async () => {
    fsState.addDirectory('/downloads/racy');
    fsState.addFile('/downloads/racy/model.json', manifest('racy'));
    fsState.addFile('/downloads/racy/model.mor', new Uint8Array([1, 2, 3]));
    fsState.addFile('/downloads/racy/NOTICE.txt', 'Fixture notice');
    const originalReadFile = fsState.readFile.getMockImplementation()!;
    let sourceArtifactReads = 0;
    fsState.readFile.mockImplementation(async (path: string) => {
      const content = await originalReadFile(path);
      if (path === '/downloads/racy/model.mor' && sourceArtifactReads++ === 0) {
        fsState.addFile(path, new Uint8Array([9, 9, 9]));
      }
      return content;
    });

    await expect(importLocalModel('/downloads/racy')).rejects.toThrow('SHA-256 mismatch');
    expect(fsState.rename).not.toHaveBeenCalled();
    expect(fsState.directories.has('/data/models/racy')).toBe(false);
  });

  it('rejects a same-id copied manifest whose provenance or version changed after validation', async () => {
    fsState.addDirectory('/downloads/racy-manifest');
    fsState.addFile('/downloads/racy-manifest/model.json', manifest('racy-manifest', '1.0.0'));
    fsState.addFile('/downloads/racy-manifest/model.mor', new Uint8Array([1, 2, 3]));
    fsState.addFile('/downloads/racy-manifest/NOTICE.txt', 'Fixture notice');
    const originalReadFile = fsState.readFile.getMockImplementation()!;
    let manifestReads = 0;
    fsState.readFile.mockImplementation(async (path: string) => {
      const content = await originalReadFile(path);
      if (path === '/downloads/racy-manifest/model.json' && manifestReads++ === 0) {
        fsState.addFile(path, manifest('racy-manifest', '2.0.0').replace(
          'https://models.example.test/racy-manifest',
          'https://other.example.test/racy-manifest',
        ));
      }
      return content;
    });

    await expect(importLocalModel('/downloads/racy-manifest')).rejects.toThrow(
      'copied model manifest does not match the validated source',
    );
    expect(fsState.rename).not.toHaveBeenCalled();
  });

  it('rejects a copied manifest whose source URL changed after validation', async () => {
    fsState.addDirectory('/downloads/racy-source');
    fsState.addFile('/downloads/racy-source/model.json', manifest('racy-source'));
    fsState.addFile('/downloads/racy-source/model.mor', new Uint8Array([1, 2, 3]));
    fsState.addFile('/downloads/racy-source/NOTICE.txt', 'Fixture notice');
    const originalReadFile = fsState.readFile.getMockImplementation()!;
    let manifestReads = 0;
    fsState.readFile.mockImplementation(async (path: string) => {
      const content = await originalReadFile(path);
      if (path === '/downloads/racy-source/model.json' && manifestReads++ === 0) {
        fsState.addFile(
          path,
          manifest('racy-source').replace(
            'https://models.example.test/czech-sample',
            'https://other.example.test/racy-source',
          ),
        );
      }
      return content;
    });

    await expect(importLocalModel('/downloads/racy-source')).rejects.toThrow(
      'copied model manifest does not match the validated source',
    );
    expect(fsState.rename).not.toHaveBeenCalled();
  });

  it('restores an existing model when publish fails before creating the target', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/downloads/czech-sample-v2', 'czech-sample', '2.0.0', [7, 8, 9]);
    const realRename = fsState.rename.getMockImplementation()!;
    fsState.rename
      .mockImplementationOnce(realRename)
      .mockImplementationOnce(async () => { throw new Error('publish unavailable'); })
      .mockImplementationOnce(realRename);

    await expect(updateLocalModel('/downloads/czech-sample-v2')).rejects.toThrow(
      'publish unavailable',
    );
    expect(fsState.files.get('/data/models/czech-sample/model.mor')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('restores an existing model when rollback backup cleanup fails after publish', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/downloads/czech-sample-v2', 'czech-sample', '2.0.0', [7, 8, 9]);
    const realRemove = fsState.remove.getMockImplementation()!;
    fsState.remove.mockImplementationOnce(async () => { throw new Error('backup cleanup unavailable'); }).mockImplementation(realRemove);

    await expect(updateLocalModel('/downloads/czech-sample-v2')).rejects.toThrow(
      'cleanup failed but prior model restored',
    );
    expect(fsState.files.get('/data/models/czech-sample/model.mor')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('reports publish and restore failures together', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/downloads/czech-sample-v2', 'czech-sample', '2.0.0', [7, 8, 9]);
    const realRename = fsState.rename.getMockImplementation()!;
    fsState.rename
      .mockImplementationOnce(realRename)
      .mockImplementationOnce(async () => { throw new Error('publish unavailable'); })
      .mockImplementationOnce(async () => { throw new Error('restore unavailable'); });

    await expect(updateLocalModel('/downloads/czech-sample-v2')).rejects.toThrow(
      /publish unavailable.*restore unavailable/,
    );
  });

  it('preserves the import error when temporary cleanup also fails', async () => {
    fsState.addDirectory('/downloads/cleanup-racy');
    fsState.addFile('/downloads/cleanup-racy/model.json', manifest('cleanup-racy'));
    fsState.addFile('/downloads/cleanup-racy/model.mor', new Uint8Array([1, 2, 3]));
    fsState.addFile('/downloads/cleanup-racy/NOTICE.txt', 'Fixture notice');
    const originalReadFile = fsState.readFile.getMockImplementation()!;
    fsState.readFile.mockImplementation(async (path: string) => {
      const content = await originalReadFile(path);
      if (path === '/downloads/cleanup-racy/model.mor') fsState.addFile(path, new Uint8Array([9, 9, 9]));
      return content;
    });
    const realRemove = fsState.remove.getMockImplementation()!;
    fsState.remove.mockImplementation(async (path: string) => {
      if (path.includes('.cleanup-racy.importing-')) throw new Error('temporary cleanup unavailable');
      return realRemove(path);
    });

    await expect(importLocalModel('/downloads/cleanup-racy')).rejects.toThrow(
      /SHA-256 mismatch.*temporary cleanup unavailable/,
    );
  });

  it('rejects duplicate ids and atomically updates only to a newer version', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/downloads/czech-sample-v2', 'czech-sample', '2.0.0', [7, 8, 9]);
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
    const inventory = await getLocalModels('0.9.0');
    expect(inventory.models).toEqual({});
    expect(inventory.rejected[0].reason).toContain('requires server >= 1.0.0');
  });

  it('rejects declared artifact hash mismatches before inventory', async () => {
    fsState.addDirectory('/data/models/corrupt');
    fsState.addFile('/data/models/corrupt/model.json', manifest('corrupt'));
    fsState.addFile('/data/models/corrupt/model.mor', new Uint8Array([9, 9, 9]));
    fsState.addFile('/data/models/corrupt/NOTICE.txt', 'Fixture notice');

    const inventory = await getLocalModels();

    expect(inventory.models).toEqual({});
    expect(inventory.rejected[0].reason).toContain('SHA-256 mismatch');
  });

  it('rejects an empty declared artifact before reading artifact bytes', async () => {
    const modelDirectory = '/data/models/empty';
    fsState.addDirectory(modelDirectory);
    fsState.addFile(`${modelDirectory}/model.json`, manifest('empty').replace('"artifactSizeBytes":3', '"artifactSizeBytes":0'));
    fsState.addFile(`${modelDirectory}/model.mor`, new Uint8Array());
    fsState.addFile(`${modelDirectory}/NOTICE.txt`, 'Fixture notice');

    await expect(validateLocalModelDirectory(modelDirectory)).rejects.toThrow('invalid artifact size');
    expect(fsState.readFile).not.toHaveBeenCalledWith(`${modelDirectory}/model.mor`);
  });

  it('rejects an artifact over the hard limit after stat and before reading bytes', async () => {
    const modelDirectory = '/data/models/oversized';
    fsState.addDirectory(modelDirectory);
    fsState.addFile(`${modelDirectory}/model.json`, manifest('oversized').replace('"artifactSizeBytes":3', '"artifactSizeBytes":536870913'));
    fsState.addFile(`${modelDirectory}/model.mor`, new Uint8Array([1, 2, 3]));
    fsState.addFile(`${modelDirectory}/NOTICE.txt`, 'Fixture notice');

    await expect(validateLocalModelDirectory(modelDirectory)).rejects.toThrow('512 MiB');
    expect(fsState.readFile).not.toHaveBeenCalledWith(`${modelDirectory}/model.mor`);
  });

  it('rejects an oversized manifest from stat before reading its bytes', async () => {
    const modelDirectory = '/data/models/oversized-manifest';
    fsState.addDirectory(modelDirectory);
    fsState.addFile(`${modelDirectory}/model.json`, new Uint8Array(1024 * 1024 + 1));
    fsState.addFile(`${modelDirectory}/model.mor`, new Uint8Array([1, 2, 3]));
    fsState.addFile(`${modelDirectory}/NOTICE.txt`, 'Fixture notice');

    await expect(validateLocalModelDirectory(modelDirectory)).rejects.toThrow('1 MiB');
    expect(fsState.readFile).not.toHaveBeenCalledWith(`${modelDirectory}/model.json`);
  });

  it('republishes the newest valid rollback when the canonical target is absent', async () => {
    addValidModel('/data/models/.czech-sample.rollback-20250101-a', 'czech-sample', '1.0.0');

    const inventory = await getLocalModels();

    expect(inventory.models['czech-sample'].version).toBe('1.0.0');
    expect(fsState.directories.has('/data/models/czech-sample')).toBe(true);
    expect(fsState.directories.has('/data/models/.czech-sample.rollback-20250101-a')).toBe(false);
  });

  it('does not reconcile a rollback whose manifest id differs from its rollback group', async () => {
    addValidModel('/data/models/.czech-sample.rollback-20250101-a', 'different');

    await getLocalModels();

    expect(fsState.directories.has('/data/models/.czech-sample.rollback-20250101-a')).toBe(true);
    expect(fsState.directories.has('/data/models/czech-sample')).toBe(false);
  });

  it('does not replace a canonical target or delete rollback evidence', async () => {
    addValidModel('/data/models/czech-sample', 'czech-sample', '1.0.0');
    addValidModel('/data/models/.czech-sample.rollback-20250102-a', 'czech-sample', '2.0.0', [4, 5, 6]);

    const inventory = await getLocalModels();

    expect(inventory.models['czech-sample'].version).toBe('1.0.0');
    expect(fsState.directories.has('/data/models/.czech-sample.rollback-20250102-a')).toBe(true);
  });

  it('chooses the newest valid rollback deterministically and retains older candidates', async () => {
    addValidModel('/data/models/.czech-sample.rollback-20250101-z', 'czech-sample', '1.0.0');
    addValidModel('/data/models/.czech-sample.rollback-20250102-a', 'czech-sample', '2.0.0', [4, 5, 6]);

    const inventory = await getLocalModels();

    expect(inventory.models['czech-sample'].version).toBe('2.0.0');
    expect(fsState.directories.has('/data/models/.czech-sample.rollback-20250101-z')).toBe(true);
  });

  it('fails closed for invalid and unrelated rollback entries', async () => {
    fsState.addDirectory('/data/models/.czech-sample.rollback-20250103-invalid');
    fsState.addFile('/data/models/.czech-sample.rollback-20250103-invalid/model.json', manifest('czech-sample'));
    fsState.addFile('/data/models/.czech-sample.rollback-20250103-invalid/NOTICE.txt', 'Fixture notice');
    addValidModel('/data/models/.other.rollback-20250104-a', 'different');
    fsState.addDirectory('/data/models/.czech-sample.rollback-bad/name');
    fsState.addSymlink('/data/models/.czech-sample.rollback-20250105-link');

    const inventory = await getLocalModels();

    expect(inventory.models).toEqual({});
    expect(fsState.directories.has('/data/models/.czech-sample.rollback-20250103-invalid')).toBe(true);
    expect(fsState.directories.has('/data/models/.other.rollback-20250104-a')).toBe(true);
  });

  it('rejects duplicate, unknown, and empty capabilities', async () => {
    for (const [id, capabilities] of [['duplicate', ['tag', 'tag']], ['unknown', ['download']], ['empty', []]] as const) {
      fsState.addDirectory(`/data/models/${id}`);
      fsState.addFile(`/data/models/${id}/model.json`, manifest(id).replace('["tag"]', JSON.stringify(capabilities)));
      fsState.addFile(`/data/models/${id}/model.mor`, new Uint8Array([1, 2, 3]));
      fsState.addFile(`/data/models/${id}/NOTICE.txt`, 'Fixture notice');
    }
    const inventory = await getLocalModels();
    expect(inventory.rejected).toHaveLength(3);
    expect(inventory.models).toEqual({});
  });
});
