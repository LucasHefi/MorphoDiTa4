# MorphoDiTa Client

This directory contains the React frontend and Tauri/Rust backend. Start with
the repository [developer guide](../docs/development_guide.md) and the
[online-first ADR](../docs/adr/0001-online-first-explicit-offline.md).

## Commands

Run frontend commands here:

```bash
npm ci
npm run check
npm run test -- --run
npm run build
npm run version:check
```

Run backend commands from `src-tauri/`:

```bash
cargo fmt --check
cargo check --locked
cargo clippy --locked --all-targets --all-features
cargo test --locked
cargo build --locked
```

`npm run build:linux:test` creates the Linux Debian test artifact. It is not
evidence of production distribution or Windows compatibility. Linux x86_64 is
the only locally verified scope; Windows is **OPEN** and macOS is out of scope.

## Runtime contract

Online LINDA is the default. The user can explicitly choose offline mode; an
eligible network/server failure can activate the configured local sidecar
fallback. Offline startup errors are fail-closed and never silently switch to
the online service.

The backend uses Rust `rusqlite` 0.43.0 with bundled SQLite and backup support.
Database initialization enforces schema version 4. Versions 0 through 2 create
or rebuild the canonical schema; version-3 databases transactionally replace
their two ASCII `NOCASE` lookup indexes with Unicode-aware indexed collation.
This is the canonical schema version 4 contract. Backup and restore validate schema,
metadata, row counts, foreign keys, and integrity before replacement.
