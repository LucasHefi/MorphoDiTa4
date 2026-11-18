use rusqlite::functions::FunctionFlags;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: Option<i64>,
    pub operation: String,
    pub model: String,
    pub input_text: String,
    pub parameters: String,
    pub result_count: i32,
    pub processing_time: Option<f64>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphologicalData {
    pub id: Option<i64>,
    pub source_type: String,
    pub original_form: Option<String>,
    pub lemma: String,
    pub tag: String,
    pub generated_form: Option<String>,
    pub probability: Option<f64>,
    pub session_id: Option<i64>,
    pub created_at: Option<String>,
}

pub struct DbState {
    pub conn: Mutex<Option<Connection>>,
}

pub const SCHEMA_VERSION: i32 = 4;
pub const UNICODE_COLLATION: &str = "MORPHODITA_UNICODE";
pub const CANONICAL_KEY_FUNCTION: &str = "MORPHODITA_KEY";
pub const SQLITE_BUSY_TIMEOUT_MS: u64 = 5_000;
pub const MAX_WORD_FORM_LOOKUP_WORDS: usize = 10_000;
pub const MAX_INPUT_BYTES: usize = 10_000_000;
pub const MAX_MODEL_BYTES: usize = 256;
pub const MAX_PARAMETER_BYTES: usize = 64 * 1024;
pub const MAX_ERROR_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_FORM_BYTES: usize = 1024;
pub const MAX_LEMMA_BYTES: usize = 1024;
pub const MAX_TAG_BYTES: usize = 256;
pub const MAX_WIZARD_INPUT_WORDS: usize = 1_000_000;
pub const MAX_RESULT_BYTES: usize = 128 * 1024 * 1024;
pub const MAX_GENERATED_FORMS_PER_INPUT: usize = 16;
pub const MAX_OUTPUT_ROWS: usize = MAX_WIZARD_INPUT_WORDS * MAX_GENERATED_FORMS_PER_INPUT;
#[cfg(test)]
const LOOKUP_TEST_TIMEOUT: Duration = Duration::from_secs(5);

pub fn init_db(app_handle: &tauri::AppHandle) -> std::result::Result<Connection, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|error| {
        format!("database initialization: app data directory unavailable: {error}")
    })?;
    std::fs::create_dir_all(&app_dir).map_err(|error| {
        format!("database initialization: cannot create app data directory: {error}")
    })?;

    let db_path: PathBuf = app_dir.join("morphodita.db");
    open_database_at(&db_path)
        .map_err(|error| format!("database initialization: cannot open database: {error}"))
}

pub fn open_database_at(db_path: &std::path::Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| rusqlite::Error::InvalidPath(db_path.to_path_buf()))?;
    }
    reconcile_interrupted_restore(db_path)?;
    let conn = Connection::open(db_path)?;
    configure_db_connection(&conn)?;
    Ok(conn)
}

fn reconcile_interrupted_restore(db_path: &Path) -> Result<()> {
    if db_path.exists() {
        return Ok(());
    }

    let parent = db_path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| rusqlite::Error::InvalidPath(db_path.to_path_buf()))?;
    let prefix = format!(".{file_name}.pre-restore-");
    let mut candidates = Vec::new();

    for entry in std::fs::read_dir(parent).map_err(database_io_error)? {
        let entry = entry.map_err(database_io_error)?;
        // Reject symlinks before metadata() follows them, including dangling links.
        if !entry.file_type().map_err(database_io_error)?.is_file() {
            continue;
        }
        let metadata = entry.metadata().map_err(database_io_error)?;
        let candidate_name = entry.file_name();
        let Some(candidate_name) = candidate_name.to_str() else {
            continue;
        };
        let Some(sequence) = candidate_name
            .strip_prefix(&prefix)
            .and_then(|name| name.strip_suffix(".sqlite"))
        else {
            continue;
        };
        let sequence_parts: Vec<_> = sequence.split('-').collect();
        if sequence_parts.len() != 2
            || sequence_parts.iter().any(|part| {
                part.is_empty() || !part.chars().all(|character| character.is_ascii_digit())
            })
        {
            continue;
        }
        let modified = metadata.modified().unwrap_or(std::time::UNIX_EPOCH);
        candidates.push((modified, candidate_name.to_owned(), entry.path()));
    }

    if candidates.is_empty() {
        return Ok(());
    }

    candidates.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.cmp(&right.1))
            .reverse()
    });

    let mut last_error = None;
    for (_, name, candidate) in candidates {
        if db_path.exists() {
            return Ok(());
        }
        match Connection::open(&candidate).and_then(|connection| {
            validate_schema_contract(&connection).map_err(schema_contract_error)?;
            configure_db_connection(&connection)?;
            Ok(())
        }) {
            Ok(()) => {
                if db_path.exists() {
                    return Ok(());
                }
                if let Err(error) = std::fs::rename(&candidate, db_path) {
                    last_error = Some(database_io_error(error));
                    eprintln!(
                        "database initialization: could not republish rollback candidate {name}: {last_error:?}"
                    );
                    continue;
                }
                return Ok(());
            }
            Err(error) => {
                eprintln!("database initialization: invalid rollback candidate {name}: {error}");
                last_error = Some(error);
            }
        }
    }

    Err(last_error.unwrap_or(rusqlite::Error::InvalidQuery))
}

fn database_io_error(error: std::io::Error) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(error))
}

pub fn configure_db_connection(conn: &Connection) -> Result<()> {
    register_unicode_collation(conn)?;
    register_canonical_key_function(conn)?;
    conn.busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MS))?;
    initialize_schema(conn)
}

pub fn register_unicode_collation(conn: &Connection) -> Result<()> {
    conn.create_collation(UNICODE_COLLATION, |left, right| {
        canonical_db_key(left).cmp(&canonical_db_key(right))
    })
}

pub fn register_canonical_key_function(conn: &Connection) -> Result<()> {
    conn.create_scalar_function(
        CANONICAL_KEY_FUNCTION,
        1,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |context| {
            let value: Option<String> = context.get(0)?;
            Ok(value.map(|value| canonical_db_key(&value)))
        },
    )
}

pub fn canonical_db_key(value: &str) -> String {
    value
        .nfkc()
        .flat_map(char::to_lowercase)
        .map(|character| match character {
            '\u{03c2}' => '\u{03c3}',
            _ => character,
        })
        .collect::<String>()
        .replace('\u{00df}', "ss")
        .nfc()
        .collect()
}

fn create_schema_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT NOT NULL CHECK (operation IN ('tag', 'analyze', 'generate', 'tokenize')),
            model TEXT NOT NULL,
            input_text TEXT NOT NULL,
            parameters TEXT,
            result_count INTEGER DEFAULT 0,
            processing_time REAL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
            error_message TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS morphological_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_type TEXT NOT NULL CHECK (source_type IN ('analysis', 'generation')),
            original_form TEXT,
            lemma TEXT NOT NULL,
            tag TEXT NOT NULL,
            generated_form TEXT,
            probability REAL,
            session_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;
    Ok(())
}

fn create_schema_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE INDEX idx_sessions_status ON sessions(status);
         CREATE INDEX idx_sessions_created_at ON sessions(created_at);
         CREATE INDEX idx_sessions_model ON sessions(model);
         CREATE INDEX idx_morphological_data_session_id ON morphological_data(session_id);
          CREATE INDEX idx_morphological_data_original_form ON morphological_data(original_form COLLATE MORPHODITA_UNICODE);
         CREATE INDEX idx_morphological_data_lemma ON morphological_data(lemma);
         CREATE INDEX idx_morphological_data_source_type ON morphological_data(source_type);
          CREATE INDEX idx_morphological_data_generated_form ON morphological_data(generated_form COLLATE MORPHODITA_UNICODE);
         CREATE INDEX idx_morphological_data_lemma_tag ON morphological_data(lemma, tag);",
    )
}

fn rebuild_v2_to_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP INDEX IF EXISTS idx_sessions_status;
         DROP INDEX IF EXISTS idx_sessions_created_at;
         DROP INDEX IF EXISTS idx_sessions_model;
         DROP INDEX IF EXISTS idx_morphological_data_session_id;
         DROP INDEX IF EXISTS idx_morphological_data_original_form;
         DROP INDEX IF EXISTS idx_morphological_data_lemma;
         DROP INDEX IF EXISTS idx_morphological_data_source_type;
         DROP INDEX IF EXISTS idx_morphological_data_generated_form;
         DROP INDEX IF EXISTS idx_morphological_data_lemma_tag;
         ALTER TABLE sessions RENAME TO sessions_v2;
         ALTER TABLE morphological_data RENAME TO morphological_data_v2;
         CREATE TABLE sessions (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             operation TEXT NOT NULL CHECK (operation IN ('tag', 'analyze', 'generate', 'tokenize')),
             model TEXT NOT NULL,
             input_text TEXT NOT NULL,
             parameters TEXT,
             result_count INTEGER DEFAULT 0,
             processing_time REAL,
             status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
             error_message TEXT,
             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
             completed_at TIMESTAMP
         );
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
             FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
         );
         INSERT INTO sessions
             (id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at)
         SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at
         FROM sessions_v2;
         INSERT INTO morphological_data
             (id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at)
         SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at
         FROM morphological_data_v2;
         DROP TABLE morphological_data_v2;
         DROP TABLE sessions_v2;",
    )?;
    create_schema_indexes(conn)
}

fn migrate_v3_to_v4(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP INDEX idx_morphological_data_original_form;
         DROP INDEX idx_morphological_data_generated_form;
         CREATE INDEX idx_morphological_data_original_form
             ON morphological_data(original_form COLLATE MORPHODITA_UNICODE);
         CREATE INDEX idx_morphological_data_generated_form
             ON morphological_data(generated_form COLLATE MORPHODITA_UNICODE);",
    )
}

fn schema_contract_error(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(message.into())
}

fn normalize_schema_sql(sql: &str) -> String {
    sql.chars()
        .filter(|character| !character.is_ascii_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

fn validate_table_columns(
    conn: &Connection,
    table: &str,
    expected: &[(&str, &str, bool, Option<&str>, i32)],
) -> std::result::Result<(), String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| error.to_string())?;
    let actual = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i32>(3)? != 0,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i32>(5)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    if actual.len() != expected.len() {
        return Err(format!(
            "schema contract: {table} has unexpected column count"
        ));
    }
    for (index, (name, affinity, not_null, default, primary_key)) in expected.iter().enumerate() {
        let (actual_name, actual_type, actual_not_null, actual_default, actual_primary_key) =
            &actual[index];
        if actual_name != name
            || sqlite_affinity(actual_type) != *affinity
            || actual_not_null != not_null
            || actual_default.as_deref().map(normalize_schema_sql)
                != default.map(normalize_schema_sql)
            || actual_primary_key != primary_key
        {
            return Err(format!(
                "schema contract: {table}.{name} has unexpected definition"
            ));
        }
    }
    Ok(())
}

