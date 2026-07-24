# SQLite backup and recovery runbook

This runbook covers the MorphoDiTa Client Tauri database identified as `cz.ufal.morphodita`.

## Database location

The application resolves the live database through Tauri `app_data_dir()` and stores the file as `morphodita.db`.

Typical locations are:

- Linux: `${XDG_DATA_HOME:-$HOME/.local/share}/cz.ufal.morphodita/morphodita.db`
- Windows: `%LOCALAPPDATA%\cz.ufal.morphodita\morphodita.db`
- macOS: `$HOME/Library/Application Support/cz.ufal.morphodita/morphodita.db`

The platform-specific location is authoritative. Do not derive a path from the current working directory, the installation directory, or the bundled `models` resource directory.

## Backup contract

The Rust backend exposes these typed Tauri commands through `DatabaseService`:

- `backup_database(outputPath)` creates a new SQLite backup at `outputPath`.
- `validate_backup(backupPath)` runs compatibility, schema, foreign-key, row-count, and `PRAGMA integrity_check` validation.
- `restore_database(backupPath)` validates the backup, restores through a temporary file, and atomically replaces the live database after the temporary copy passes validation.

A backup contains a `morphodita_backup_metadata` table with:

- backup format version;
- SQLite schema version;
- application version;
- creation timestamp;
- `sessions` row count;
- `morphological_data` row count.

The current accepted schema version is `2`. A backup with another schema version is rejected rather than migrated implicitly during restore.

## Safe backup procedure

1. Finish or pause writes to the application.
2. Choose a new backup path. The target must not already exist; this preserves atomic rename semantics on Linux and Windows.
3. Call `backup_database(outputPath)`.
4. Call `validate_backup(backupPath)` and record the returned metadata.
5. Preserve the backup file together with its metadata result and the application version.

The backup operation uses SQLite's online backup API, writes metadata into the copied database, runs integrity validation, syncs the file, and only then renames the temporary file to the requested path. A failed operation removes its temporary file and does not publish a partial backup.

## Safe restore procedure

Restore is destructive and requires an explicit user confirmation in the caller.

1. Stop application writes and make a fresh backup of the current live database.
2. Validate the selected backup with `validate_backup(backupPath)`.
3. Call `restore_database(backupPath)`.
4. The backend closes the active connection, creates and validates a temporary restored database, and atomically replaces the live `morphodita.db`.
5. If a live database existed, the previous file is retained as a generated `.pre-restore-*.sqlite` sibling. Do not delete it until the restored application has been reopened and checked.
6. Reopen the application and verify expected sessions, morphological rows, schema version, and normal read/write behavior.
7. Retain the rollback copy according to the operational retention policy; delete it only after acceptance is complete.

If validation fails, the live database is not touched. A corrupt or non-SQLite file must therefore be rejected before any replacement or rollback rename occurs.

## Verification evidence

The Rust test suite covers:

- populated database backup and metadata readback;
- restore round-trip with row-count preservation;
- rollback-copy creation during replacement;
- corrupt-backup rejection;
- proof that the target database remains unchanged after corrupt input.

These tests prove the local SQLite contract. They do not prove installer upgrade behavior, target-host permissions, GUI confirmation flow, or Windows runtime execution; those remain separate acceptance gates.
