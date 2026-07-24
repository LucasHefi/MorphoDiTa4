use crate::db::SCHEMA_VERSION;
use chrono::Utc;
use rusqlite::{backup::Backup, params, Connection, DatabaseName, OpenFlags};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const BACKUP_FORMAT_VERSION: i32 = 1;
const METADATA_TABLE: &str = "morphodita_backup_metadata";

#[derive(Debug)]
pub enum BackupError {
    Invalid(String),
    Io(std::io::Error),
    Json(serde_json::Error),
    Sqlite(rusqlite::Error),
}

impl Display for BackupError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(message) => write!(formatter, "{message}"),
            Self::Io(error) => write!(formatter, "filesystem error: {error}"),
            Self::Json(error) => write!(formatter, "metadata error: {error}"),
            Self::Sqlite(error) => write!(formatter, "SQLite error: {error}"),
        }
    }
}

impl Error for BackupError {}

impl From<std::io::Error> for BackupError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for BackupError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<rusqlite::Error> for BackupError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

pub type BackupResult<T> = std::result::Result<T, BackupError>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BackupMetadata {
    pub format_version: i32,
    pub schema_version: i32,
    pub application_version: String,
    pub created_at: String,
    pub sessions_count: i64,
    pub morphological_data_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub metadata: BackupMetadata,
    pub rollback_path: Option<String>,
}

struct TemporaryPath {
    path: PathBuf,
    committed: bool,
}

impl TemporaryPath {
    fn create(target: &Path, label: &str) -> BackupResult<Self> {
        let parent = target.parent().unwrap_or_else(|| Path::new("."));
        fs::create_dir_all(parent)?;
        let file_name = target
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                BackupError::Invalid("target path has no valid file name".to_string())
            })?;
        for attempt in 0..100 {
            let path = parent.join(format!(
                ".{file_name}.{label}-{}-{attempt}.tmp",
                unique_suffix()
            ));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => {
                    drop(file);
                    return Ok(Self {
                        path,
                        committed: false,
                    });
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error.into()),
            }
        }
        Err(BackupError::Invalid(
            "could not allocate a unique temporary backup path".to_string(),
        ))
    }

    fn commit_to(mut self, target: &Path) -> BackupResult<()> {
        fs::rename(&self.path, target)?;
        self.committed = true;
        Ok(())
    }
}

impl Drop for TemporaryPath {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn unique_unused_path(target: &Path, label: &str) -> BackupResult<PathBuf> {
    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| BackupError::Invalid("target path has no valid file name".to_string()))?;
    for attempt in 0..100 {
        let path = parent.join(format!(
            ".{file_name}.{label}-{}-{attempt}.sqlite",
            unique_suffix()
        ));
        if !path.exists() {
            return Ok(path);
        }
    }
    Err(BackupError::Invalid(
        "could not allocate a unique rollback path".to_string(),
    ))
}

fn ensure_distinct_paths(target: &Path, source: &Path) -> BackupResult<()> {
    if target == source {
        return Err(BackupError::Invalid(
            "database and backup paths must be different".to_string(),
        ));
    }
    if target.exists() && source.exists() && fs::canonicalize(target)? == fs::canonicalize(source)?
    {
        return Err(BackupError::Invalid(
            "database and backup paths must resolve to different files".to_string(),
        ));
    }
    Ok(())
}

fn table_exists(conn: &Connection, table: &str) -> BackupResult<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get(0),
    )?)
}

fn count_rows(conn: &Connection, table: &str) -> BackupResult<i64> {
    let query = format!("SELECT COUNT(*) FROM {table}");
    Ok(conn.query_row(&query, [], |row| row.get(0))?)
}

