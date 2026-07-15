use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::path::PathBuf;
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

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection> {
    let app_dir = app_handle.path().app_data_dir().expect("failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");
    
    let db_path: PathBuf = app_dir.join("morphodita.db");
    let conn = Connection::open(db_path)?;

    // Create tables
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

    // Create indexes
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_morphological_data_session_id ON morphological_data(session_id)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma ON morphological_data(lemma)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_morphological_data_source_type ON morphological_data(source_type)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_morphological_data_generated_form ON morphological_data(generated_form)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_morphological_data_lemma_tag ON morphological_data(lemma, tag)", [])?;

    Ok(conn)
}

pub fn create_session(conn: &Connection, session: Session) -> Result<i64> {
    conn.execute(
        "INSERT INTO sessions (operation, model, input_text, parameters, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![session.operation, session.model, session.input_text, session.parameters, session.status],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn update_session_status(
    conn: &Connection,
    id: i64,
    status: &str,
    result_count: Option<i32>,
    processing_time: Option<f64>,
    error_message: Option<&str>,
) -> Result<()> {
    // Update base status field (with completed_at timestamp for terminal states)
    if status == "completed" || status == "failed" {
        conn.execute(
            "UPDATE sessions SET status = ?1, completed_at = CURRENT_TIMESTAMP WHERE id = ?2",
            params![status, id],
        )?;
    } else {
        conn.execute(
            "UPDATE sessions SET status = ?1 WHERE id = ?2",
            params![status, id],
        )?;
    }

    // Update optional fields individually — safe, no dynamic parameter counting
    if let Some(rc) = result_count {
        conn.execute(
            "UPDATE sessions SET result_count = ?1 WHERE id = ?2",
            params![rc, id],
        )?;
    }
    if let Some(pt) = processing_time {
        conn.execute(
            "UPDATE sessions SET processing_time = ?1 WHERE id = ?2",
            params![pt, id],
        )?;
    }
    if let Some(err) = error_message {
        conn.execute(
            "UPDATE sessions SET error_message = ?1 WHERE id = ?2",
            params![err, id],
        )?;
    }

    Ok(())
}

pub fn insert_morphological_data(conn: &mut Connection, data: Vec<MorphologicalData>) -> Result<usize> {
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

pub fn get_sessions(conn: &Connection, limit: Option<i32>, offset: Option<i32>) -> Result<Vec<Session>> {
    let mut stmt = conn.prepare("SELECT id, operation, model, input_text, parameters, result_count, processing_time, status, error_message, created_at, completed_at FROM sessions ORDER BY created_at DESC LIMIT ?1 OFFSET ?2")?;
    
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

pub fn get_morphological_data(conn: &Connection, session_id: i64) -> Result<Vec<MorphologicalData>> {
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

pub fn word_form_exists(conn: &Connection, word: &str) -> Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT 1 FROM morphological_data 
         WHERE original_form = ?1 OR generated_form = ?1 
         LIMIT 1"
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
