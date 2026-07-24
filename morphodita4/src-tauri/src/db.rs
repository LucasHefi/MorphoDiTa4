use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
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

#[derive(Debug, Serialize, Deserialize)]
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

pub const SCHEMA_VERSION: i32 = 2;
pub const SQLITE_BUSY_TIMEOUT_MS: u64 = 5_000;

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

    let db_path: PathBuf = app_dir.join("morphodita.db");
    open_database_at(&db_path)
}

pub fn open_database_at(db_path: &std::path::Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|_| rusqlite::Error::InvalidPath(db_path.to_path_buf()))?;
    }
    let conn = Connection::open(db_path)?;
    configure_db_connection(&conn)?;
    Ok(conn)
}

pub fn configure_db_connection(conn: &Connection) -> Result<()> {
    conn.busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MS))?;
    initialize_schema(conn)
}

fn table_exists(conn: &Connection, table: &str) -> Result<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![table],
        |row| row.get(0),
    )
}

fn has_morphological_data_foreign_key(conn: &Connection) -> Result<bool> {
    let mut stmt = conn.prepare("PRAGMA foreign_key_list(morphological_data)")?;
    let has_foreign_key = {
        let mut rows = stmt.query([])?;
        rows.next()?.is_some()
    };
    Ok(has_foreign_key)
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

pub fn initialize_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    let foreign_keys: i32 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
    if foreign_keys != 1 {
        return Err(rusqlite::Error::InvalidQuery);
    }

    let current_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if current_version > SCHEMA_VERSION {
        return Err(rusqlite::Error::InvalidQuery);
    }

    let tx = conn.unchecked_transaction()?;
    create_schema_tables(&tx)?;

    if table_exists(&tx, "morphological_data")? && !has_morphological_data_foreign_key(&tx)? {
        tx.execute_batch(
            "ALTER TABLE morphological_data RENAME TO morphological_data_v1;
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
             INSERT INTO morphological_data
                 (id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at)
             SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at
             FROM morphological_data_v1;
             DROP TABLE morphological_data_v1;",
        )?;
    }

    tx.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
         CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
         CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
         CREATE INDEX IF NOT EXISTS idx_morphological_data_session_id ON morphological_data(session_id);
         CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma ON morphological_data(lemma);
         CREATE INDEX IF NOT EXISTS idx_morphological_data_source_type ON morphological_data(source_type);
         CREATE INDEX IF NOT EXISTS idx_morphological_data_generated_form ON morphological_data(generated_form);
         CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma_tag ON morphological_data(lemma, tag);",
    )?;
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
    tx.commit()
}

pub fn create_session(conn: &Connection, session: Session) -> Result<i64> {
    conn.execute(
        "INSERT INTO sessions (operation, model, input_text, parameters, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![session.operation, session.model, session.input_text, session.parameters, session.status],
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

    tx.execute(
        "UPDATE sessions
         SET status = 'completed', result_count = ?1, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?2",
        params![saved_count as i32, session_id],
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

pub fn get_sessions(
    conn: &Connection,
    limit: Option<i32>,
    offset: Option<i32>,
) -> Result<Vec<Session>> {
    let mut stmt = conn.prepare("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")?;

    let l = limit.unwrap_or(100);
    let o = offset.unwrap_or(0);

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
    let mut stmt = conn.prepare("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data ORDER BY created_at DESC, id DESC LIMIT ?1 OFFSET ?2")?;
    let rows = stmt.query_map(params![limit.unwrap_or(100), offset.unwrap_or(0)], |row| {
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

pub fn search_sessions(
    conn: &Connection,
    search_term: &str,
    fields: &[String],
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
    let sql = format!("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions WHERE {clauses} ORDER BY created_at DESC, id DESC LIMIT 100");
    let query_param = format!("%{search_term}%");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params_from_iter(fields.iter().map(|_| query_param.clone())),
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
    )?;
    rows.collect()
}

pub fn search_morphological_data(
    conn: &Connection,
    search_term: &str,
    fields: &[String],
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
    let sql = format!("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data WHERE {clauses} ORDER BY created_at DESC, id DESC LIMIT 100");
    let query_param = format!("%{search_term}%");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(
        params_from_iter(fields.iter().map(|_| query_param.clone())),
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
    )?;
    rows.collect()
}

pub fn word_form_exists(conn: &Connection, word: &str) -> Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT 1 FROM morphological_data 
         WHERE original_form = ?1 OR generated_form = ?1 
         LIMIT 1",
    )?;
    let exists = stmt.exists(params![word])?;
    Ok(exists)
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
    let mut stmt = conn.prepare("SELECT id, source_type, original_form, lemma, tag, generated_form, probability, session_id, created_at FROM morphological_data WHERE lemma LIKE ?1 OR original_form LIKE ?1 OR generated_form LIKE ?1 LIMIT 100")?;
    let query_param = format!("%{}%", query);
    let data_iter = stmt.query_map(params![query_param], |row| {
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

    fn test_connection() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
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
            );",
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
            search_sessions(&conn, "m2", &["model".to_string()])
                .unwrap()
                .len(),
            1
        );
        assert!(update_session(&conn, 1, "created_at", json!("bad")).is_err());
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
            search_morphological_data(&conn, "alpha", &["lemma".to_string()])
                .unwrap()
                .len(),
            1
        );

        assert_eq!(
            update_session(&conn, session_id, "model", json!("updated-model")).unwrap(),
            1
        );
        assert_eq!(
            search_sessions(&conn, "updated-model", &["model".to_string()])
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
            INSERT INTO sessions (id, operation, model, input_text, parameters, status)
            VALUES (7, 'analyze', 'legacy-model', 'legacy input', '{}', 'completed');
            INSERT INTO morphological_data (id, source_type, original_form, lemma, tag, session_id)
            VALUES (11, 'analysis', 'legacy', 'legacy', 'N', 7);",
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

        initialize_schema(&conn).unwrap();
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
}
