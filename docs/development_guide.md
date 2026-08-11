# Development Guide

## Scope

The application is a React/Tauri desktop client in `morphodita4/`. The
frontend uses React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4, Zustand 5,
and Vitest 3. The backend uses Tauri 2.11.2 and Rust 1.88 minimum supported;
the reproducible development and CI toolchain is pinned to Rust 1.97.1.
SQLite access is Rust `rusqlite` 0.31.0 with bundled SQLite and the backup API. These versions
come from `morphodita4/package.json` and `morphodita4/src-tauri/Cargo.toml`;
do not infer versions from old examples in this documentation tree.

## Setup and checks

From `morphodita4/`:

```bash
npm ci
npm run check
npm run test -- --run
npm run build
npm run version:check
```

`npm run test` is the package's Vitest command; `-- --run` makes it suitable
for a non-interactive verification run. Other package scripts include `dev`,
`lint`, `preview`, `tauri`, `verify:offline`, and `build:linux:test`.

From `morphodita4/src-tauri/`:

```bash
cargo fmt --check
cargo check --locked
cargo clippy --locked --all-targets --all-features
cargo test --locked
cargo build --locked
```

The Linux test bundle is built from `morphodita4/` with
`npm run build:linux:test`. This is a test artifact only, not a production,
signing, updater, or distribution claim.

## Current developer paths

Keep changes aligned with the current source tree:

```text
morphodita4/
├── src/
│   ├── components/analyzer/       # analyzer UI
│   ├── components/database/       # database UI
│   ├── components/wizard/         # keyword wizard UI
│   ├── services/                  # API, sidecar, database, workflow
│   ├── store/                     # Zustand stores
│   ├── locales/                   # cs, en, pl translations
│   └── types/                     # frontend contracts
└── src-tauri/
    └── src/                       # commands, Rust database, backup
```

The source and manifests are authoritative. The larger examples and historical
file names in older documents are retained as context, not as a required file
tree or implementation plan.

## Transport and privacy

Online LINDA is the default transport. Offline mode must be explicitly enabled
in settings. If enabled, the client uses the local MorphoDiTa sidecar and does
not silently send input to LINDA. With online mode selected, only eligible
network failures, HTTP 429, and HTTP 5xx may activate the configured offline
fallback; client errors and cancellation do not.

Offline sidecar startup is fail-closed. If local assets or the sidecar are not
usable, the operation fails with recovery actions rather than switching
transport invisibly. The boundary is specified in
[ADR-0001](adr/0001-online-first-explicit-offline.md) and implemented in
`src/services/api.ts` and `src/services/offlineSidecar.ts`.

The explicit offline path is a no-remote-network boundary: user input is sent
only to the local loopback sidecar, never to LINDA.

## SQLite and recovery

The live database is `morphodita.db` under Tauri's `app_data_dir()`, not the
working or install directory. Rust initialization enables foreign keys and
reads `PRAGMA user_version`. Versions 0 and 1 create the canonical schema;
version 2 is rebuilt transactionally into the canonical version-4 tables and
indexes, including the cascading session foreign key. Version 3 is migrated by
replacing its ASCII `NOCASE` word-form indexes with the Unicode canonical
collation. The version-4 marker is written only after validation in the same
transaction, and future versions are rejected. See [database_schema.md](database_schema.md).

Result persistence uses transactions. The Rust backup module uses SQLite's
online backup API, writes version/count metadata, validates integrity and
schema, and restores through a validated temporary file with a rollback copy.
Use the [recovery runbook](database-recovery.md) for the operational contract.

## Evidence and blockers

Only Linux x86_64 has local verified test evidence. Windows remains **OPEN**
until a Windows host/runner, target sidecar, build, install/startup, and
offline smoke test are available. macOS is outside the current scope. See
[release-linux.md](release-linux.md) and [offline-sidecar.md](offline-sidecar.md).

Current known blockers are the missing distributable model/license owner gate
and RustSec's allowed upstream unmaintained/unsound warnings. The lockfile
update leaves reported vulnerabilities at zero, while those allowed warnings
remain an acknowledged maintenance risk.

## Documentation inventory

The active top-level developer paths are:

- [Root README](../README.md) and [application README](../morphodita4/README.md)
- [Feature specification](spec.md) and [API specification](api_spec.md)
- [Database schema](database_schema.md) and [recovery runbook](database-recovery.md)
- [Offline sidecar](offline-sidecar.md) and [Linux test boundary](release-linux.md)
- [UI guide](ui_guide.md)
- [Online-first ADR](adr/0001-online-first-explicit-offline.md)

This task repairs materially wrong entry-point and current developer guidance;
it does not rewrite every historical code example in the documentation set.