fn metadata_from_connection(conn: &Connection) -> BackupResult<BackupMetadata> {
    let schema_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if schema_version != SCHEMA_VERSION {
        return Err(BackupError::Invalid(format!(
            "unsupported database schema version {schema_version}; expected {SCHEMA_VERSION}"
        )));
    }
    let foreign_keys: i32 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if foreign_keys != 1 {
        return Err(BackupError::Invalid(
            "database foreign-key enforcement is not enabled".to_string(),
        ));
    }
    Ok(BackupMetadata {
        format_version: BACKUP_FORMAT_VERSION,
        schema_version,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: Utc::now().to_rfc3339(),
        sessions_count: count_rows(conn, "sessions")?,
        morphological_data_count: count_rows(conn, "morphological_data")?,
    })
}

fn write_metadata(conn: &Connection, metadata: &BackupMetadata) -> BackupResult<()> {
    let json = serde_json::to_string(metadata)?;
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS {METADATA_TABLE} (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            metadata_json TEXT NOT NULL
        );
        DELETE FROM {METADATA_TABLE};"
    ))?;
    conn.execute(
        &format!("INSERT INTO {METADATA_TABLE} (id, metadata_json) VALUES (1, ?1)"),
        params![json],
    )?;
    Ok(())
}

fn read_metadata(conn: &Connection) -> BackupResult<BackupMetadata> {
    if !table_exists(conn, METADATA_TABLE)? {
        return Err(BackupError::Invalid(
            "backup metadata table is missing".to_string(),
        ));
    }
    let json: String = conn.query_row(
        &format!("SELECT metadata_json FROM {METADATA_TABLE} WHERE id = 1"),
        [],
        |row| row.get(0),
    )?;
    let metadata: BackupMetadata = serde_json::from_str(&json)?;
    if metadata.format_version != BACKUP_FORMAT_VERSION {
        return Err(BackupError::Invalid(format!(
            "unsupported backup format version {}",
            metadata.format_version
        )));
    }
    if metadata.schema_version != SCHEMA_VERSION {
        return Err(BackupError::Invalid(format!(
            "backup schema version {} is incompatible with {}",
            metadata.schema_version, SCHEMA_VERSION
        )));
    }
    Ok(metadata)
}

fn validate_connection(conn: &Connection) -> BackupResult<BackupMetadata> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(BackupError::Invalid(format!(
            "SQLite integrity check failed: {integrity}"
        )));
    }
    let metadata = read_metadata(conn)?;
    let schema_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if schema_version != metadata.schema_version {
        return Err(BackupError::Invalid(
            "backup metadata and SQLite schema versions disagree".to_string(),
        ));
    }
    if !table_exists(conn, "sessions")? || !table_exists(conn, "morphological_data")? {
        return Err(BackupError::Invalid(
            "backup is missing required MorphoDiTa tables".to_string(),
        ));
    }
    let foreign_key_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_foreign_key_list('morphological_data')",
        [],
        |row| row.get(0),
    )?;
    if foreign_key_count < 1 {
        return Err(BackupError::Invalid(
            "backup is missing the morphological_data session foreign key".to_string(),
        ));
    }
    let sessions_count = count_rows(conn, "sessions")?;
    let morphological_data_count = count_rows(conn, "morphological_data")?;
    if sessions_count != metadata.sessions_count
        || morphological_data_count != metadata.morphological_data_count
    {
        return Err(BackupError::Invalid(
            "backup metadata row counts do not match the database".to_string(),
        ));
    }
    Ok(metadata)
}

pub fn backup_database(source: &Connection, target_path: &Path) -> BackupResult<BackupMetadata> {
    if target_path.exists() {
        return Err(BackupError::Invalid(
            "backup target already exists; choose a new path to preserve atomicity".to_string(),
        ));
    }
    let temporary = TemporaryPath::create(target_path, "backup")?;
    source.backup(DatabaseName::Main, &temporary.path, None)?;
    let backup_connection = Connection::open(&temporary.path)?;
    backup_connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    let metadata = metadata_from_connection(&backup_connection)?;
    write_metadata(&backup_connection, &metadata)?;
    validate_connection(&backup_connection)?;
    drop(backup_connection);
    sync_file(&temporary.path)?;
    temporary.commit_to(target_path)?;
    Ok(metadata)
}

