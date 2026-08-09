# Linux test release

This document defines the current release boundary. The only locally supported and
verified platform scope is a Linux x86_64 test `.deb`. That evidence does not
create a public, production, or cross-platform support promise.

## Supported platform matrix

| Platform | Minimum OS | Architecture | Required native evidence | Current commitment |
|---|---|---|---|---|
| Linux | **OPEN / unverified**: no minimum distribution or kernel baseline is established as release evidence | x86_64 (`amd64`) | Linux runner, the packaged `morphodita-server` sidecar, and the test `.deb` procedure below | **Locally supported/verified test scope only**; no public or production support commitment |
| Windows | **OPEN / unverified**: no minimum Windows version is established as release evidence | x86_64 candidate | Windows runner and Windows sidecar `x86_64-pc-windows-msvc.exe`; direct Windows build, install/startup, and offline-sidecar smoke test | **OPEN** until the target artifacts and host are directly tested; no support commitment yet |
| macOS | Not defined because macOS is outside the current release scope | No current release architecture is decided | No current macOS artifact or host test | **Out of scope**; no support commitment |

The current posture is therefore **Linux x86_64 test scope**, not a
Windows/macOS/Linux supported-release matrix. Windows remains a future candidate;
a Linux build must not be reported as a Windows release.

The repository contains older planning prose that names additional platforms or
minimum versions. Those statements are not release evidence; the matrix above is
the current release decision for this document.

## Packaging controls and open boundaries

- **Signing:** **OPEN / unverified**. No signing configuration or signed artifact
  evidence is recorded for the current test package. A `sha256sum` is an
  integrity record, not a code-signing signature.
- **Notarization:** **OPEN / unverified**. macOS notarization is not part of the
  current release scope, and no notarization evidence exists.
- **Update channel:** **OPEN / unverified**. The repository documents a manually
  built test `.deb`, but no application updater, update feed, or publication
  channel is configured or verified here. The online LINDA API transport is not an
  application update channel.
- **Support commitment:** limited to local verification of the Linux x86_64 test
  artifact. Windows has no support commitment until direct testing passes; macOS
  has no support commitment while out of scope.

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

The canonical script runs the frontend production build and creates only the
Debian bundle (`tauri build --bundles deb`).

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

A package-only pass does not prove installation, GUI startup, database
initialization, or Windows compatibility. For the Linux sidecar smoke test,
extract the package to a temporary directory, start only the packaged
`morphodita-server`, and verify `/models` and `/tag` before stopping the process.

## Documentation verification

After changing the owned documentation paths, run this concise repository-level
check from the repository root:

```bash
git -c core.whitespace=cr-at-eol diff --check -- docs/release-linux.md README.md morphodita4/README.md
```

This checks documentation diff whitespace only; it does not prove runtime,
installer, signing, notarization, updater, or target-host behavior.
