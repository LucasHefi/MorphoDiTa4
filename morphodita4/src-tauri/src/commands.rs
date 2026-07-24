use crate::backup::{self, BackupMetadata, RestoreResult};
use crate::db::{self, DbState, MorphologicalData, Session};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Deserialize)]
pub struct SaveWizardResultsRequest {
    pub session: Session,
    pub data: Vec<MorphologicalData>,
}

#[derive(Debug, Serialize)]
pub struct SaveWizardResultsResponse {
    pub session_id: i64,
    pub saved_count: usize,
}

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
pub fn save_wizard_results(
    state: State<'_, DbState>,
    request: SaveWizardResultsRequest,
) -> std::result::Result<SaveWizardResultsResponse, String> {
    let mut conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_mut() {
        let (session_id, saved_count) =
            db::save_wizard_results(conn, request.session, request.data)
                .map_err(|e| e.to_string())?;
        Ok(SaveWizardResultsResponse {
            session_id,
            saved_count,
        })
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
pub fn get_all_morphological_data(
    state: State<'_, DbState>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> std::result::Result<Vec<MorphologicalData>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::get_all_morphological_data(conn, limit, offset).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn delete_sessions(
    state: State<'_, DbState>,
    ids: Vec<i64>,
) -> std::result::Result<usize, String> {
    let mut conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_mut() {
        db::delete_sessions(conn, ids).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn delete_morphological_data(
    state: State<'_, DbState>,
    ids: Vec<i64>,
) -> std::result::Result<usize, String> {
    let mut conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_mut() {
        db::delete_morphological_data(conn, ids).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn update_session(
    state: State<'_, DbState>,
    id: i64,
    field: String,
    value: serde_json::Value,
) -> std::result::Result<usize, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::update_session(conn, id, &field, value).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn update_morphological_data(
    state: State<'_, DbState>,
    id: i64,
    field: String,
    value: serde_json::Value,
) -> std::result::Result<usize, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::update_morphological_data(conn, id, &field, value).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn search_sessions(
    state: State<'_, DbState>,
    search_term: String,
    fields: Vec<String>,
) -> std::result::Result<Vec<Session>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::search_sessions(conn, &search_term, &fields).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn search_morphological_data(
    state: State<'_, DbState>,
    search_term: String,
    fields: Vec<String>,
) -> std::result::Result<Vec<MorphologicalData>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::search_morphological_data(conn, &search_term, &fields).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn backup_database(
    state: State<'_, DbState>,
    output_path: String,
) -> std::result::Result<BackupMetadata, String> {
    let output_path = Path::new(&output_path);
    if output_path.as_os_str().is_empty() {
        return Err("backup_database: output path is required".to_string());
    }
    let conn_guard = state.conn.lock().unwrap();
    let conn = conn_guard
        .as_ref()
        .ok_or_else(|| "backup_database: database not initialized".to_string())?;
    backup::backup_database(conn, output_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn validate_backup(backup_path: String) -> std::result::Result<BackupMetadata, String> {
    let backup_path = Path::new(&backup_path);
    if backup_path.as_os_str().is_empty() {
        return Err("validate_backup: backup path is required".to_string());
    }
    backup::validate_backup(backup_path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restore_database(
    app: AppHandle,
    state: State<'_, DbState>,
    backup_path: String,
) -> std::result::Result<RestoreResult, String> {
    let backup_path = Path::new(&backup_path);
    if backup_path.as_os_str().is_empty() {
        return Err("restore_database: backup path is required".to_string());
    }
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("restore_database: app data path unavailable: {error}"))?;
    let database_path = app_dir.join("morphodita.db");
    let mut conn_guard = state.conn.lock().unwrap();
    let connection = conn_guard
        .take()
        .ok_or_else(|| "restore_database: database not initialized".to_string())?;
    drop(connection);

    let restore_result = backup::restore_database(&database_path, backup_path);
    let reopened = db::open_database_at(&database_path).map_err(|error| error.to_string());
    match (restore_result, reopened) {
        (Ok(result), Ok(connection)) => {
            *conn_guard = Some(connection);
            Ok(result)
        }
        (Err(restore_error), Ok(connection)) => {
            *conn_guard = Some(connection);
            Err(restore_error.to_string())
        }
        (Ok(result), Err(reopen_error)) => Err(format!(
            "restore_database: restore succeeded but database could not be reopened; rollback_path={:?}; error={reopen_error}",
            result.rollback_path
        )),
        (Err(restore_error), Err(reopen_error)) => Err(format!(
            "restore_database: {restore_error}; database reopen also failed: {reopen_error}"
        )),
    }
}

#[tauri::command]
pub fn start_morphodita_server(
    model_dir: String,
    port: u16,
) -> std::result::Result<String, String> {
    let _ = (model_dir, port);
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