pub fn validate_backup(backup_path: &Path) -> BackupResult<BackupMetadata> {
    let backup_connection =
        Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    validate_connection(&backup_connection)
}

pub fn restore_database(target_path: &Path, backup_path: &Path) -> BackupResult<RestoreResult> {
    ensure_distinct_paths(target_path, backup_path)?;
    let metadata = validate_backup(backup_path)?;
    let temporary = TemporaryPath::create(target_path, "restore")?;
    let source = Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut restored = Connection::open(&temporary.path)?;
    {
        let backup = Backup::new(&source, &mut restored)?;
        backup.run_to_completion(128, Duration::from_millis(0), None)?;
    }
    let restored_metadata = validate_connection(&restored)?;
    if restored_metadata != metadata {
        return Err(BackupError::Invalid(
            "restored database metadata differs from the validated backup".to_string(),
        ));
    }
    drop(restored);
    drop(source);
    sync_file(&temporary.path)?;

    let rollback_path = if target_path.exists() {
        let rollback_path = unique_unused_path(target_path, "pre-restore")?;
        fs::rename(target_path, &rollback_path)?;
        Some(rollback_path)
    } else {
        None
    };
    if let Err(error) = fs::rename(&temporary.path, target_path) {
        if let Some(rollback_path) = &rollback_path {
            let _ = fs::rename(rollback_path, target_path);
        }
        return Err(error.into());
    }
    let mut temporary = temporary;
    temporary.committed = true;
    Ok(RestoreResult {
        metadata,
        rollback_path: rollback_path.map(|path| path.to_string_lossy().into_owned()),
    })
}

pub fn sync_file(path: &Path) -> BackupResult<()> {
    File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::fs;

    fn test_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "morphodita-backup-{label}-{}-{}",
            std::process::id(),
            unique_suffix()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    fn populated_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::configure_db_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO sessions (operation, model, input_text, parameters, result_count, status)
             VALUES ('analyze', 'm1', 'alpha', '{}', 1, 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data (source_type, original_form, lemma, tag, session_id)
             VALUES ('analysis', 'alpha', 'alpha', 'N', 1)",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn round_trips_database_with_metadata_and_rollback_copy() {
        let root = test_root("roundtrip");
        let backup_path = root.join("backup.sqlite");
        let target_path = root.join("morphodita.db");
        let source = populated_connection();

        let metadata = backup_database(&source, &backup_path).unwrap();
        assert_eq!(metadata.sessions_count, 1);
        assert_eq!(metadata.morphological_data_count, 1);
        assert_eq!(validate_backup(&backup_path).unwrap(), metadata);

        let target = Connection::open(&target_path).unwrap();
        db::configure_db_connection(&target).unwrap();
        target
            .execute(
                "INSERT INTO sessions (operation, model, input_text, parameters, status)
                 VALUES ('tag', 'old', 'old', '{}', 'pending')",
                [],
            )
            .unwrap();
        drop(target);

        let restored = restore_database(&target_path, &backup_path).unwrap();
        let rollback_path = restored.rollback_path.as_ref().unwrap();
        assert!(Path::new(rollback_path).exists());
        let restored_connection = Connection::open(&target_path).unwrap();
        assert_eq!(
            restored_connection
                .query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            restored_connection
                .query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(restored_connection);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_corrupted_backup_before_touching_target() {
        let root = test_root("corrupt");
        let backup_path = root.join("corrupt.sqlite");
        let target_path = root.join("morphodita.db");
        fs::write(&backup_path, b"not a SQLite database").unwrap();
        let target = populated_connection();
        let target_file = root.join("target-source.sqlite");
        target
            .backup(DatabaseName::Main, &target_file, None)
            .unwrap();
        drop(target);
        fs::rename(target_file, &target_path).unwrap();

        let error = restore_database(&target_path, &backup_path).unwrap_err();
        assert!(error.to_string().contains("SQLite"));
        let untouched = Connection::open(&target_path).unwrap();
        assert_eq!(
            untouched
                .query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(untouched);
        fs::remove_dir_all(root).unwrap();
    }
}
