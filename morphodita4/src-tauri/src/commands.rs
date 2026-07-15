use crate::db::{self, DbState, MorphologicalData, Session};
use tauri::State;

#[tauri::command]
pub fn create_session(
    state: State<'_, DbState>,
    session: Session,
) -> std::result::Result<i64, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::create_session(conn, session).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn update_session_status(
    state: State<'_, DbState>,
    id: i64,
    status: String,
    result_count: Option<i32>,
    processing_time: Option<f64>,
    error_message: Option<String>,
) -> std::result::Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::update_session_status(
            conn,
            id,
            &status,
            result_count,
            processing_time,
            error_message.as_deref(),
        )
        .map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn insert_morphological_data(
    state: State<'_, DbState>,
    data: Vec<MorphologicalData>,
) -> std::result::Result<usize, String> {
    let mut conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_mut() {
        db::insert_morphological_data(conn, data).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_sessions(
    state: State<'_, DbState>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> std::result::Result<Vec<Session>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::get_sessions(conn, limit, offset).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_morphological_data(
    state: State<'_, DbState>,
    session_id: i64,
) -> std::result::Result<Vec<MorphologicalData>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::get_morphological_data(conn, session_id).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn word_form_exists(
    state: State<'_, DbState>,
    word: String,
) -> std::result::Result<bool, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::word_form_exists(conn, &word).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn get_session(state: State<'_, DbState>, id: i64) -> std::result::Result<Session, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::get_session(conn, id).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn delete_session(state: State<'_, DbState>, id: i64) -> std::result::Result<(), String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::delete_session(conn, id).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn search_lemmas(
    state: State<'_, DbState>,
    query: String,
) -> std::result::Result<Vec<MorphologicalData>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::search_lemmas(conn, &query).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn start_morphodita_server(
    model_dir: String,
    port: u16,
) -> std::result::Result<String, String> {
    Err("Sidecar managed from frontend".to_string())
}

#[tauri::command]
pub fn stop_morphodita_server() -> std::result::Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_offline_models_dir() -> std::result::Result<String, String> {
    Err("Use app data dir from frontend".to_string())
}