fn sqlite_affinity(declared_type: &str) -> &'static str {
    let declared_type = declared_type.to_ascii_uppercase();
    if declared_type.contains("INT") {
        "INTEGER"
    } else if declared_type.contains("CHAR")
        || declared_type.contains("CLOB")
        || declared_type.contains("TEXT")
    {
        "TEXT"
    } else if declared_type.contains("REAL")
        || declared_type.contains("FLOA")
        || declared_type.contains("DOUB")
    {
        "REAL"
    } else {
        "NUMERIC"
    }
}

fn validate_schema_indexes(conn: &Connection) -> std::result::Result<(), String> {
    let expected = [
        (
            "idx_sessions_status",
            "sessions",
            false,
            vec![("status", "BINARY")],
        ),
        (
            "idx_sessions_created_at",
            "sessions",
            false,
            vec![("created_at", "BINARY")],
        ),
        (
            "idx_sessions_model",
            "sessions",
            false,
            vec![("model", "BINARY")],
        ),
        (
            "idx_morphological_data_session_id",
            "morphological_data",
            false,
            vec![("session_id", "BINARY")],
        ),
        (
            "idx_morphological_data_original_form",
            "morphological_data",
            false,
            vec![("original_form", UNICODE_COLLATION)],
        ),
        (
            "idx_morphological_data_lemma",
            "morphological_data",
            false,
            vec![("lemma", "BINARY")],
        ),
        (
            "idx_morphological_data_source_type",
            "morphological_data",
            false,
            vec![("source_type", "BINARY")],
        ),
        (
            "idx_morphological_data_generated_form",
            "morphological_data",
            false,
            vec![("generated_form", UNICODE_COLLATION)],
        ),
        (
            "idx_morphological_data_lemma_tag",
            "morphological_data",
            false,
            vec![("lemma", "BINARY"), ("tag", "BINARY")],
        ),
    ];
    for (name, expected_table, expected_unique, columns) in expected {
        let actual_table: String = conn
            .query_row(
                "SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?1",
                params![name],
                |row| row.get(0),
            )
            .map_err(|_| format!("schema contract: required index {name} is missing"))?;
        let unique: bool = conn
            .query_row(
                "SELECT \"unique\" FROM pragma_index_list(?1) WHERE name = ?2",
                params![actual_table, name],
                |row| row.get::<_, i32>(0).map(|value| value != 0),
            )
            .map_err(|error| format!("schema contract: cannot inspect index {name}: {error}"))?;
        if actual_table != expected_table || unique != expected_unique {
            return Err(format!(
                "schema contract: index {name} has unexpected table or uniqueness"
            ));
        }
        let mut statement = conn
            .prepare(&format!("PRAGMA index_xinfo({name})"))
            .map_err(|error| error.to_string())?;
        let actual = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .filter_map(|row| row.ok())
            .filter(|row| row.0 >= 0)
            .map(|(_, column, collation)| (column.unwrap_or_default(), collation))
            .collect::<Vec<_>>();
        let expected_columns = columns
            .iter()
            .map(|(column, collation)| ((*column).to_string(), (*collation).to_string()))
            .collect::<Vec<_>>();
        if actual != expected_columns {
            return Err(format!(
                "schema contract: index {name} has unexpected columns or collation"
            ));
        }
    }
    Ok(())
}

pub fn validate_schema_contract(conn: &Connection) -> std::result::Result<(), String> {
    register_unicode_collation(conn).map_err(|error| error.to_string())?;
    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version != SCHEMA_VERSION {
        return Err(format!(
            "schema contract: user_version {version}, expected {SCHEMA_VERSION}"
        ));
    }
    let integrity: String = conn
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if integrity != "ok" {
        return Err(format!(
            "schema contract: SQLite integrity_check returned {integrity}"
        ));
    }
    let mut foreign_key_check = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|error| error.to_string())?;
    if foreign_key_check
        .query([])
        .map_err(|error| error.to_string())?
        .next()
        .map_err(|error| error.to_string())?
        .is_some()
    {
        return Err("schema contract: foreign_key_check is not empty".to_string());
    }
    validate_table_columns(
        conn,
        "sessions",
        &[
            ("id", "INTEGER", false, None, 1),
            ("operation", "TEXT", true, None, 0),
            ("model", "TEXT", true, None, 0),
            ("input_text", "TEXT", true, None, 0),
            ("parameters", "TEXT", false, None, 0),
            ("result_count", "INTEGER", false, Some("0"), 0),
            ("processing_time", "REAL", false, None, 0),
            ("status", "TEXT", true, Some("'pending'"), 0),
            ("error_message", "TEXT", false, None, 0),
            ("created_at", "NUMERIC", false, Some("CURRENT_TIMESTAMP"), 0),
            ("completed_at", "NUMERIC", false, None, 0),
        ],
    )?;
    validate_table_columns(
        conn,
        "morphological_data",
        &[
            ("id", "INTEGER", false, None, 1),
            ("source_type", "TEXT", true, None, 0),
            ("original_form", "TEXT", false, None, 0),
            ("lemma", "TEXT", true, None, 0),
            ("tag", "TEXT", true, None, 0),
            ("generated_form", "TEXT", false, None, 0),
            ("probability", "REAL", false, None, 0),
            ("session_id", "INTEGER", false, None, 0),
            ("created_at", "NUMERIC", false, Some("CURRENT_TIMESTAMP"), 0),
        ],
    )?;
    let checks = [
        (
            "sessions",
            "check(operationin('tag','analyze','generate','tokenize'))",
            "check(statusin('pending','processing','completed','failed'))",
        ),
        (
            "morphological_data",
            "check(source_typein('analysis','generation'))",
            "",
        ),
    ];
    for (table, first, second) in checks {
        let sql: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?1",
                params![table],
                |row| row.get(0),
            )
            .map_err(|error| format!("schema contract: {table} definition is missing: {error}"))?;
        let normalized = normalize_schema_sql(&sql);
        let expected_check_count = usize::from(!second.is_empty()) + 1;
        if normalized.matches("check(").count() != expected_check_count
            || !normalized.contains(first)
            || (!second.is_empty() && !normalized.contains(second))
        {
            return Err(format!(
                "schema contract: {table} has non-canonical CHECK constraints"
            ));
        }
    }
    let foreign_keys = conn
        .prepare("PRAGMA foreign_key_list(morphological_data)")
        .map_err(|error| error.to_string())?
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    if foreign_keys
        != [(
            "sessions".to_string(),
            "session_id".to_string(),
            "id".to_string(),
            "NO ACTION".to_string(),
            "CASCADE".to_string(),
            "NONE".to_string(),
        )]
    {
        return Err(
            "schema contract: morphological_data foreign key is not the canonical CASCADE relation"
                .to_string(),
        );
    }
    validate_schema_indexes(conn)
}

pub fn initialize_schema(conn: &Connection) -> Result<()> {
    register_unicode_collation(conn)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let foreign_keys: i32 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if foreign_keys != 1 {
        return Err(rusqlite::Error::InvalidQuery);
    }

    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version > SCHEMA_VERSION {
        return Err(schema_contract_error(format!(
            "unsupported database schema version {current_version}; expected at most {SCHEMA_VERSION}"
        )));
    }

    let tx = conn.unchecked_transaction()?;
    match current_version {
        0 => {
            create_schema_tables(&tx)?;
            rebuild_v2_to_v3(&tx)?;
        }
        1 => {
            create_schema_tables(&tx)?;
            rebuild_v2_to_v3(&tx)?;
        }
        2 => rebuild_v2_to_v3(&tx)?,
        3 => {}
        4 => validate_schema_contract(&tx).map_err(schema_contract_error)?,
        _ => unreachable!("future schema versions are rejected above"),
    }
    if current_version < SCHEMA_VERSION {
        migrate_v3_to_v4(&tx)?;
        tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        validate_schema_contract(&tx).map_err(schema_contract_error)?;
    }
    // Optional performance index; existing schema-v4 databases acquire it safely on startup.
    tx.execute_batch("CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma_unicode ON morphological_data(lemma COLLATE MORPHODITA_UNICODE)")?;
    crate::dashboard::initialize(&tx)?;
    tx.commit()
}

