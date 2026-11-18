use crate::db::{register_unicode_collation, validate_schema_contract, SCHEMA_VERSION};
use chrono::Utc;
use rusqlite::{backup::Backup, params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(test)]
pub(crate) mod test_seams {
    use std::cell::RefCell;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    pub static CLEANUP_ATTEMPTS: AtomicUsize = AtomicUsize::new(0);
    pub static CLEANUP_FAILURES: AtomicUsize = AtomicUsize::new(0);
    pub static TEST_LOCK: Mutex<()> = Mutex::new(());
    thread_local! {
        static SYNC_EVENTS: RefCell<Vec<PathBuf>> = const { RefCell::new(Vec::new()) };
        static SYNC_FAILURE_PHASE: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    pub fn record_sync(path: &std::path::Path) {
        SYNC_EVENTS.with_borrow_mut(|events| events.push(path.to_path_buf()));
    }

    pub fn sync_events() -> Vec<PathBuf> {
        SYNC_EVENTS.with_borrow(|events| events.clone())
    }

    pub fn set_sync_failure_phase(phase: Option<String>) {
        SYNC_FAILURE_PHASE.with_borrow_mut(|failure| *failure = phase);
    }

    pub fn take_sync_failure(phase: &str) -> bool {
        SYNC_FAILURE_PHASE.with_borrow_mut(|failure| {
            if failure.as_deref() == Some(phase) {
                *failure = None;
                true
            } else {
                false
            }
        })
    }

    pub fn reset() {
        CLEANUP_ATTEMPTS.store(0, Ordering::SeqCst);
        CLEANUP_FAILURES.store(0, Ordering::SeqCst);
        SYNC_EVENTS.with_borrow_mut(Vec::clear);
        set_sync_failure_phase(None);
    }
}

const BACKUP_FORMAT_VERSION: i32 = 1;
const METADATA_TABLE: &str = "morphodita_backup_metadata";
const MAX_METADATA_JSON_BYTES: usize = 16 * 1024;

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
        // hard_link creates the final name atomically and fails if another
        // publisher already owns it, unlike rename on Windows and Unix.
        fs::hard_link(&self.path, target)?;
        sync_parent_dirs("backup publication", [self.path.as_path(), target])?;
        if remove_temporary_file(&self.path).is_ok() {
            self.committed = true;
        }
        Ok(())
    }
}

impl Drop for TemporaryPath {
    fn drop(&mut self) {
        if !self.committed {
            let _ = remove_temporary_file(&self.path);
        }
    }
}

fn remove_temporary_file(path: &Path) -> std::io::Result<()> {
    #[cfg(test)]
    {
        use std::sync::atomic::Ordering;
        test_seams::CLEANUP_ATTEMPTS.fetch_add(1, Ordering::SeqCst);
        let remaining = test_seams::CLEANUP_FAILURES.load(Ordering::SeqCst);
        if remaining > 0 {
            test_seams::CLEANUP_FAILURES.fetch_sub(1, Ordering::SeqCst);
            return Err(std::io::Error::other("injected temporary cleanup failure"));
        }
    }
    fs::remove_file(path)
}

fn unique_suffix() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn sync_parent_dirs<'a, I>(phase: &str, paths: I) -> BackupResult<()>
where
    I: IntoIterator<Item = &'a Path>,
{
    let mut parents = Vec::new();
    for path in paths {
        let parent = path.parent().unwrap_or_else(|| Path::new("."));
        if !parents.iter().any(|known| known == parent) {
            parents.push(parent.to_path_buf());
        }
    }
    for parent in parents {
        if let Err(error) = sync_directory(&parent, phase) {
            return Err(BackupError::Invalid(format!(
                "durability sync failed during {phase} at {}: {error}",
                parent.display()
            )));
        }
    }
    Ok(())
}

