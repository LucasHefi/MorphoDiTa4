# MorphoDiTa Client v4

MorphoDiTa Client is a React/Tauri desktop application for morphological
analysis, tagging, generation, tokenization, and local result storage. The application
directory is [`morphodita4/`](morphodita4/).

## Downloads and CI/CD

Current release: **[0.1.21](https://github.com/LucasHefi/MorphoDiTa4/releases/tag/v0.1.21)**, published on 18 November 2026.

[Latest release](https://github.com/LucasHefi/MorphoDiTa4/releases/latest) · [Quality gates](https://github.com/LucasHefi/MorphoDiTa4/actions/workflows/quality.yml) · [Release builds](https://github.com/LucasHefi/MorphoDiTa4/actions/workflows/release.yml)

Linux amd64 DEB and Windows x64 EXE/ZIP are distributed through GitHub Releases, with SHA-256 manifests. Installers are unsigned; language models are downloaded separately after license consent. Native builds and automated tests do not replace manual GUI/installer acceptance.

Version tags trigger checks, native Linux/Windows builds and publication of complete releases. See [the release workflow and audit policy](docs/releasing.md).

## Development

Use Node/npm in `morphodita4/`:

```bash
npm ci
npm run check
npm run test -- --run
npm run build
npm run version:check
```

Use Rust in `morphodita4/src-tauri/`:

```bash
cargo fmt --check
cargo check --locked
cargo clippy --locked --all-targets --all-features
cargo test --locked
cargo build --locked
```

The manifests are authoritative for versions: React 19, TypeScript 5.7,
Vite 8, Tauri 2.11.2, Rust 1.88 minimum supported, and `rusqlite` 0.43.0.
The reproducible development and CI toolchain is pinned to Rust 1.97.1. The
npm package manager is npm 10.9.8.

## Runtime boundaries

- Online LINDA is the default transport. Offline mode is an explicit user
  decision; an eligible network/HTTP server failure may use the configured
  local fallback. See [ADR-0001](docs/adr/0001-online-first-explicit-offline.md).
- Offline startup is fail-closed: it does not silently switch back to LINDA.
- SQLite is local Rust `rusqlite`, not SQLx. The canonical schema uses
  `PRAGMA user_version = 4`; versions 0 through 2 are rebuilt transactionally
  into the version-4 tables and indexes, and version 3 replaces its two ASCII
  `NOCASE` lookup indexes with Unicode-aware indexed collation. This is the
  canonical schema version 4 contract. Backup and
  restore validate the full
  schema contract before replacement. See [database recovery](docs/database-recovery.md).
- Linux x86_64 has local build and installation verification. For release
  0.1.21, native Linux and Windows builds and automated tests passed in
  [GitHub Actions](https://github.com/LucasHefi/MorphoDiTa4/actions/runs/44223132634).
  Manual Windows installation, uninstallation and GUI acceptance remain open;
  macOS is outside the current scope.
- This repository makes no production, signing, notarization, updater, or
  public support claim.

## Documentation

- [Developer guide](docs/development_guide.md): setup, checks, architecture,
  transport and database boundaries.
- [API specification](docs/api_spec.md)
- [Database schema](docs/database_schema.md)
- [Offline sidecar](docs/offline-sidecar.md)
- [Database recovery](docs/database-recovery.md)
- [Linux test-release boundary](docs/release-linux.md)
- [Windows release and verification boundary](docs/release-windows.md)
- [CI/CD, publishing and audit policy](docs/releasing.md)
- [Feature specification](docs/spec.md) and [UI guide](docs/ui_guide.md)

## Licenses

The client is MIT licensed (owner decision, 2026-11-16). The bundled upstream
server remains MPL-2.0; see NOTICE and licenses/MPL-2.0.txt. Models are not
bundled. Settings requires explicit acceptance of the model terms before download;
About shows model provenance and license links. MIT does not grant commercial
use of the CC BY-NC-SA model.
