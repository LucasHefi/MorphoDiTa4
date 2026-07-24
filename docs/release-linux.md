# Linux test release

MorphoDiTa Client is developed on Linux and is intended to run primarily on Windows. The Linux package is a test artifact, not evidence of Windows release readiness.

## Transport policy

- The online LINDA MorphoDiTa API is the default transport.
- Local MorphoDiTa is used only when the user explicitly enables local mode in Settings, or when `offlineFallbackEnabled` is enabled and the online request fails because of a network error, HTTP 429, or HTTP 5xx.
- HTTP 4xx responses and cancelled requests do not trigger an automatic fallback.
- The UI displays whether local mode is explicit or was activated as an online fallback.

## Build the Linux test package

Run from the application directory:

```bash
npm ci
npm run build:linux:test
```

The script runs the frontend production build and then creates only the Debian bundle:

```bash
npm run build
npm exec -- tauri build --bundles deb
```

Expected artifact:

```text
src-tauri/target/release/bundle/deb/MorphoDiTa Client_<version>_amd64.deb
```

The package must contain:

- the Tauri application executable;
- `usr/bin/morphodita-server` as the Linux sidecar;
- the bundled Czech model under the application `models/` directory;
- `model.json`, `README.txt`, and `LICENSE.txt` for model provenance.

## Package verification

Record the following for every candidate:

```bash
dpkg-deb -f "src-tauri/target/release/bundle/deb/MorphoDiTa Client_<version>_amd64.deb" Package Version Architecture
dpkg-deb -c "src-tauri/target/release/bundle/deb/MorphoDiTa Client_<version>_amd64.deb"
sha256sum "src-tauri/target/release/bundle/deb/MorphoDiTa Client_<version>_amd64.deb"
```

A package-only pass does not prove installation, GUI startup, database initialization, or Windows compatibility. For the Linux sidecar smoke test, extract the package to a temporary directory, start only the packaged `morphodita-server`, and verify `/models` and `/tag` before stopping the process.

## Platform boundaries

The Tauri source is shared, but native artifacts are target-specific:

| Target | Build environment | Required sidecar suffix | Evidence state |
|---|---|---|---|
| Linux x86_64 | Linux runner | `x86_64-unknown-linux-gnu` | Linux `.deb` test artifact |
| Windows x86_64 | Windows runner | `x86_64-pc-windows-msvc.exe` | OPEN until built and smoke-tested |
| macOS | matching macOS runner | matching Rust target suffix | Not part of the current release scope |

A Linux build must not be reported as a Windows release. Windows packaging requires the Windows sidecar and a Windows runner or an equivalent verified Windows toolchain.
