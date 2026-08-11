# MorphoDiTa Client v4

MorphoDiTa Client is a React/Tauri desktop application for morphological
analysis, generation, tokenization, and local result storage. The application
directory is [`morphodita4/`](morphodita4/).

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
Vite 6, Tauri 2.11.2, Rust 1.88 minimum supported, and `rusqlite` 0.31.0.
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
- Linux x86_64 is the locally verified test scope. Windows remains **OPEN**
  until direct Windows evidence exists; macOS is outside the current scope.
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
- [Feature specification](docs/spec.md) and [UI guide](docs/ui_guide.md)

Known blockers are the missing distributable model/license owner gate and
RustSec's allowed upstream unmaintained/unsound warnings. After the lockfile
update, the vulnerability count is zero; those warnings are not represented
as zero risk.
