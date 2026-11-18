"""Package native Tauri output; verify downloaded assets before publication."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

APP = Path(__file__).resolve().parents[1]
VERSION = json.loads((APP / 'package.json').read_text())['version']


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(folder):
    required = [f'MorphoDiTa-Client-{VERSION}-Linux-amd64.deb',
                f'MorphoDiTa-Client-{VERSION}-Windows-x64-setup.exe',
                f'MorphoDiTa-Client-{VERSION}-Windows-x64.zip']
    for name in required:
        if not (folder / name).is_file():
            raise RuntimeError(f'Missing release artifact: {name}')
    for platform in ['linux', 'windows']:
        manifest = json.loads((folder / f'manifest-{platform}.json').read_text())
        if manifest['version'] != VERSION:
            raise RuntimeError('Artifact version differs from source tag')
        for name, info in manifest['files'].items():
            path = folder / name
            if path.stat().st_size != info['bytes'] or digest(path) != info['sha256']:
                raise RuntimeError(f'Artifact integrity mismatch: {name}')
    archive = folder / required[-1]
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise RuntimeError('Corrupt Windows ZIP')
    files = sorted(p for p in folder.iterdir() if p.is_file() and not p.name.startswith('SHA256SUMS'))
    (folder / 'SHA256SUMS.txt').write_text(''.join(f'{digest(p)}  {p.name}\n' for p in files))
    print(f'PASS: {VERSION}, both installers, manifests, ZIP and SHA-256')


def package(platform, target):
    release = APP / 'src-tauri/target'
    if target:
        release /= target
    release /= 'release/bundle'
    suffix = '.deb' if platform == 'linux' else '.exe'
    subdir = 'deb' if platform == 'linux' else 'nsis'
    matches = [p for p in (release / subdir).glob('*' + suffix) if f'_{VERSION}_' in p.name]
    if len(matches) != 1:
        raise RuntimeError(f'Expected one {VERSION} installer, found {matches}')
    output = APP / 'release-dist' / platform
    output.mkdir(parents=True, exist_ok=True)
    name = f'MorphoDiTa-Client-{VERSION}-' + ('Linux-amd64.deb' if platform == 'linux' else 'Windows-x64-setup.exe')
    installer = output / name
    shutil.copy2(matches[0], installer)
    if platform == 'linux':
        assert installer.read_bytes().startswith(b'!<arch>\n')
    else:
        assert installer.read_bytes().startswith(b'MZ')
    instructions = output / f'CTI-ME-{platform}.txt'
    text = f'MorphoDiTa Client {VERSION}\n\n'
    if platform == 'linux':
        text += f'Linux amd64: otevřete DEB ve správci balíčků nebo použijte sudo dpkg -i {name}.\n'
    else:
        text += f'Windows x64: spusťte {name}, vyberte jazyk a dokončete instalaci pro aktuálního uživatele.\nWebView2 bootstrapper může při chybějícím runtime potřebovat internet.\n'
    text += ('Po aktualizaci aplikaci znovu spusťte.\nModely nejsou součástí balíčku; čtěte licenci a stahujte je v Nastavení.\n'
             'Instalátory nejsou digitálně podepsané. Sestavení a automatické testy nenahrazují ruční akceptaci GUI.\n'
             'Zdroj a licence upraveného MPL serveru jsou součástí instalačního balíčku.\n')
    instructions.write_text(text, encoding='utf-8-sig')
    files = [installer, instructions]
    if platform == 'windows':
        archive = output / f'MorphoDiTa-Client-{VERSION}-Windows-x64.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
            for file in files:
                z.write(file, file.name)
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
        files.append(archive)
    manifest = {'application': 'MorphoDiTa Client', 'version': VERSION, 'platform': platform,
                'target': target or ('x86_64-pc-windows-msvc' if platform == 'windows' else 'x86_64-unknown-linux-gnu'),
                'signed': False, 'files': {p.name: {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in files}}
    metadata = output / f'manifest-{platform}.json'
    metadata.write_text(json.dumps(manifest, indent=2) + '\n')
    files.append(metadata)
    (output / f'SHA256SUMS-{platform}.txt').write_text(''.join(f'{digest(p)}  {p.name}\n' for p in files))
    print(f'Packaged {platform} {VERSION} in {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=['linux', 'windows'])
    parser.add_argument('--target')
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify:
        verify(args.verify)
    elif args.platform:
        package(args.platform, args.target)
    else:
        parser.error('Use --platform or --verify')