pub fn create_session(conn: &Connection, session: Session) -> Result<i64> {
    validate_session(&session)?;
    conn.execute(
        "INSERT INTO sessions (operation, model, input_text, parameters, result_count, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            session.operation,
            session.model,
            session.input_text,
            session.parameters,
            session.result_count,
            session.status
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn save_wizard_results(
    conn: &mut Connection,
    session: Session,
    data: Vec<MorphologicalData>,
) -> Result<(i64, usize)> {
    save_wizard_results_with_failure(conn, session, data, None)
}

fn save_wizard_results_with_failure(
    conn: &mut Connection,
    session: Session,
    data: Vec<MorphologicalData>,
    fail_after_rows: Option<usize>,
) -> Result<(i64, usize)> {
    validate_session(&session)?;
    validate_morphological_rows(&data)?;
    let declared_count =
        usize::try_from(session.result_count).map_err(|_| rusqlite::Error::InvalidQuery)?;
    if !data.is_empty() && declared_count != 0 && declared_count != data.len() {
        return Err(invalid_payload("result_count"));
    }
    let final_count = if data.is_empty() {
        declared_count
    } else {
        data.len()
    };
    let final_count_i32 = i32::try_from(final_count).map_err(|_| rusqlite::Error::InvalidQuery)?;
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO sessions (operation, model, input_text, parameters, result_count, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            session.operation,
            session.model,
            session.input_text,
            session.parameters,
            session.result_count,
            session.status,
        ],
    )?;
    let session_id = tx.last_insert_rowid();
    let mut saved_count = 0;

    {
        let mut stmt = tx.prepare(
            "INSERT INTO morphological_data
             (source_type, original_form, lemma, tag, generated_form, probability, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        for item in data {
            if fail_after_rows == Some(saved_count) {
                return Err(rusqlite::Error::InvalidQuery);
            }
            stmt.execute(params![
                item.source_type,
                item.original_form,
                item.lemma,
                item.tag,
                item.generated_form,
                item.probability,
                session_id,
            ])?;
            saved_count += 1;
        }
    }

    if fail_after_rows == Some(0) && saved_count == 0 {
        return Err(rusqlite::Error::InvalidQuery);
    }

    tx.execute(
        "UPDATE sessions
         SET status = 'completed', result_count = ?1, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![final_count_i32, session_id],
    )?;
    tx.commit()?;
    Ok((session_id, saved_count))
}

pub fn update_session_status(
    conn: &Connection,
    id: i64,
    status: &str,
    result_count: Option<i32>,
    processing_time: Option<f64>,
    error_message: Option<&str>,
) -> Result<()> {
    update_session_status_with_failure(
        conn,
        id,
        status,
        result_count,
        processing_time,
        error_message,
        None,
    )
}

fn update_session_status_with_failure(
    conn: &Connection,
    id: i64,
    status: &str,
    result_count: Option<i32>,
    processing_time: Option<f64>,
    error_message: Option<&str>,
    fail_after_step: Option<usize>,
) -> Result<()> {
    validate_status_update(status, result_count, processing_time, error_message)?;
    let tx = conn.unchecked_transaction()?;
    let mut step = 0;
    let fail_if_requested = |step: usize| {
        if fail_after_step == Some(step) {
            Err(rusqlite::Error::InvalidQuery)
        } else {
            Ok(())
        }
    };

    if status == "completed" || status == "failed" {
        tx.execute(
            "UPDATE sessions SET status = ?1, completed_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![status, id],
        )?;
    } else {
        tx.execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
    }
    step += 1;
    fail_if_requested(step)?;

    if let Some(rc) = result_count {
        tx.execute(
            "UPDATE sessions SET result_count = ?1 WHERE id = ?2",
            params![rc, id],
        )?;
        step += 1;
        fail_if_requested(step)?;
    }
    if let Some(pt) = processing_time {
        tx.execute(
            "UPDATE sessions SET processing_time = ?1 WHERE id = ?2",
            params![pt, id],
        )?;
        step += 1;
        fail_if_requested(step)?;
    }
    if let Some(err) = error_message {
        tx.execute(
            "UPDATE sessions SET error_message = ?1 WHERE id = ?2",
            params![err, id],
        )?;
        step += 1;
        fail_if_requested(step)?;
    }

    tx.commit()
}

pub fn insert_morphological_data(
    conn: &mut Connection,
    data: Vec<MorphologicalData>,
) -> Result<usize> {
    validate_morphological_rows(&data)?;
    let tx = conn.transaction()?;
    let mut count = 0;

    {
        let mut stmt = tx.prepare(
            "INSERT INTO morphological_data (source_type, original_form, lemma, tag, generated_form, probability, session_id)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        )?;

        for item in data {
            stmt.execute(params![
                item.source_type,
                item.original_form,
                item.lemma,
                item.tag,
                item.generated_form,
                item.probability,
                item.session_id
            ])?;
            count += 1;
        }
    }

    tx.commit()?;
    Ok(count)
}

fn invalid_payload(field: &str) -> rusqlite::Error {
    rusqlite::Error::InvalidParameterName(field.to_string())
}

fn validate_text(value: &Value, field: &str, max_bytes: usize, required: bool) -> Result<()> {
    let Some(value) = value.as_str() else {
        return Err(invalid_payload(field));
    };
    if (required && value.trim().is_empty()) || value.len() > max_bytes {
        return Err(invalid_payload(field));
    }
    Ok(())
}

fn validate_session_text(value: &str, field: &str, max_bytes: usize, required: bool) -> Result<()> {
    if (required && value.trim().is_empty()) || value.len() > max_bytes {
        return Err(invalid_payload(field));
    }
    Ok(())
}

fn validate_parameters(value: &Value) -> Result<()> {
    let Some(value) = value.as_str() else {
        return Err(invalid_payload("parameters"));
    };
    if value.len() > MAX_PARAMETER_BYTES
        || !serde_json::from_str::<Value>(value)
            .ok()
            .is_some_and(|parsed| parsed.is_object())
    {
        return Err(invalid_payload("parameters"));
    }
    Ok(())
}

fn validate_session_parameters(value: &str) -> Result<()> {
    if value.len() > MAX_PARAMETER_BYTES
        || !serde_json::from_str::<Value>(value)
            .ok()
            .is_some_and(|parsed| parsed.is_object())
    {
        return Err(invalid_payload("parameters"));
    }
    Ok(())
}

fn validate_session(session: &Session) -> Result<()> {
    if !matches!(
        session.operation.as_str(),
        "tag" | "analyze" | "generate" | "tokenize"
    ) || !matches!(
        session.status.as_str(),
        "pending" | "processing" | "completed" | "failed"
    ) || session.result_count < 0
        || session
            .processing_time
            .is_some_and(|value| !value.is_finite() || value < 0.0)
    {
        return Err(invalid_payload("session"));
    }
    validate_session_text(&session.operation, "operation", MAX_TAG_BYTES, true)?;
    validate_session_text(&session.model, "model", MAX_MODEL_BYTES, true)?;
    validate_session_text(&session.input_text, "input_text", MAX_INPUT_BYTES, true)?;
    validate_session_parameters(&session.parameters)?;
    validate_session_text(&session.status, "status", MAX_TAG_BYTES, true)?;
    if let Some(error_message) = session.error_message.as_deref() {
        validate_session_text(
            error_message,
            "error_message",
            MAX_ERROR_MESSAGE_BYTES,
            false,
        )?;
    }
    Ok(())
}

fn validate_output_row_count(count: usize) -> Result<()> {
    if count > MAX_OUTPUT_ROWS {
        return Err(invalid_payload("data"));
    }
    Ok(())
}

fn add_result_bytes(total: &mut usize, value: &str, field: &str) -> Result<()> {
    if value.trim().is_empty() || value.len() > MAX_INPUT_BYTES {
        return Err(invalid_payload(field));
    }
    *total = total.saturating_add(value.len());
    if *total > MAX_RESULT_BYTES {
        return Err(invalid_payload(field));
    }
    Ok(())
}

fn add_optional_result_bytes(total: &mut usize, value: Option<&str>, field: &str) -> Result<()> {
    if let Some(value) = value {
        add_result_bytes(total, value, field)?;
    }
    Ok(())
}

fn validate_morphological_rows(rows: &[MorphologicalData]) -> Result<()> {
    validate_output_row_count(rows.len())?;
    let mut bytes = 0;
    for row in rows {
        if !matches!(row.source_type.as_str(), "analysis" | "generation")
            || row
                .probability
                .is_some_and(|value| !value.is_finite() || !(0.0..=1.0).contains(&value))
            || row.session_id.is_some_and(|value| value <= 0)
        {
            return Err(invalid_payload("data"));
        }
        add_result_bytes(&mut bytes, &row.source_type, "source_type")?;
        add_result_bytes(&mut bytes, &row.lemma, "lemma")?;
        add_result_bytes(&mut bytes, &row.tag, "tag")?;
        add_optional_result_bytes(&mut bytes, row.original_form.as_deref(), "original_form")?;
        add_optional_result_bytes(&mut bytes, row.generated_form.as_deref(), "generated_form")?;
    }
    Ok(())
}

fn validate_status_update(
    status: &str,
    result_count: Option<i32>,
    processing_time: Option<f64>,
    error_message: Option<&str>,
) -> Result<()> {
    if !matches!(status, "pending" | "processing" | "completed" | "failed")
        || result_count.is_some_and(|value| value < 0)
        || processing_time.is_some_and(|value| !value.is_finite() || value < 0.0)
    {
        return Err(invalid_payload("status"));
    }
    validate_session_text(status, "status", MAX_TAG_BYTES, true)?;
    if let Some(error_message) = error_message {
        validate_session_text(
            error_message,
            "error_message",
            MAX_ERROR_MESSAGE_BYTES,
            false,
        )?;
    }
    Ok(())
}

pub fn get_sessions(
    conn: &Connection,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Session>> {
    let mut stmt = conn.prepare("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")?;

    let (l, o) = normalize_pagination(limit, offset)?;

    let session_iter = stmt.query_map(params![l, o], |row| {
        Ok(Session {
            id: row.get(0)?,
            operation: row.get(1)?,
            model: row.get(2)?,
            input_text: row.get(3)?,
            parameters: row.get(4)?,
            result_count: row.get(5)?,
            processing_time: row.get(6)?,
            status: row.get(7)?,
            error_message: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    })?;

    let mut sessions = Vec::new();
    for session in session_iter {
        sessions.push(session?);
    }
    Ok(sessions)
}

pub fn get_morphological_data(
    conn: &Connection,
    session_id: i64,
) -> Result<Vec<MorphologicalData>> {
    let mut stmt = conn.prepare("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data WHERE session_id = ?1")?;

    let data_iter = stmt.query_map(params![session_id], |row| {
        Ok(MorphologicalData {
            id: row.get(0)?,
            source_type: row.get(1)?,
            original_form: row.get(2)?,
            lemma: row.get(3)?,
            tag: row.get(4)?,
            generated_form: row.get(5)?,
            probability: row.get(6)?,
            session_id: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    let mut data = Vec::new();
    for d in data_iter {
        data.push(d?);
    }
    Ok(data)
}

pub fn get_all_morphological_data(
    conn: &Connection,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<MorphologicalData>> {
    let (limit, offset) = normalize_pagination(limit, offset)?;
    let mut stmt = conn.prepare("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")?;
    let rows = stmt.query_map(params![limit, offset], |row| {
        Ok(MorphologicalData {
            id: row.get(0)?,
            source_type: row.get(1)?,
            original_form: row.get(2)?,
            lemma: row.get(3)?,
            tag: row.get(4)?,
            generated_form: row.get(5)?,
            probability: row.get(6)?,
            session_id: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

fn delete_records(conn: &mut Connection, table: &str, ids: Vec<i64>) -> Result<usize> {
    let sql = match table {
        "sessions" => "DELETE FROM sessions WHERE id = ?1",
        "morphological_data" => "DELETE FROM morphological_data WHERE id = ?1",
        _ => return Err(rusqlite::Error::InvalidParameterName(table.to_string())),
    };
    let tx = conn.transaction()?;
    let mut count = 0;
    for id in ids {
        count += tx.execute(sql, params![id])?;
    }
    tx.commit()?;
    Ok(count)
}

pub fn delete_sessions(conn: &mut Connection, ids: Vec<i64>) -> Result<usize> {
    delete_records(conn, "sessions", ids)
}

pub fn delete_morphological_data(conn: &mut Connection, ids: Vec<i64>) -> Result<usize> {
    delete_records(conn, "morphological_data", ids)
}

fn json_to_sql_value(value: Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(value) => SqlValue::Integer(i64::from(value)),
        Value::Number(value) => value
            .as_i64()
            .map(SqlValue::Integer)
            .or_else(|| value.as_f64().map(SqlValue::Real))
            .unwrap_or(SqlValue::Null),
        Value::String(value) => SqlValue::Text(value),
        value => SqlValue::Text(value.to_string()),
    }
}

fn validate_numeric_update(field: &str, value: &Value) -> Result<()> {
    let valid = match field {
        "result_count" => value.as_i64().is_some_and(|number| number >= 0),
        "processing_time" => value
            .as_f64()
            .is_some_and(|number| number.is_finite() && number >= 0.0),
        "probability" => {
            value
                .as_f64()
                .is_some_and(|number| number.is_finite() && (0.0..=1.0).contains(&number))
                || value.is_null()
        }
        "session_id" => value.as_i64().is_some_and(|number| number > 0) || value.is_null(),
        _ => true,
    };
    if valid {
        Ok(())
    } else {
        Err(rusqlite::Error::InvalidParameterName(field.to_string()))
    }
}

fn validate_update_value(table: &str, field: &str, value: &Value) -> Result<()> {
    validate_numeric_update(field, value)?;
    match (table, field) {
        ("sessions", "operation") => {
            validate_text(value, field, MAX_TAG_BYTES, true)?;
            if !value.as_str().is_some_and(|operation| {
                matches!(operation, "tag" | "analyze" | "generate" | "tokenize")
            }) {
                return Err(invalid_payload(field));
            }
        }
        ("sessions", "model") => validate_text(value, field, MAX_MODEL_BYTES, true)?,
        ("sessions", "input_text") => validate_text(value, field, MAX_INPUT_BYTES, true)?,
        ("sessions", "parameters") => validate_parameters(value)?,
        ("sessions", "status") => {
            validate_text(value, field, MAX_TAG_BYTES, true)?;
            if !value.as_str().is_some_and(|status| {
                matches!(status, "pending" | "processing" | "completed" | "failed")
            }) {
                return Err(invalid_payload(field));
            }
        }
        ("sessions", "error_message") => {
            if !value.is_null() {
                validate_text(value, field, MAX_ERROR_MESSAGE_BYTES, false)?;
            }
        }
        ("morphological_data", "source_type") => {
            validate_text(value, field, MAX_TAG_BYTES, true)?;
            if !value
                .as_str()
                .is_some_and(|source_type| matches!(source_type, "analysis" | "generation"))
            {
                return Err(invalid_payload(field));
            }
        }
        ("morphological_data", "original_form") | ("morphological_data", "generated_form") => {
            if !value.is_null() {
                validate_text(value, field, MAX_FORM_BYTES, false)?;
            }
        }
        ("morphological_data", "lemma") => validate_text(value, field, MAX_LEMMA_BYTES, true)?,
        ("morphological_data", "tag") => validate_text(value, field, MAX_TAG_BYTES, true)?,
        _ => {}
    }
    Ok(())
}

fn update_record(
    conn: &Connection,
    table: &str,
    id: i64,
    field: &str,
    value: Value,
    allowed_fields: &[&str],
) -> Result<usize> {
    if !allowed_fields.contains(&field) {
        return Err(rusqlite::Error::InvalidParameterName(field.to_string()));
    }
    validate_update_value(table, field, &value)?;
    let sql = format!("UPDATE {table} SET {field} = ?1 WHERE id = ?2");
    conn.execute(&sql, params![json_to_sql_value(value), id])
}

pub fn update_session(conn: &Connection, id: i64, field: &str, value: Value) -> Result<usize> {
    update_record(
        conn,
        "sessions",
        id,
        field,
        value,
        &[
            "operation",
            "model",
            "input_text",
            "parameters",
            "result_count",
            "processing_time",
            "status",
            "error_message",
        ],
    )
}

pub fn update_morphological_data(
    conn: &Connection,
    id: i64,
    field: &str,
    value: Value,
) -> Result<usize> {
    update_record(
        conn,
        "morphological_data",
        id,
        field,
        value,
        &[
            "source_type",
            "original_form",
            "lemma",
            "tag",
            "generated_form",
            "probability",
            "session_id",
        ],
    )
}

fn validate_search_fields(fields: &[String], allowed_fields: &[&str]) -> Result<Vec<String>> {
    if fields.is_empty()
        || fields
            .iter()
            .any(|field| !allowed_fields.contains(&field.as_str()))
    {
        return Err(rusqlite::Error::InvalidParameterName("fields".to_string()));
    }
    Ok(fields.to_vec())
}

fn normalize_pagination(limit: Option<i32>, offset: Option<i32>) -> Result<(i64, i64)> {
    let limit = match limit {
        None => 100,
        Some(value) if (1..=1_000).contains(&value) => value,
        Some(_) => return Err(rusqlite::Error::InvalidParameterName("limit".to_string())),
    };
    let offset = match offset {
        None => 0,
        Some(value) if value >= 0 => value,
        Some(_) => return Err(rusqlite::Error::InvalidParameterName("offset".to_string())),
    };
    Ok((i64::from(limit), i64::from(offset)))
}

pub fn search_sessions(
    conn: &Connection,
    search_term: &str,
    fields: &[String],
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Session>> {
    let fields = validate_search_fields(
        fields,
        &[
            "operation",
            "model",
            "input_text",
            "status",
            "error_message",
        ],
    )?;
    let clauses = fields
        .iter()
        .enumerate()
        .map(|(index, field)| format!("{field} LIKE ?{}", index + 1))
        .collect::<Vec<_>>()
        .join(" OR ");
    let (limit, offset) = normalize_pagination(limit, offset)?;
    let limit_placeholder = fields.len() + 1;
    let sql = format!("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions WHERE {clauses} ORDER BY created_at DESC, id DESC LIMIT ?{limit_placeholder} OFFSET ?{}", limit_placeholder + 1);
    let query_param = format!("%{search_term}%");
    let mut stmt = conn.prepare(&sql)?;
    let mut query_params: Vec<SqlValue> = fields
        .iter()
        .map(|_| SqlValue::Text(query_param.clone()))
        .collect();
    query_params.push(SqlValue::Integer(limit));
    query_params.push(SqlValue::Integer(offset));
    let rows = stmt.query_map(params_from_iter(query_params), |row| {
        Ok(Session {
            id: row.get(0)?,
            operation: row.get(1)?,
            model: row.get(2)?,
            input_text: row.get(3)?,
            parameters: row.get(4)?,
            result_count: row.get(5)?,
            processing_time: row.get(6)?,
            status: row.get(7)?,
            error_message: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    })?;
    rows.collect()
}

pub fn search_morphological_data(
    conn: &Connection,
    search_term: &str,
    fields: &[String],
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<MorphologicalData>> {
    let fields = validate_search_fields(
        fields,
        &[
            "source_type",
            "original_form",
            "lemma",
            "tag",
            "generated_form",
            "created_at",
        ],
    )?;
    let clauses = fields
        .iter()
        .enumerate()
        .map(|(index, field)| format!("{field} LIKE ?{}", index + 1))
        .collect::<Vec<_>>()
        .join(" OR ");
    let (limit, offset) = normalize_pagination(limit, offset)?;
    let limit_placeholder = fields.len() + 1;
    let sql = format!("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data WHERE {clauses} ORDER BY created_at DESC, id DESC LIMIT ?{limit_placeholder} OFFSET ?{}", limit_placeholder + 1);
    let query_param = format!("%{search_term}%");
    let mut stmt = conn.prepare(&sql)?;
    let mut query_params: Vec<SqlValue> = fields
        .iter()
        .map(|_| SqlValue::Text(query_param.clone()))
        .collect();
    query_params.push(SqlValue::Integer(limit));
    query_params.push(SqlValue::Integer(offset));
    let rows = stmt.query_map(params_from_iter(query_params), |row| {
        Ok(MorphologicalData {
            id: row.get(0)?,
            source_type: row.get(1)?,
            original_form: row.get(2)?,
            lemma: row.get(3)?,
            tag: row.get(4)?,
            generated_form: row.get(5)?,
            probability: row.get(6)?,
            session_id: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;
    rows.collect()
}

fn build_word_forms_exist_query(word_count: usize, include_lemmas: bool) -> String {
    let values = (0..word_count)
        .map(|_| "(?, ?)".to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let lemma_join = if include_lemmas {
        "UNION SELECT input.position, input.word FROM input JOIN morphological_data ON morphological_data.lemma = input.word COLLATE MORPHODITA_UNICODE"
    } else {
        ""
    };
    format!(
        "WITH input(position, word) AS (VALUES {values})
         SELECT word FROM (
             SELECT input.position, input.word FROM input
             JOIN morphological_data ON morphological_data.original_form = input.word COLLATE MORPHODITA_UNICODE
             UNION
             SELECT input.position, input.word FROM input
             JOIN morphological_data ON morphological_data.generated_form = input.word COLLATE MORPHODITA_UNICODE
             {lemma_join}
         )
         GROUP BY word
         ORDER BY MIN(position)"
    )
}

pub fn word_forms_exist(conn: &Connection, words: &[String]) -> Result<Vec<String>> {
    word_values_exist(conn, words, false)
}

pub fn word_values_exist(
    conn: &Connection,
    words: &[String],
    include_lemmas: bool,
) -> Result<Vec<String>> {
    if words.len() > MAX_WORD_FORM_LOOKUP_WORDS {
        return Err(rusqlite::Error::InvalidParameterName("words".to_string()));
    }
    if words.iter().map(String::len).sum::<usize>() > MAX_INPUT_BYTES {
        return Err(rusqlite::Error::InvalidParameterName("words".to_string()));
    }

    let mut unique_words = Vec::with_capacity(words.len());
    let mut seen = HashSet::with_capacity(words.len());
    for word in words {
        if !word.trim().is_empty() && seen.insert(canonical_db_key(word)) {
            unique_words.push(word);
        }
    }
    if unique_words.is_empty() {
        return Ok(Vec::new());
    }

    let query = build_word_forms_exist_query(unique_words.len(), include_lemmas);
    let query_params = unique_words
        .iter()
        .enumerate()
        .flat_map(|(index, word)| {
            [
                SqlValue::Integer(index as i64),
                SqlValue::Text((*word).clone()),
            ]
        })
        .collect::<Vec<_>>();
    let mut stmt = conn.prepare(&query)?;
    let matches = stmt.query_map(params_from_iter(query_params), |row| row.get(0))?;
    matches.collect()
}

pub fn get_session(conn: &Connection, id: i64) -> Result<Session> {
    let mut stmt = conn.prepare("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions WHERE id = ?1")?;
    let session = stmt.query_row(params![id], |row| {
        Ok(Session {
            id: row.get(0)?,
            operation: row.get(1)?,
            model: row.get(2)?,
            input_text: row.get(3)?,
            parameters: row.get(4)?,
            result_count: row.get(5)?,
            processing_time: row.get(6)?,
            status: row.get(7)?,
            error_message: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    })?;
    Ok(session)
}

pub fn delete_session(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM sessions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn search_lemmas(conn: &Connection, query: &str) -> Result<Vec<MorphologicalData>> {
    register_canonical_key_function(conn)?;
    let mut stmt = conn.prepare("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data WHERE instr(MORPHODITA_KEY(lemma), MORPHODITA_KEY(?1)) > 0 OR instr(MORPHODITA_KEY(original_form), MORPHODITA_KEY(?1)) > 0 OR instr(MORPHODITA_KEY(generated_form), MORPHODITA_KEY(?1)) > 0 LIMIT 100")?;
    let data_iter = stmt.query_map(params![query], |row| {
        Ok(MorphologicalData {
            id: row.get(0)?,
            source_type: row.get(1)?,
            original_form: row.get(2)?,
            lemma: row.get(3)?,
            tag: row.get(4)?,
            generated_form: row.get(5)?,
            probability: row.get(6)?,
            session_id: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    let mut data = Vec::new();
    for d in data_iter {
        data.push(d?);
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        register_unicode_collation(&conn).unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                id INTEGER PRIMARY KEY,
                operation TEXT NOT NULL,
                model TEXT NOT NULL,
                input_text TEXT NOT NULL,
                parameters TEXT NOT NULL,
                result_count INTEGER NOT NULL,
                processing_time REAL,
                status TEXT NOT NULL,
                error_message TEXT,
                created_at TEXT,
                completed_at TEXT
            );
            CREATE TABLE morphological_data (
                id INTEGER PRIMARY KEY,
                source_type TEXT NOT NULL,
                original_form TEXT,
                lemma TEXT NOT NULL,
                tag TEXT NOT NULL,
                generated_form TEXT,
                probability REAL,
                session_id INTEGER,
                 created_at TEXT
             );
             CREATE INDEX idx_morphological_data_original_form ON morphological_data(original_form COLLATE MORPHODITA_UNICODE);
             CREATE INDEX idx_morphological_data_generated_form ON morphological_data(generated_form COLLATE MORPHODITA_UNICODE);
             CREATE INDEX idx_morphological_data_lemma_unicode ON morphological_data(lemma COLLATE MORPHODITA_UNICODE);",
        )
        .unwrap();
        conn
    }

    #[test]
    fn configures_sqlite_busy_timeout_before_transactional_work() {
        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();
        let timeout: i64 = conn
            .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
            .unwrap();
        assert_eq!(timeout, SQLITE_BUSY_TIMEOUT_MS as i64);
    }

    fn restore_test_root(label: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "morphodita-db-restore-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn rollback_path(root: &Path, suffix: &str) -> PathBuf {
        root.join(format!(".morphodita.db.pre-restore-{suffix}.sqlite"))
    }

    fn create_populated_rollback(path: &Path, lemma: &str) {
        let conn = Connection::open(path).unwrap();
        configure_db_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO sessions (operation, model, input_text, status) VALUES ('analyze', 'model', 'input', 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data (source_type, lemma, tag) VALUES ('analysis', ?1, 'N')",
            [lemma],
        )
        .unwrap();
    }

    #[test]
    fn recovers_populated_rollback_and_retains_no_empty_database() {
        let root = restore_test_root("valid");
        let target = root.join("morphodita.db");
        let rollback = rollback_path(&root, "100-0");
        create_populated_rollback(&rollback, "recovered");

        let conn = open_database_at(&target).unwrap();
        assert_eq!(
            conn.query_row("SELECT lemma FROM morphological_data", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "recovered"
        );
        assert!(target.is_file());
        assert!(!rollback.exists());
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_only_rollback_fails_closed_without_target() {
        let root = restore_test_root("invalid");
        let target = root.join("morphodita.db");
        let rollback = rollback_path(&root, "100-0");
        std::fs::write(&rollback, b"not a sqlite database").unwrap();
        let empty_rollback = rollback_path(&root, "200-0");
        drop(Connection::open(&empty_rollback).unwrap());

        assert!(open_database_at(&target).is_err());
        assert!(!target.exists());
        assert!(rollback.exists());
        assert!(empty_rollback.exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn existing_target_wins_and_retains_rollback_copy() {
        let root = restore_test_root("existing");
        let target = root.join("morphodita.db");
        create_populated_rollback(&target, "live");
        let rollback = rollback_path(&root, "100-0");
        std::fs::write(&rollback, b"not a sqlite database").unwrap();

        let conn = open_database_at(&target).unwrap();
        assert_eq!(
            conn.query_row("SELECT lemma FROM morphological_data", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "live"
        );
        assert!(rollback.exists());
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ignores_unrelated_restore_like_paths() {
        let root = restore_test_root("unrelated");
        let target = root.join("morphodita.db");
        std::fs::write(root.join(".other.db.pre-restore-100-0.sqlite"), b"invalid").unwrap();
        std::fs::write(
            root.join(".morphodita.db.pre-restore-invalid.sqlite"),
            b"invalid",
        )
        .unwrap();

        let conn = open_database_at(&target).unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn selects_newest_valid_rollback_deterministically() {
        let root = restore_test_root("newest");
        let target = root.join("morphodita.db");
        let older = rollback_path(&root, "100-0");
        let newer = rollback_path(&root, "200-0");
        create_populated_rollback(&older, "older");
        std::thread::sleep(Duration::from_millis(20));
        create_populated_rollback(&newer, "newer");

        let conn = open_database_at(&target).unwrap();
        assert_eq!(
            conn.query_row("SELECT lemma FROM morphological_data", [], |row| row
                .get::<_, String>(0))
                .unwrap(),
            "newer"
        );
        assert!(older.exists());
        assert!(!newer.exists());
        drop(conn);
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn lookup_can_include_lemmas_without_changing_existing_form_lookup() {
        let conn = test_connection();
        conn.execute("INSERT INTO morphological_data (source_type, original_form, lemma, tag) VALUES ('analysis', 'psa', 'pes', 'N')", []).unwrap();
        let words = vec!["PES".to_string()];
        assert!(word_forms_exist(&conn, &words).unwrap().is_empty());
        assert_eq!(word_values_exist(&conn, &words, true).unwrap(), words);
        let plan: Vec<String> = conn
            .prepare(&format!(
                "EXPLAIN QUERY PLAN {}",
                build_word_forms_exist_query(1, true)
            ))
            .unwrap()
            .query_map(params![0, "pes"], |row| row.get(3))
            .unwrap()
            .collect::<Result<_>>()
            .unwrap();
        assert!(
            plan.iter()
                .any(|step| step.contains("idx_morphological_data_lemma_unicode")),
            "{plan:?}"
        );
    }

    #[test]
    fn batch_word_lookup_matches_original_and_generated_forms_once() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO morphological_data (id, source_type, original_form, lemma, tag, generated_form)
             VALUES (1, 'analysis', 'alpha', 'alpha', 'N', 'beta')",
            [],
        )
        .unwrap();

        let matched = word_forms_exist(
            &conn,
            &[
                "missing".to_string(),
                "beta".to_string(),
                "alpha".to_string(),
                "alpha".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(matched, vec!["beta".to_string(), "alpha".to_string()]);

        let case_insensitive_match = word_forms_exist(&conn, &["ALPHA".to_string()]).unwrap();
        assert_eq!(case_insensitive_match, vec!["ALPHA".to_string()]);
    }

    #[test]
    fn batch_word_lookup_deduplicates_case_insensitively_in_first_seen_order() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO morphological_data (id, source_type, original_form, lemma, tag, generated_form)
             VALUES (1, 'analysis', 'alpha', 'alpha', 'N', 'beta')",
            [],
        )
        .unwrap();

        let matched = word_forms_exist(
            &conn,
            &[
                "Beta".to_string(),
                "ALPHA".to_string(),
                "beta".to_string(),
                "alpha".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(matched, vec!["Beta".to_string(), "ALPHA".to_string()]);
    }

    #[test]
    fn unicode_word_lookup_matches_case_and_nfc_nfd_variants_in_first_seen_order() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO morphological_data
             (id, source_type, original_form, lemma, tag, generated_form)
             VALUES
             (1, 'analysis', 'čat', 'čat', 'N', NULL),
             (2, 'analysis', 'pe\u{301}s', 'pés', 'N', NULL),
             (3, 'analysis', 'ŁÓDŹ', 'łódź', 'N', NULL)",
            [],
        )
        .unwrap();

        let ascii_nocase_matches: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM morphological_data
                 WHERE original_form = ?1 COLLATE NOCASE",
                ["ČAT"],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(ascii_nocase_matches, 0, "SQLite NOCASE is ASCII-only");

        let matched = word_forms_exist(
            &conn,
            &["ČAT".to_string(), "PÉS".to_string(), "łódź".to_string()],
        )
        .unwrap();

        assert_eq!(matched, vec!["ČAT", "PÉS", "łódź"]);
    }

    #[test]
    fn canonical_db_key_applies_required_unicode_rules_without_collapsing_dotless_i() {
        assert_eq!(canonical_db_key("Straße"), "strasse");
        assert_eq!(canonical_db_key("ΟΣ"), "οσ");
        assert_eq!(canonical_db_key("I"), "i");
        assert_eq!(canonical_db_key("ı"), "ı");
        assert_ne!(canonical_db_key("I"), canonical_db_key("ı"));
    }

    #[test]
    fn search_lemmas_matches_unicode_case_and_nfc_nfd_equivalence() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO morphological_data
             (id, source_type, original_form, lemma, tag, generated_form)
             VALUES
             (1, 'analysis', 'Český', 'PŘÍŠTÍ', 'N', NULL),
             (2, 'analysis', 'pies', 'pe\u{301}s', 'N', NULL),
             (3, 'analysis', 'ŁÓDŹ', 'łódź', 'N', NULL),
             (4, 'analysis', NULL, 'unrelated', 'N', NULL)",
            [],
        )
        .unwrap();

        assert_eq!(search_lemmas(&conn, "příští").unwrap().len(), 1);
        assert_eq!(search_lemmas(&conn, "PÉS").unwrap().len(), 1);
        assert_eq!(search_lemmas(&conn, "ódź").unwrap().len(), 1);
        assert_eq!(search_lemmas(&conn, "ČES").unwrap().len(), 1);
    }

    #[test]
    fn batch_word_lookup_accepts_10000_words_and_rejects_10001() {
        let conn = test_connection();
        let at_limit = (0..MAX_WORD_FORM_LOOKUP_WORDS)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>();
        let over_limit = (0..=MAX_WORD_FORM_LOOKUP_WORDS)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>();

        assert!(word_forms_exist(&conn, &at_limit).unwrap().is_empty());
        assert!(word_forms_exist(&conn, &over_limit).is_err());
    }

    #[test]
    fn original_form_index_is_created_with_the_application_schema() {
        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();

        let index_exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM sqlite_master
                    WHERE type = 'index' AND name = 'idx_morphological_data_original_form'
                )",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(index_exists);
    }

    #[test]
    fn lookup_indexes_are_present_and_used_by_query_plans() {
        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();

        let plan = conn
            .prepare(&format!(
                "EXPLAIN QUERY PLAN {query}",
                query = build_word_forms_exist_query(1, false)
            ))
            .unwrap()
            .query_map(params![0i64, "word"], |row| row.get::<_, String>(3))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap()
            .join(" ");

        assert!(
            plan.contains("idx_morphological_data_original_form"),
            "actual word_forms_exist plan did not use original-form index: {plan}"
        );
        assert!(
            plan.contains("idx_morphological_data_generated_form"),
            "actual word_forms_exist plan did not use generated-form index: {plan}"
        );
    }

    #[test]
    fn migrates_populated_v3_indexes_to_v4_without_changing_rows_or_ids() {
        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, status)
             VALUES (41, 'analyze', 'legacy', 'legacy', 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data
             (id, source_type, original_form, lemma, tag, generated_form, session_id)
             VALUES (73, 'analysis', 'čat', 'čat', 'N', 'pés', 41)",
            [],
        )
        .unwrap();
        conn.execute_batch(
            "DROP INDEX idx_morphological_data_original_form;
             DROP INDEX idx_morphological_data_generated_form;
             CREATE INDEX idx_morphological_data_original_form
                 ON morphological_data(original_form COLLATE NOCASE);
             CREATE INDEX idx_morphological_data_generated_form
                 ON morphological_data(generated_form COLLATE NOCASE);
             PRAGMA user_version = 3;",
        )
        .unwrap();

        initialize_schema(&conn).unwrap();

        assert_eq!(
            conn.query_row(
                "SELECT id, session_id, original_form, generated_form
                 FROM morphological_data",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap(),
            (
                73,
                Some(41),
                Some("čat".to_string()),
                Some("pés".to_string())
            )
        );
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            4
        );
        validate_schema_contract(&conn).unwrap();
    }

    #[test]
    fn migrates_populated_v2_fixture_to_v4_preserving_rows_ids_foreign_keys_and_indexes() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             CREATE TABLE sessions (
                 id INTEGER PRIMARY KEY AUTOINCREMENT,
                 operation TEXT NOT NULL CHECK (operation IN ('tag', 'analyze', 'generate', 'tokenize')),
                 model TEXT NOT NULL,
                 input_text TEXT NOT NULL,
                 parameters TEXT,
                 result_count INTEGER DEFAULT 0,
                 processing_time REAL,
                 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                 error_message TEXT,
                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                 completed_at TIMESTAMP
             );
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
                 FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
             );
             CREATE INDEX idx_sessions_status ON sessions(status);
             CREATE INDEX idx_sessions_created_at ON sessions(created_at);
             CREATE INDEX idx_sessions_model ON sessions(model);
             CREATE INDEX idx_morphological_data_session_id ON morphological_data(session_id);
             CREATE INDEX idx_morphological_data_original_form ON morphological_data(original_form COLLATE NOCASE);
             CREATE INDEX idx_morphological_data_lemma ON morphological_data(lemma);
             CREATE INDEX idx_morphological_data_source_type ON morphological_data(source_type);
             CREATE INDEX idx_morphological_data_generated_form ON morphological_data(generated_form COLLATE NOCASE);
             CREATE INDEX idx_morphological_data_lemma_tag ON morphological_data(lemma, tag);
             INSERT INTO sessions (id, operation, model, input_text, status)
                 VALUES (12, 'analyze', 'v2-model', 'v2 input', 'completed');
             INSERT INTO morphological_data
                 (id, source_type, original_form, lemma, tag, generated_form, session_id)
                 VALUES (34, 'analysis', 'Český', 'p\u{301}es', 'N', 'ŁÓDŹ', 12);
             PRAGMA user_version = 2;",
        )
        .unwrap();

        initialize_schema(&conn).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT id, session_id, original_form, lemma, generated_form FROM morphological_data",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap(),
            (34, Some(12), Some("Český".to_string()), Some("p\u{301}es".to_string()), Some("ŁÓDŹ".to_string()))
        );
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM pragma_index_list('morphological_data')",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            7
        );
        validate_schema_contract(&conn).unwrap();
        conn.execute("DELETE FROM sessions WHERE id = 12", [])
            .unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn v3_migration_failure_rolls_back_index_changes_and_version() {
        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO morphological_data (id, source_type, original_form, lemma, tag)
             VALUES (9, 'analysis', 'legacy', 'legacy', 'N')",
            [],
        )
        .unwrap();
        conn.execute_batch(
            "DROP INDEX idx_morphological_data_generated_form;
             PRAGMA user_version = 3;",
        )
        .unwrap();

        assert!(initialize_schema(&conn).is_err());
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |row| row.get::<_, i32>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            conn.query_row("SELECT id FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            9
        );
        assert!(conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE name = 'idx_morphological_data_original_form'",
                [],
                |row| row.get::<_, String>(0),
            )
            .unwrap()
            .contains("MORPHODITA_UNICODE"));
    }

    #[test]
    fn real_10000_word_lookup_stays_within_memory_and_5_second_time_budgets() {
        const MAX_TOTAL_MEMORY_BYTES: usize = 64 * 1024 * 1024;

        let conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();
        conn.execute(
            "INSERT INTO morphological_data (source_type, original_form, lemma, tag, generated_form)
             VALUES ('analysis', ?1, ?1, 'N', ?2)",
            params!["word9999", "generated9999"],
        )
        .unwrap();
        let words = (0..MAX_WORD_FORM_LOOKUP_WORDS)
            .map(|index| format!("word{index}"))
            .collect::<Vec<_>>();
        let input_bytes: usize = words.iter().map(|word| word.len()).sum();
        assert!(input_bytes <= MAX_INPUT_BYTES);

        let started = std::time::Instant::now();
        let (matched_result, additional_peak_bytes) =
            crate::measure_peak_heap_growth(|| word_forms_exist(&conn, &words));
        assert!(started.elapsed() <= LOOKUP_TEST_TIMEOUT);
        let matched = matched_result.unwrap();
        println!("10,000-word lookup heap evidence: {input_bytes} input bytes + {additional_peak_bytes} additional peak bytes");
        assert!(
            input_bytes + additional_peak_bytes <= MAX_TOTAL_MEMORY_BYTES,
            "10,000-word lookup exceeded {MAX_TOTAL_MEMORY_BYTES} byte total memory budget: {input_bytes} input bytes + {additional_peak_bytes} additional peak bytes"
        );
        assert_eq!(matched, vec!["word9999"]);
    }

    #[test]
    fn supports_all_data_reads_and_batch_deletes() {
        let mut conn = test_connection();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
             VALUES (1, 'analyze', 'm1', 'alpha', '{}', 1, 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data (id, source_type, lemma, tag, session_id, created_at)
             VALUES (1, 'analysis', 'alpha', 'N', 1, 'same')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO morphological_data (id, source_type, lemma, tag, session_id, created_at)
             VALUES (2, 'analysis', 'beta', 'N', 1, 'same')",
            [],
        )
        .unwrap();

        let rows = get_all_morphological_data(&conn, Some(10), Some(0)).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, Some(2));
        assert_eq!(rows[1].id, Some(1));
        assert_eq!(delete_morphological_data(&mut conn, vec![1, 2]).unwrap(), 2);
        assert_eq!(delete_sessions(&mut conn, vec![1]).unwrap(), 1);
    }

    #[test]
    fn validates_updates_and_searches_only_allowed_fields() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
             VALUES (1, 'analyze', 'm1', 'alpha', '{}', 0, 'pending')",
            [],
        )
        .unwrap();

        assert_eq!(update_session(&conn, 1, "model", json!("m2")).unwrap(), 1);
        assert_eq!(update_session(&conn, 99, "model", json!("m2")).unwrap(), 0);
        assert_eq!(
            search_sessions(&conn, "m2", &["model".to_string()], Some(10), Some(0))
                .unwrap()
                .len(),
            1
        );
        assert!(update_session(&conn, 1, "created_at", json!("bad")).is_err());
    }

    #[test]
    fn rejects_invalid_numeric_updates_without_corrupting_rows() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
             VALUES (1, 'analyze', 'm1', 'alpha', '{}', 0, 'pending')",
            [],
        )
        .unwrap();

        assert!(update_session(&conn, 1, "result_count", json!(null)).is_err());
        assert!(update_session(&conn, 1, "result_count", json!(-1)).is_err());
        assert!(update_session(&conn, 1, "result_count", json!(1.5)).is_err());
        assert!(update_session(&conn, 1, "processing_time", json!(-0.1)).is_err());

        let result_count: i32 = conn
            .query_row(
                "SELECT result_count FROM sessions WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(result_count, 0);
    }

    #[test]
    fn rejects_invalid_direct_create_without_creating_a_session() {
        let conn = test_connection();
        let mut session = valid_session();
        session.parameters = "[]".to_string();

        assert!(create_session(&conn, session).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn accepts_create_and_update_boundaries_and_rejects_boundary_plus_one() {
        let conn = test_connection();
        let mut session = valid_session();
        session.model = "m".repeat(MAX_MODEL_BYTES);
        session.input_text = "i".repeat(MAX_INPUT_BYTES);
        let id = create_session(&conn, session).unwrap();

        assert!(
            update_session(&conn, id, "model", json!("m".repeat(MAX_MODEL_BYTES + 1))).is_err()
        );
        assert!(update_session(
            &conn,
            id,
            "input_text",
            json!("i".repeat(MAX_INPUT_BYTES + 1))
        )
        .is_err());
        assert_eq!(
            conn.query_row(
                "SELECT length(model), length(input_text) FROM sessions",
                [],
                |row| { Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)) }
            )
            .unwrap(),
            (MAX_MODEL_BYTES as i64, MAX_INPUT_BYTES as i64)
        );
    }

    #[test]
    fn validates_direct_update_types_enums_json_and_nullable_text() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
             VALUES (1, 'analyze', 'model', 'input', '{}', 0, 'pending')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO morphological_data (id, source_type, original_form, lemma, tag, generated_form, session_id)
             VALUES (1, 'analysis', 'original', 'lemma', 'N', 'generated', 1)",
            [],
        )
        .unwrap();

        for (field, value) in [
            ("operation", json!(true)),
            ("operation", json!("invalid")),
            ("status", json!("invalid")),
            ("model", json!(false)),
            ("input_text", json!({})),
            ("parameters", json!("[]")),
            ("parameters", json!("not-json")),
            ("error_message", json!(123)),
        ] {
            assert!(update_session(&conn, 1, field, value).is_err());
        }
        for (field, value) in [
            ("source_type", json!("invalid")),
            ("lemma", json!("")),
            ("tag", json!(false)),
            ("original_form", json!(123)),
            ("generated_form", json!({})),
        ] {
            assert!(update_morphological_data(&conn, 1, field, value).is_err());
        }

        assert_eq!(
            update_session(&conn, 1, "status", json!("processing")).unwrap(),
            1
        );
        assert_eq!(
            update_session(&conn, 1, "parameters", json!(r#"{"ok":true}"#)).unwrap(),
            1
        );
        assert_eq!(
            update_session(&conn, 1, "error_message", json!(null)).unwrap(),
            1
        );
        assert_eq!(
            update_morphological_data(&conn, 1, "original_form", json!(null)).unwrap(),
            1
        );
        assert_eq!(
            update_morphological_data(&conn, 1, "generated_form", json!("new")).unwrap(),
            1
        );
    }

    #[test]
    fn search_results_honor_limit_and_offset() {
        let conn = test_connection();
        for id in 1..=3 {
            conn.execute(
                "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
                 VALUES (?1, 'analyze', 'model', 'input', '{}', 0, 'completed')",
                params![id],
            )
            .unwrap();
        }

        let page = search_sessions(&conn, "", &["model".to_string()], Some(1), Some(1)).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].id, Some(2));
    }

    #[test]
    fn rejects_invalid_list_pagination() {
        let conn = test_connection();
        assert!(get_sessions(&conn, Some(0), Some(0)).is_err());
        assert!(get_sessions(&conn, Some(1), Some(-1)).is_err());
        assert!(get_all_morphological_data(&conn, Some(1_001), Some(0)).is_err());
    }

    #[test]
    fn persists_sessions_across_close_and_reopen_with_deterministic_bounded_order() {
        struct TemporaryDatabase {
            path: PathBuf,
        }

        impl TemporaryDatabase {
            fn new() -> Self {
                let nonce = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .expect("system clock must be after the Unix epoch")
                    .as_nanos();
                let path = std::env::temp_dir().join(format!(
                    "morphodita-db-persistence-{}-{nonce}.sqlite",
                    std::process::id()
                ));
                remove_database_artifacts(&path);
                Self { path }
            }
        }

        impl Drop for TemporaryDatabase {
            fn drop(&mut self) {
                remove_database_artifacts(&self.path);
            }
        }

        fn remove_database_artifacts(path: &std::path::Path) {
            let _ = std::fs::remove_file(path);
            for suffix in ["-journal", "-wal", "-shm"] {
                let _ = std::fs::remove_file(path.with_file_name(format!(
                    "{}{}",
                    path.file_name().and_then(|name| name.to_str()).unwrap_or("database"),
                    suffix
                )));
            }
        }

        let temporary_database = TemporaryDatabase::new();
        let conn = open_database_at(&temporary_database.path).unwrap();
        let created_at = [
            "2026-08-01T10:00:00.000Z",
            "2026-08-03T10:00:00.000Z",
            "2026-08-03T10:00:00.000Z",
            "2026-08-02T10:00:00.000Z",
            "2026-08-03T10:00:00.000Z",
            "2026-08-01T10:00:00.000Z",
        ];
        let mut ids = Vec::new();

        for timestamp in created_at {
            let id = create_session(
                &conn,
                Session {
                    id: None,
                    operation: "analyze".to_string(),
                    model: "czech-model".to_string(),
                    input_text: "seeded input".to_string(),
                    parameters: "{}".to_string(),
                    result_count: 1,
                    processing_time: None,
                    status: "completed".to_string(),
                    error_message: None,
                    created_at: None,
                    completed_at: None,
                },
            )
            .unwrap();
            conn.execute(
                "UPDATE sessions SET created_at = ?1 WHERE id = ?2",
                params![timestamp, id],
            )
            .unwrap();
            ids.push(id);
        }

        assert!(temporary_database.path.exists());
        drop(conn);

        let mut reopened = open_database_at(&temporary_database.path).unwrap();
        let sessions = get_sessions(&reopened, Some(4), Some(0)).unwrap();
        let expected_ids = vec![ids[4], ids[2], ids[1], ids[3]];

        assert_eq!(sessions.len(), expected_ids.len());
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.unwrap())
                .collect::<Vec<_>>(),
            expected_ids
        );
        assert_eq!(get_sessions(&reopened, Some(4), Some(0)).unwrap().len(), 4);

        let (new_id, saved_count) = save_wizard_results(
            &mut reopened,
            Session {
                id: None,
                operation: "analyze".to_string(),
                model: "czech-model".to_string(),
                input_text: "new input".to_string(),
                parameters: "{}".to_string(),
                result_count: 1,
                processing_time: None,
                status: "processing".to_string(),
                error_message: None,
                created_at: None,
                completed_at: None,
            },
            vec![MorphologicalData {
                id: None,
                source_type: "analysis".to_string(),
                original_form: Some("new".to_string()),
                lemma: "new".to_string(),
                tag: "N".to_string(),
                generated_form: None,
                probability: None,
                session_id: None,
                created_at: None,
            }],
        )
        .unwrap();
        assert_eq!(saved_count, 1);
        drop(reopened);

        let reopened_again = open_database_at(&temporary_database.path).unwrap();
        let sessions = get_sessions(&reopened_again, Some(7), Some(0)).unwrap();
        let expected_ids = [new_id, ids[4], ids[2], ids[1], ids[3], ids[5], ids[0]];
        assert_eq!(
            sessions
                .iter()
                .map(|session| session.id.unwrap())
                .collect::<Vec<_>>(),
            expected_ids
        );
        drop(reopened_again);

        let database_path = temporary_database.path.clone();
        drop(temporary_database);
        assert!(!database_path.exists());
    }

    #[test]
    fn exercises_database_editor_crud_search_pagination_and_cascade() {
        let mut conn = Connection::open_in_memory().unwrap();
        configure_db_connection(&conn).unwrap();

        let session_id = create_session(
            &conn,
            Session {
                id: None,
                operation: "analyze".to_string(),
                model: "czech-250909".to_string(),
                input_text: "alpha beta".to_string(),
                parameters: "{}".to_string(),
                result_count: 0,
                processing_time: None,
                status: "pending".to_string(),
                error_message: None,
                created_at: None,
                completed_at: None,
            },
        )
        .unwrap();
        assert_eq!(get_sessions(&conn, Some(1), Some(0)).unwrap().len(), 1);

        assert_eq!(
            insert_morphological_data(
                &mut conn,
                vec![
                    MorphologicalData {
                        id: None,
                        source_type: "analysis".to_string(),
                        original_form: Some("alpha".to_string()),
                        lemma: "alpha".to_string(),
                        tag: "N".to_string(),
                        generated_form: None,
                        probability: Some(0.9),
                        session_id: Some(session_id),
                        created_at: None,
                    },
                    MorphologicalData {
                        id: None,
                        source_type: "analysis".to_string(),
                        original_form: Some("beta".to_string()),
                        lemma: "beta".to_string(),
                        tag: "N".to_string(),
                        generated_form: None,
                        probability: Some(0.8),
                        session_id: Some(session_id),
                        created_at: None,
                    },
                ],
            )
            .unwrap(),
            2
        );
        assert_eq!(get_morphological_data(&conn, session_id).unwrap().len(), 2);
        assert_eq!(
            search_morphological_data(&conn, "alpha", &["lemma".to_string()], Some(10), Some(0))
                .unwrap()
                .len(),
            1
        );

        assert_eq!(
            update_session(&conn, session_id, "model", json!("updated-model")).unwrap(),
            1
        );
        assert_eq!(
            search_sessions(
                &conn,
                "updated-model",
                &["model".to_string()],
                Some(10),
                Some(0)
            )
            .unwrap()
            .len(),
            1
        );
        assert!(insert_morphological_data(
            &mut conn,
            vec![MorphologicalData {
                id: None,
                source_type: "analysis".to_string(),
                original_form: Some("orphan".to_string()),
                lemma: "orphan".to_string(),
                tag: "N".to_string(),
                generated_form: None,
                probability: None,
                session_id: Some(999),
                created_at: None,
            }],
        )
        .is_err());
        assert_eq!(delete_sessions(&mut conn, vec![session_id]).unwrap(), 1);
        assert!(get_session(&conn, session_id).is_err());
        assert!(get_all_morphological_data(&conn, Some(10), Some(0))
            .unwrap()
            .is_empty());
    }

    #[test]
    fn migrates_v1_fixture_without_data_loss_and_enables_foreign_keys() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE sessions (
                id INTEGER PRIMARY KEY,
                operation TEXT NOT NULL,
                model TEXT NOT NULL,
                input_text TEXT NOT NULL,
                parameters TEXT,
                result_count INTEGER DEFAULT 0,
                processing_time REAL,
                status TEXT NOT NULL,
                error_message TEXT,
                created_at TEXT,
                completed_at TEXT
            );
            CREATE TABLE morphological_data (
                id INTEGER PRIMARY KEY,
                source_type TEXT NOT NULL,
                original_form TEXT,
                lemma TEXT NOT NULL,
                tag TEXT NOT NULL,
                generated_form TEXT,
                probability REAL,
                session_id INTEGER,
                created_at TEXT
            );
            INSERT INTO sessions
                (id, operation, model, input_text, parameters, result_count, processing_time,
                 status, error_message, created_at, completed_at)
            VALUES
                 (7, 'analyze', 'legacy-model', 'legacy input', '{\"legacy\":true}', 42, 1.25,
                 'failed', 'legacy error', '2024-01-02T03:04:05Z', '2024-01-02T03:05:06Z');
             INSERT INTO morphological_data
                 (id, source_type, original_form, lemma, tag, generated_form, probability,
                  session_id, created_at)
             VALUES
                 (11, 'generation', 'legacy original', 'legacy lemma', 'NOUN', 'legacy generated',
                  0.875, 7, '2024-01-02T03:06:07Z');
             PRAGMA user_version = 1;",
        )
        .unwrap();

        initialize_schema(&conn).unwrap();

        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let foreign_keys: i32 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(foreign_keys, 1);
        let session: Session = conn
            .query_row(
                "SELECT id, operation, model, input_text, parameters, result_count,
                        processing_time, status, error_message, created_at, completed_at
                 FROM sessions WHERE id = 7",
                [],
                |row| {
                    Ok(Session {
                        id: row.get(0)?,
                        operation: row.get(1)?,
                        model: row.get(2)?,
                        input_text: row.get(3)?,
                        parameters: row.get(4)?,
                        result_count: row.get(5)?,
                        processing_time: row.get(6)?,
                        status: row.get(7)?,
                        error_message: row.get(8)?,
                        created_at: row.get(9)?,
                        completed_at: row.get(10)?,
                    })
                },
            )
            .unwrap();
        assert_eq!(session.id, Some(7));
        assert_eq!(session.operation, "analyze");
        assert_eq!(session.model, "legacy-model");
        assert_eq!(session.input_text, "legacy input");
        assert_eq!(session.parameters, "{\"legacy\":true}");
        assert_eq!(session.result_count, 42);
        assert_eq!(session.processing_time, Some(1.25));
        assert_eq!(session.status, "failed");
        assert_eq!(session.error_message.as_deref(), Some("legacy error"));
        assert_eq!(session.created_at.as_deref(), Some("2024-01-02T03:04:05Z"));
        assert_eq!(
            session.completed_at.as_deref(),
            Some("2024-01-02T03:05:06Z")
        );
        let morphological_data: MorphologicalData = conn
            .query_row(
                "SELECT id, source_type, original_form, lemma, tag, generated_form,
                        probability, session_id, created_at
                 FROM morphological_data WHERE id = 11",
                [],
                |row| {
                    Ok(MorphologicalData {
                        id: row.get(0)?,
                        source_type: row.get(1)?,
                        original_form: row.get(2)?,
                        lemma: row.get(3)?,
                        tag: row.get(4)?,
                        generated_form: row.get(5)?,
                        probability: row.get(6)?,
                        session_id: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                },
            )
            .unwrap();
        assert_eq!(morphological_data.id, Some(11));
        assert_eq!(morphological_data.source_type, "generation");
        assert_eq!(
            morphological_data.original_form.as_deref(),
            Some("legacy original")
        );
        assert_eq!(morphological_data.lemma, "legacy lemma");
        assert_eq!(morphological_data.tag, "NOUN");
        assert_eq!(
            morphological_data.generated_form.as_deref(),
            Some("legacy generated")
        );
        assert_eq!(morphological_data.probability, Some(0.875));
        assert_eq!(morphological_data.session_id, Some(7));
        assert_eq!(
            morphological_data.created_at.as_deref(),
            Some("2024-01-02T03:06:07Z")
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(conn
            .execute(
                "INSERT INTO morphological_data (source_type, lemma, tag, session_id)
                 VALUES ('analysis', 'orphan', 'N', 999)",
                [],
            )
            .is_err());

        conn.execute("DELETE FROM sessions WHERE id = 7", [])
            .unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );

        initialize_schema(&conn).unwrap();
    }

    #[test]
    fn rejects_database_with_future_schema_version() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();

        assert!(initialize_schema(&conn).is_err());
    }

    #[test]
    fn migrates_v1_foreign_key_to_cascade_behavior() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             CREATE TABLE sessions (id INTEGER PRIMARY KEY, operation TEXT NOT NULL, model TEXT NOT NULL,
                 input_text TEXT NOT NULL, parameters TEXT, result_count INTEGER DEFAULT 0,
                 processing_time REAL, status TEXT NOT NULL, error_message TEXT,
                 created_at TEXT, completed_at TEXT);
             CREATE TABLE morphological_data (id INTEGER PRIMARY KEY, source_type TEXT NOT NULL,
                 original_form TEXT, lemma TEXT NOT NULL, tag TEXT NOT NULL, generated_form TEXT,
                 probability REAL, session_id INTEGER, created_at TEXT,
                 FOREIGN KEY (session_id) REFERENCES sessions(id));
             INSERT INTO sessions (id, operation, model, input_text, status)
                 VALUES (1, 'analyze', 'model', 'input', 'completed');
             INSERT INTO morphological_data (id, source_type, lemma, tag, session_id)
                 VALUES (1, 'analysis', 'lemma', 'N', 1);
             PRAGMA user_version = 1;",
        )
        .unwrap();

        initialize_schema(&conn).unwrap();
        conn.execute("DELETE FROM sessions WHERE id = 1", [])
            .unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn rolls_back_session_status_optional_fields_on_injected_failure() {
        let conn = test_connection();
        conn.execute(
            "INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status)
             VALUES (1, 'analyze', 'm1', 'alpha', '{}', 0, 'pending')",
            [],
        )
        .unwrap();

        assert!(update_session_status_with_failure(
            &conn,
            1,
            "completed",
            Some(3),
            Some(1.5),
            Some("failed later"),
            Some(1),
        )
        .is_err());

        let state: (String, i32, Option<String>) = conn
            .query_row(
                "SELECT status, result_count, completed_at FROM sessions WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(state, ("pending".to_string(), 0, None));
    }

    #[test]
    fn rolls_back_wizard_session_and_rows_on_mid_write_failure() {
        let mut conn = test_connection();
        let session = Session {
            id: None,
            operation: "analyze".to_string(),
            model: "m1".to_string(),
            input_text: "alpha".to_string(),
            parameters: "{}".to_string(),
            result_count: 0,
            processing_time: None,
            status: "pending".to_string(),
            error_message: None,
            created_at: None,
            completed_at: None,
        };
        let rows = vec![
            MorphologicalData {
                id: None,
                source_type: "analysis".to_string(),
                original_form: Some("alpha".to_string()),
                lemma: "alpha".to_string(),
                tag: "N".to_string(),
                generated_form: None,
                probability: None,
                session_id: None,
                created_at: None,
            },
            MorphologicalData {
                id: None,
                source_type: "generation".to_string(),
                original_form: None,
                lemma: "beta".to_string(),
                tag: "N".to_string(),
                generated_form: Some("betas".to_string()),
                probability: None,
                session_id: None,
                created_at: None,
            },
        ];

        assert!(save_wizard_results_with_failure(&mut conn, session, rows, Some(1)).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn saves_empty_wizard_results_as_completed_session_with_declared_count() {
        let mut conn = test_connection();
        let mut session = valid_session();
        session.operation = "tokenize".to_string();
        session.result_count = 3;

        let (session_id, saved_count) =
            save_wizard_results(&mut conn, session, Vec::new()).unwrap();

        assert_eq!(saved_count, 0);
        let state: (String, i32) = conn
            .query_row(
                "SELECT status, result_count FROM sessions WHERE id = ?1",
                params![session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(state, ("completed".to_string(), 3));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn rolls_back_empty_wizard_results_on_injected_failure() {
        let mut conn = test_connection();
        let mut session = valid_session();
        session.operation = "tokenize".to_string();
        session.result_count = 3;

        assert!(save_wizard_results_with_failure(&mut conn, session, Vec::new(), Some(0)).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn rejects_nonempty_results_with_a_conflicting_declared_count() {
        let mut conn = test_connection();
        let mut session = valid_session();
        session.result_count = 2;

        assert!(save_wizard_results(&mut conn, session, vec![valid_morphological_data()]).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn rejects_invalid_wizard_payload_before_creating_any_rows() {
        let mut conn = test_connection();
        let mut rows = vec![valid_morphological_data()];
        rows[0].lemma.clear();
        assert!(save_wizard_results(&mut conn, valid_session(), rows).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );

        assert!(validate_output_row_count(MAX_OUTPUT_ROWS + 1).is_err());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM morphological_data", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }

    #[test]
    fn accepts_large_wizard_output_above_previous_limits() {
        assert!(validate_output_row_count(16_000_000).is_ok());
        assert!(validate_output_row_count(16_000_001).is_err());
        let mut bytes = MAX_RESULT_BYTES;
        assert!(add_result_bytes(&mut bytes, "x", "data").is_err());
        let mut conn = test_connection();
        let rows = vec![valid_morphological_data(); 100_000];
        assert_eq!(insert_morphological_data(&mut conn, rows).unwrap(), 100_000);
    }

    #[test]
    fn rejects_invalid_status_numbers_and_non_finite_probabilities_without_updates() {
        let conn = test_connection();
        conn.execute("INSERT INTO sessions (id, operation, model, input_text, parameters, result_count, status) VALUES (1, 'analyze', 'm', 'i', '{}', 0, 'pending')", []).unwrap();
        assert!(update_session_status(&conn, 1, "unknown", Some(0), Some(0.0), None).is_err());
        assert!(
            update_session_status(&conn, 1, "completed", Some(-1), Some(f64::NAN), None).is_err()
        );
        let mut data = valid_morphological_data();
        data.probability = Some(f64::INFINITY);
        let mut writable = conn;
        assert!(insert_morphological_data(&mut writable, vec![data]).is_err());
        assert_eq!(
            writable
                .query_row("SELECT status FROM sessions WHERE id = 1", [], |row| row
                    .get::<_, String>(
                    0
                ))
                .unwrap(),
            "pending"
        );
    }

    fn valid_session() -> Session {
        Session {
            id: None,
            operation: "analyze".to_string(),
            model: "model".to_string(),
            input_text: "input".to_string(),
            parameters: "{}".to_string(),
            result_count: 0,
            processing_time: None,
            status: "pending".to_string(),
            error_message: None,
            created_at: None,
            completed_at: None,
        }
    }

    fn valid_morphological_data() -> MorphologicalData {
        MorphologicalData {
            id: None,
            source_type: "analysis".to_string(),
            original_form: Some("input".to_string()),
            lemma: "lemma".to_string(),
            tag: "N".to_string(),
            generated_form: None,
            probability: Some(0.5),
            session_id: None,
            created_at: None,
        }
    }
}