fn sync_directory(path: &Path, phase: &str) -> std::io::Result<()> {
    #[cfg(test)]
    {
        test_seams::record_sync(path);
        if test_seams::take_sync_failure(phase) {
            return Err(std::io::Error::other("injected directory sync failure"));
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x02000000;
        let _ = phase;
        return OpenOptions::new()
            .read(true)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
            .open(path)?
            .sync_all();
    }
    #[cfg(not(windows))]
    {
        #[cfg(not(test))]
        let _ = phase;
        File::open(path)?.sync_all()
    }
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

fn validate_contract_for_backup(conn: &Connection) -> BackupResult<()> {
    validate_schema_contract(conn).map_err(|error| {
        let legacy_context = if error.contains("foreign key") || error.contains("user_version 2") {
            "; backup is missing the morphological_data session foreign key"
        } else {
            ""
        };
        BackupError::Invalid(format!(
            "SQLite schema contract validation failed: {error}{legacy_context}"
        ))
    })
}

fn write_metadata(conn: &Connection, metadata: &BackupMetadata) -> BackupResult<()> {
    let json = serde_json::to_string(metadata)?;
    if json.len() > MAX_METADATA_JSON_BYTES {
        return Err(BackupError::Invalid(
            "backup metadata exceeds the maximum JSON size".to_string(),
        ));
    }
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
    let byte_length: Option<i64> = conn.query_row(
        &format!("SELECT length(CAST(metadata_json AS BLOB)) FROM {METADATA_TABLE} WHERE id = 1"),
        [],
        |row| row.get(0),
    )?;
    let byte_length = byte_length
        .ok_or_else(|| BackupError::Invalid("backup metadata row is missing".to_string()))?;
    if byte_length > MAX_METADATA_JSON_BYTES as i64 {
        return Err(BackupError::Invalid(
            "backup metadata exceeds the maximum JSON size".to_string(),
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
    register_unicode_collation(conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    validate_contract_for_backup(conn)?;
    let metadata = read_metadata(conn)?;
    let schema_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if schema_version != metadata.schema_version {
        return Err(BackupError::Invalid(
            "backup metadata and SQLite schema versions disagree".to_string(),
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
    source.backup(
        rusqlite::MAIN_DB,
        &temporary.path,
        None::<fn(rusqlite::backup::Progress)>,
    )?;
    let backup_connection = Connection::open(&temporary.path)?;
    register_unicode_collation(&backup_connection)?;
    backup_connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    let metadata = metadata_from_connection(&backup_connection)?;
    write_metadata(&backup_connection, &metadata)?;
    validate_connection(&backup_connection)?;
    drop(backup_connection);
    sync_file_for_phase(&temporary.path, "backup file")?;
    temporary.commit_to(target_path)?;
    Ok(metadata)
}

pub fn validate_backup(backup_path: &Path) -> BackupResult<BackupMetadata> {
    let backup_connection =
        Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    register_unicode_collation(&backup_connection)?;
    validate_connection(&backup_connection)
}

pub fn restore_database(target_path: &Path, backup_path: &Path) -> BackupResult<RestoreResult> {
    ensure_distinct_paths(target_path, backup_path)?;
    let metadata = validate_backup(backup_path)?;
    let temporary = TemporaryPath::create(target_path, "restore")?;
    let source = Connection::open_with_flags(backup_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    register_unicode_collation(&source)?;
    let mut restored = Connection::open(&temporary.path)?;
    register_unicode_collation(&restored)?;
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
    sync_file_for_phase(&temporary.path, "restore file")?;

    let rollback_path = if target_path.exists() {
        let rollback_path = unique_unused_path(target_path, "pre-restore")?;
        sync_file_for_phase(target_path, "restore rollback source")?;
        fs::rename(target_path, &rollback_path)?;
        sync_parent_dirs("restore rollback", [target_path, rollback_path.as_path()])?;
        Some(rollback_path)
    } else {
        None
    };
    if let Err(error) = fs::rename(&temporary.path, target_path) {
        if let Some(rollback_path) = &rollback_path {
            if fs::rename(rollback_path, target_path).is_ok() {
                let _ = sync_parent_dirs(
                    "restore rollback recovery",
                    [rollback_path.as_path(), target_path],
                );
            }
        }
        return Err(error.into());
    }
    sync_parent_dirs(
        "restore publication",
        [temporary.path.as_path(), target_path],
    )?;
    let mut temporary = temporary;
    temporary.committed = true;
    Ok(RestoreResult {
        metadata,
        rollback_path: rollback_path.map(|path| path.to_string_lossy().into_owned()),
    })
}

/// Republishes the pre-restore database after the replacement failed validation or reopen.
/// The rollback copy is retained if either rename fails.
pub fn recover_database(target_path: &Path, rollback_path: &Path) -> BackupResult<()> {
    if !rollback_path.exists() {
        return Err(BackupError::Invalid(format!(
            "rollback database does not exist: {}",
            rollback_path.display()
        )));
    }
    let rollback = Connection::open_with_flags(rollback_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    register_unicode_collation(&rollback)?;
    validate_contract_for_backup(&rollback)?;
    drop(rollback);
    let failed_path = unique_unused_path(target_path, "failed-restore")?;
    if target_path.exists() {
        sync_file_for_phase(target_path, "recovery failed-target source")?;
        fs::rename(target_path, &failed_path)?;
        sync_parent_dirs(
            "recovery failed-target",
            [target_path, failed_path.as_path()],
        )?;
    }
    sync_file_for_phase(rollback_path, "recovery rollback file")?;
    if let Err(error) = fs::rename(rollback_path, target_path) {
        if failed_path.exists() && fs::rename(&failed_path, target_path).is_ok() {
            let _ = sync_parent_dirs(
                "recovery failed-target restoration",
                [failed_path.as_path(), target_path],
            );
        }
        return Err(error.into());
    }
    sync_parent_dirs("recovery publication", [rollback_path, target_path])?;
    let _ = fs::remove_file(failed_path);
    Ok(())
}

pub fn sync_file(path: &Path) -> BackupResult<()> {
    sync_file_for_phase(path, "file")
}

fn sync_file_for_phase(path: &Path, phase: &str) -> BackupResult<()> {
    if let Err(error) = File::open(path).and_then(|file| file.sync_all()) {
        return Err(BackupError::Invalid(format!(
            "durability sync failed during {phase} at {}: {error}",
            path.display()
        )));
    }
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
            "INSERT INTO sessions
                 (operation, model, input_text, parameters, result_count, processing_time,
                  status, error_message, created_at, completed_at)
             VALUES
                 ('analyze', 'm1', 'alpha', '{\"source\":\"test\"}', 7, 2.5,
                  'completed', NULL, '2024-02-03T04:05:06Z', '2024-02-03T04:06:07Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data
                 (source_type, original_form, lemma, tag, generated_form, probability,
                  session_id, created_at)
             VALUES
                 ('analysis', 'alpha', 'alpha-lemma', 'NOUN', 'alphas', 0.625,
                  1, '2024-02-03T04:07:08Z')",
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
        db::register_unicode_collation(&restored_connection).unwrap();
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
        let restored_session: db::Session = restored_connection
            .query_row(
                "SELECT operation, model, input_text, parameters, result_count,
                        processing_time, status, error_message, created_at, completed_at
                 FROM sessions WHERE id = 1",
                [],
                |row| {
                    Ok(db::Session {
                        id: Some(1),
                        operation: row.get(0)?,
                        model: row.get(1)?,
                        input_text: row.get(2)?,
                        parameters: row.get(3)?,
                        result_count: row.get(4)?,
                        processing_time: row.get(5)?,
                        status: row.get(6)?,
                        error_message: row.get(7)?,
                        created_at: row.get(8)?,
                        completed_at: row.get(9)?,
                    })
                },
            )
            .unwrap();
        assert_eq!(restored_session.id, Some(1));
        assert_eq!(restored_session.operation, "analyze");
        assert_eq!(restored_session.model, "m1");
        assert_eq!(restored_session.input_text, "alpha");
        assert_eq!(restored_session.parameters, "{\"source\":\"test\"}");
        assert_eq!(restored_session.result_count, 7);
        assert_eq!(restored_session.processing_time, Some(2.5));
        assert_eq!(restored_session.status, "completed");
        assert_eq!(restored_session.error_message, None);
        assert_eq!(
            restored_session.created_at.as_deref(),
            Some("2024-02-03T04:05:06Z")
        );
        assert_eq!(
            restored_session.completed_at.as_deref(),
            Some("2024-02-03T04:06:07Z")
        );
        let restored_data: db::MorphologicalData = restored_connection
            .query_row(
                "SELECT source_type, original_form, lemma, tag, generated_form, probability,
                        session_id, created_at
                 FROM morphological_data WHERE id = 1",
                [],
                |row| {
                    Ok(db::MorphologicalData {
                        id: Some(1),
                        source_type: row.get(0)?,
                        original_form: row.get(1)?,
                        lemma: row.get(2)?,
                        tag: row.get(3)?,
                        generated_form: row.get(4)?,
                        probability: row.get(5)?,
                        session_id: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                },
            )
            .unwrap();
        assert_eq!(restored_data.id, Some(1));
        assert_eq!(restored_data.source_type, "analysis");
        assert_eq!(restored_data.original_form.as_deref(), Some("alpha"));
        assert_eq!(restored_data.lemma, "alpha-lemma");
        assert_eq!(restored_data.tag, "NOUN");
        assert_eq!(restored_data.generated_form.as_deref(), Some("alphas"));
        assert_eq!(restored_data.probability, Some(0.625));
        assert_eq!(restored_data.session_id, Some(1));
        assert_eq!(
            restored_data.created_at.as_deref(),
            Some("2024-02-03T04:07:08Z")
        );
        assert_eq!(
            restored_connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            SCHEMA_VERSION
        );
        assert_eq!(
            restored_connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            restored_connection
                .query_row(
                    "SELECT on_delete FROM pragma_foreign_key_list('morphological_data')",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .unwrap(),
            "CASCADE"
        );
        assert_eq!(
            restored_connection
                .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        drop(restored_connection);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_oversized_metadata_before_fetching_or_deserializing_json() {
        let conn = populated_connection();
        conn.execute_batch(&format!(
            "CREATE TABLE {METADATA_TABLE} (id INTEGER PRIMARY KEY CHECK (id = 1), metadata_json TEXT NOT NULL);"
        )).unwrap();
        conn.execute(
            &format!("INSERT INTO {METADATA_TABLE} (id, metadata_json) VALUES (1, ?1)"),
            ["not-json".repeat(MAX_METADATA_JSON_BYTES)],
        )
        .unwrap();

        let error = read_metadata(&conn).unwrap_err();
        assert!(error.to_string().contains("maximum JSON size"));
    }

    #[test]
    fn rejects_non_cascade_session_foreign_key_before_touching_target() {
        let root = test_root("non-cascade");
        let backup_path = root.join("backup.sqlite");
        let target_path = root.join("morphodita.db");
        let source = populated_connection();

        source.execute_batch(
            "PRAGMA foreign_keys = OFF;
             ALTER TABLE morphological_data RENAME TO morphological_data_cascade;
             CREATE TABLE morphological_data (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 source_type TEXT NOT NULL CHECK (source_type IN ('analysis', 'generation')),
                 original_form TEXT,
                 lemma TEXT NOT NULL,
                 tag TEXT NOT NULL,
                 generated_form TEXT,
                 probability REAL,
                 session_id INTEGER,
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE NO ACTION
             );
             INSERT INTO morphological_data
                 (id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at)
             SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at
             FROM morphological_data_cascade;
             DROP TABLE morphological_data_cascade;
             PRAGMA user_version = 2;",
        )
        .unwrap();
        source
            .backup(
                rusqlite::MAIN_DB,
                &backup_path,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .unwrap();
        let backup_connection = Connection::open(&backup_path).unwrap();
        backup_connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .unwrap();
        let metadata = metadata_from_connection(&backup_connection).unwrap();
        write_metadata(&backup_connection, &metadata).unwrap();
        drop(backup_connection);

        let target = populated_connection();
        let target_file = root.join("target-source.sqlite");
        target
            .backup(
                rusqlite::MAIN_DB,
                &target_file,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .unwrap();
        drop(target);
        fs::rename(target_file, &target_path).unwrap();

        let validation_error = validate_backup(&backup_path).unwrap_err();
        assert!(validation_error
            .to_string()
            .contains("backup is missing the morphological_data session foreign key"));
        let restore_error = restore_database(&target_path, &backup_path).unwrap_err();
        assert!(restore_error
            .to_string()
            .contains("backup is missing the morphological_data session foreign key"));
        let untouched = Connection::open(&target_path).unwrap();
        assert_eq!(count_rows(&untouched, "sessions").unwrap(), 1);
        assert_eq!(count_rows(&untouched, "morphological_data").unwrap(), 1);
        drop(untouched);
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
            .backup(
                rusqlite::MAIN_DB,
                &target_file,
                None::<fn(rusqlite::backup::Progress)>,
            )
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

    #[test]
    fn republishes_the_prior_database_after_failed_replacement() {
        let root = test_root("recovery");
        let backup_path = root.join("backup.sqlite");
        let target_path = root.join("morphodita.db");
        let source = populated_connection();
        backup_database(&source, &backup_path).unwrap();
        let target = populated_connection();
        target
            .backup(
                rusqlite::MAIN_DB,
                &target_path,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .unwrap();
        drop(target);

        let result = restore_database(&target_path, &backup_path).unwrap();
        let rollback_path = PathBuf::from(result.rollback_path.unwrap());
        fs::write(&target_path, b"failed replacement").unwrap();
        recover_database(&target_path, &rollback_path).unwrap();

        let recovered = Connection::open(&target_path).unwrap();
        assert_eq!(count_rows(&recovered, "sessions").unwrap(), 1);
        assert!(!rollback_path.exists());
        drop(recovered);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_recovery_failure_without_claiming_recovery() {
        let root = test_root("recovery-failure");
        let target_path = root.join("morphodita.db");
        let rollback_path = root.join("missing.sqlite");
        let error = recover_database(&target_path, &rollback_path).unwrap_err();
        assert!(error
            .to_string()
            .contains("rollback database does not exist"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn publication_survives_cleanup_failure_and_drop_retries_without_retrying_commit() {
        let _lock = test_seams::TEST_LOCK.lock().unwrap();
        test_seams::reset();
        let root = test_root("cleanup-failure");
        let target = root.join("backup.sqlite");
        let temporary = TemporaryPath::create(&target, "test").unwrap();
        let bytes = b"exact backup bytes";
        fs::write(&temporary.path, bytes).unwrap();
        test_seams::CLEANUP_FAILURES.store(1, std::sync::atomic::Ordering::SeqCst);

        assert!(temporary.commit_to(&target).is_ok());
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert_eq!(
            test_seams::CLEANUP_ATTEMPTS.load(std::sync::atomic::Ordering::SeqCst),
            2
        );
        assert_eq!(
            test_seams::CLEANUP_FAILURES.load(std::sync::atomic::Ordering::SeqCst),
            0
        );
        fs::remove_dir_all(root).unwrap();
        test_seams::reset();
    }

    #[test]
    fn parent_sync_deduplicates_shared_parent_and_reports_phase_and_path() {
        let _lock = test_seams::TEST_LOCK.lock().unwrap();
        test_seams::reset();
        let root = test_root("directory-sync");
        let first = root.join("first");
        let second = root.join("second");
        sync_parent_dirs("test publication", [first.as_path(), second.as_path()]).unwrap();
        assert_eq!(
            test_seams::sync_events().as_slice(),
            std::slice::from_ref(&root)
        );

        test_seams::set_sync_failure_phase(Some("failing publication".to_string()));
        let error = sync_parent_dirs("failing publication", [first.as_path()]).unwrap_err();
        assert_eq!(
            error.to_string(),
            format!(
                "durability sync failed during failing publication at {}: injected directory sync failure",
                root.display()
            )
        );
        fs::remove_dir_all(root).unwrap();
        test_seams::reset();
    }

    #[test]
    fn restore_directory_sync_failure_keeps_rollback_evidence_and_reports_failure() {
        let _lock = test_seams::TEST_LOCK.lock().unwrap();
        test_seams::reset();
        let root = test_root("restore-sync-failure");
        let backup_path = root.join("backup.sqlite");
        let target_path = root.join("morphodita.db");
        let source = populated_connection();
        backup_database(&source, &backup_path).unwrap();
        let target = populated_connection();
        target
            .backup(
                rusqlite::MAIN_DB,
                &target_path,
                None::<fn(rusqlite::backup::Progress)>,
            )
            .unwrap();
        drop(target);
        test_seams::set_sync_failure_phase(Some("restore publication".to_string()));

        let error = restore_database(&target_path, &backup_path).unwrap_err();
        assert!(error
            .to_string()
            .contains("durability sync failed during restore publication"));
        assert!(target_path.exists());
        assert!(fs::read_dir(&root)
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains("pre-restore")));
        fs::remove_dir_all(root).unwrap();
        test_seams::reset();
    }

    #[test]
    fn concurrent_backup_publication_has_one_no_clobber_winner() {
        use std::sync::{Arc, Barrier};
        use std::thread;

        let root = test_root("publish-race");
        let target = root.join("backup.sqlite");
        let barrier = Arc::new(Barrier::new(2));
        let mut workers = Vec::new();
        for bytes in [b"first backup".as_slice(), b"second backup".as_slice()] {
            let barrier = Arc::clone(&barrier);
            let target = target.clone();
            workers.push(thread::spawn(move || {
                let temporary = TemporaryPath::create(&target, "race").unwrap();
                fs::write(&temporary.path, bytes).unwrap();
                barrier.wait();
                temporary.commit_to(&target).is_ok()
            }));
        }

        let successes = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|success| *success)
            .count();
        assert_eq!(successes, 1);
        let published = fs::read(&target).unwrap();
        assert!(published == b"first backup" || published == b"second backup");
        fs::remove_dir_all(root).unwrap();
    }
}
