use crate::backup::{self, BackupMetadata, RestoreResult};
use crate::db::{self, DbState, MorphologicalData, Session};
use futures_util::StreamExt;
use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use tauri::{AppHandle, Manager, State};
use tokio::io::AsyncWriteExt;
use uuid::Uuid;
use zip::ZipArchive;

const MODEL_CATALOG_JSON: &str = include_str!("../../model-catalog.json");
const MODEL_CATALOG_SCHEMA_VERSION: u32 = 1;
const MAX_MODEL_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const ALLOWED_DOWNLOAD_PREFIX: &str =
    "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/";
const ALLOWED_DOWNLOAD_URL: &str =
    "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/a5d20e52-fc3d-4bc4-9df9-5b4c36839dcc/content";
const ALLOWED_SOURCE_URL: &str = "https://hdl.handle.net/11234/1-5985";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCatalog {
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    pub models: Vec<ModelCatalogEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCatalogEntry {
    pub id: String,
    pub version: String,
    pub language: String,
    #[serde(rename = "sourceUrl")]
    pub source_url: String,
    #[serde(rename = "downloadUrl")]
    pub download_url: String,
    #[serde(rename = "archiveName")]
    pub archive_name: String,
    #[serde(rename = "archiveSizeBytes")]
    pub archive_size_bytes: u64,
    #[serde(rename = "archiveMd5")]
    pub archive_md5: String,
    #[serde(rename = "archiveSha256")]
    pub archive_sha256: String,
    #[serde(rename = "archivePrefix")]
    pub archive_prefix: String,
    #[serde(rename = "archiveEntries")]
    pub archive_entries: Vec<String>,
    #[serde(rename = "artifactPath")]
    pub artifact_path: String,
    #[serde(rename = "artifactName")]
    pub artifact_name: String,
    #[serde(rename = "artifactSizeBytes")]
    pub artifact_size_bytes: u64,
    #[serde(rename = "artifactSha256")]
    pub artifact_sha256: String,
    pub license: ModelCatalogLicense,
    #[serde(rename = "noticeEntries")]
    pub notice_entries: Vec<ModelCatalogNotice>,
    #[serde(rename = "serverCompatibility")]
    pub server_compatibility: ModelCompatibility,
    pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCatalogLicense {
    pub spdx: String,
    pub name: String,
    pub url: String,
    #[serde(rename = "commercialUse")]
    pub commercial_use: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCatalogNotice {
    #[serde(rename = "archivePath")]
    pub archive_path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelCompatibility {
    #[serde(rename = "minServerVersion")]
    pub min_server_version: String,
    #[serde(rename = "maxServerVersion")]
    pub max_server_version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DownloadedModel {
    pub id: String,
    pub version: String,
    pub path: String,
    pub artifact: String,
    pub sha256: String,
}

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
    limit: Option<i32>,
    offset: Option<i32>,
) -> std::result::Result<Vec<Session>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::search_sessions(conn, &search_term, &fields, limit, offset).map_err(|e| e.to_string())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn search_morphological_data(
    state: State<'_, DbState>,
    search_term: String,
    fields: Vec<String>,
    limit: Option<i32>,
    offset: Option<i32>,
) -> std::result::Result<Vec<MorphologicalData>, String> {
    let conn_guard = state.conn.lock().unwrap();
    if let Some(conn) = conn_guard.as_ref() {
        db::search_morphological_data(conn, &search_term, &fields, limit, offset)
            .map_err(|e| e.to_string())
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
pub fn get_model_catalog() -> std::result::Result<ModelCatalog, String> {
    load_model_catalog()
}

#[tauri::command]
pub async fn download_model(
    app: AppHandle,
    model_id: String,
    consent: bool,
) -> std::result::Result<DownloadedModel, String> {
    if !consent {
        return Err("model download requires explicit license consent".to_string());
    }
    let catalog = load_model_catalog()?;
    let model = catalog
        .models
        .iter()
        .find(|candidate| candidate.id == model_id)
        .cloned()
        .ok_or_else(|| format!("model is not present in the allowlisted catalog: {model_id}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("model download: app data path unavailable: {error}"))?;
    let models_dir = app_data_dir.join("models");
    tokio::fs::create_dir_all(&models_dir)
        .await
        .map_err(|error| format!("model download: cannot create model directory: {error}"))?;
    let target_dir = models_dir.join(&model.id);
    if tokio::fs::metadata(&target_dir).await.is_ok() {
        return Err(format!("model is already installed: {}", model.id));
    }

    let token = Uuid::new_v4();
    let archive_path = models_dir.join(format!(".{}.download-{token}.zip", model.id));
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|error| format!("model download: HTTP client unavailable: {error}"))?;
    let result = async {
        let response = client
            .get(&model.download_url)
            .header(reqwest::header::ACCEPT, "application/zip")
            .send()
            .await
            .map_err(|error| format!("model download: request failed: {error}"))?;
        if !response.status().is_success() {
            return Err(format!("model download: HTTP status {}", response.status()));
        }
        if let Some(content_length) = response.content_length() {
            if content_length > MAX_MODEL_ARCHIVE_BYTES
                || content_length != model.archive_size_bytes
            {
                return Err(format!(
                    "model download: unexpected archive size {content_length} (expected {})",
                    model.archive_size_bytes
                ));
            }
        }
        let mut stream = response.bytes_stream();
        let mut file = tokio::fs::File::create(&archive_path)
            .await
            .map_err(|error| format!("model download: cannot create temporary file: {error}"))?;
        let mut downloaded = 0_u64;
        let mut md5 = Md5::new();
        let mut sha256 = Sha256::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|error| format!("model download: response stream failed: {error}"))?;
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            if downloaded > model.archive_size_bytes || downloaded > MAX_MODEL_ARCHIVE_BYTES {
                return Err("model download: archive exceeds the allowlisted size".to_string());
            }
            md5.update(&chunk);
            sha256.update(&chunk);
            file.write_all(&chunk)
                .await
                .map_err(|error| format!("model download: temporary write failed: {error}"))?;
        }
        file.flush()
            .await
            .map_err(|error| format!("model download: temporary flush failed: {error}"))?;
        if downloaded != model.archive_size_bytes {
            return Err(format!(
                "model download: incomplete archive ({downloaded} bytes, expected {})",
                model.archive_size_bytes
            ));
        }
        if hex_digest(md5.finalize()) != model.archive_md5 {
            return Err("model download: archive MD5 mismatch".to_string());
        }
        if hex_digest(sha256.finalize()) != model.archive_sha256 {
            return Err("model download: archive SHA-256 mismatch".to_string());
        }

        let model = model.clone();
        let archive_path_for_install = archive_path.clone();
        let models_dir_for_install = models_dir.clone();
        Ok(tokio::task::spawn_blocking(move || {
            install_model_archive(&archive_path_for_install, &models_dir_for_install, &model)
        })
        .await
        .map_err(|error| format!("model download: installer worker failed: {error}"))??)
    }
    .await;
    let _ = tokio::fs::remove_file(&archive_path).await;
    result
}

fn load_model_catalog() -> std::result::Result<ModelCatalog, String> {
    let catalog: ModelCatalog = serde_json::from_str(MODEL_CATALOG_JSON)
        .map_err(|error| format!("model catalog is invalid JSON: {error}"))?;
    validate_model_catalog(&catalog)?;
    Ok(catalog)
}

fn validate_model_catalog(catalog: &ModelCatalog) -> std::result::Result<(), String> {
    if catalog.schema_version != MODEL_CATALOG_SCHEMA_VERSION || catalog.models.is_empty() {
        return Err("model catalog schema or model list is invalid".to_string());
    }
    let mut ids = HashSet::new();
    for model in &catalog.models {
        if !ids.insert(&model.id)
            || !is_safe_component(&model.id)
            || model.archive_size_bytes == 0
            || model.archive_size_bytes > MAX_MODEL_ARCHIVE_BYTES
            || !model.download_url.starts_with(ALLOWED_DOWNLOAD_PREFIX)
            || model.download_url != ALLOWED_DOWNLOAD_URL
            || model.source_url != ALLOWED_SOURCE_URL
            || !is_hex(&model.archive_md5, 32)
            || !is_hex(&model.archive_sha256, 64)
            || !is_hex(&model.artifact_sha256, 64)
        {
            return Err(format!("model catalog entry is invalid: {}", model.id));
        }
        if !model.archive_prefix.ends_with('/')
            || !model.archive_entries.contains(&model.archive_prefix)
            || !model.archive_entries.contains(&model.artifact_path)
            || model.artifact_path == model.archive_prefix
            || !model.artifact_path.starts_with(&model.archive_prefix)
            || !is_safe_component(&model.artifact_name)
            || model.artifact_size_bytes == 0
        {
            return Err(format!("model archive contract is invalid: {}", model.id));
        }
        let mut archive_entries = HashSet::new();
        for entry in &model.archive_entries {
            if !archive_entries.insert(entry)
                || !entry.starts_with(&model.archive_prefix)
                || !is_safe_archive_path(entry)
            {
                return Err(format!("model archive entry is invalid: {entry}"));
            }
        }
        for notice in &model.notice_entries {
            if !model.archive_entries.contains(&notice.archive_path)
                || !is_safe_component(&notice.file_name)
                || notice.file_name == model.artifact_name
            {
                return Err(format!("model notice entry is invalid: {}", model.id));
            }
        }
        if model.license.name.trim().is_empty()
            || model.license.spdx.trim().is_empty()
            || !model.license.url.starts_with("https://")
            || model.license.commercial_use
        {
            return Err(format!("model license metadata is invalid: {}", model.id));
        }
    }
    Ok(())
}

fn install_model_archive(
    archive_path: &Path,
    models_dir: &Path,
    model: &ModelCatalogEntry,
) -> std::result::Result<DownloadedModel, String> {
    let temporary_dir = models_dir.join(format!(".{}.install-{}", model.id, Uuid::new_v4()));
    let install_result = (|| {
        fs::create_dir_all(&temporary_dir).map_err(|error| {
            format!("model install: cannot create temporary directory: {error}")
        })?;
        let archive_file = File::open(archive_path)
            .map_err(|error| format!("model install: cannot open archive: {error}"))?;
        let mut archive = ZipArchive::new(archive_file)
            .map_err(|error| format!("model install: invalid ZIP archive: {error}"))?;
        let expected: HashSet<&str> = model.archive_entries.iter().map(String::as_str).collect();
        let mut seen = HashSet::new();
        for index in 0..archive.len() {
            let entry = archive
                .by_index(index)
                .map_err(|error| format!("model install: cannot inspect ZIP entry: {error}"))?;
            let name = entry.name().to_string();
            if !is_safe_archive_path(&name)
                || !expected.contains(name.as_str())
                || !seen.insert(name.clone())
                || entry
                    .unix_mode()
                    .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                return Err(format!(
                    "model install: unexpected or unsafe ZIP entry: {name}"
                ));
            }
        }
        if seen.len() != expected.len() {
            return Err("model install: ZIP archive is missing an expected entry".to_string());
        }
        extract_zip_entry(
            &mut archive,
            &model.artifact_path,
            &temporary_dir.join(&model.artifact_name),
        )?;
        for notice in &model.notice_entries {
            extract_zip_entry(
                &mut archive,
                &notice.archive_path,
                &temporary_dir.join(&notice.file_name),
            )?;
        }
        let artifact_path = temporary_dir.join(&model.artifact_name);
        let artifact = fs::read(&artifact_path)
            .map_err(|error| format!("model install: cannot read extracted artifact: {error}"))?;
        if artifact.len() as u64 != model.artifact_size_bytes
            || hex_digest(Sha256::digest(&artifact)) != model.artifact_sha256
        {
            return Err("model install: extracted artifact checksum or size mismatch".to_string());
        }
        let manifest = serde_json::json!({
            "schemaVersion": 1,
            "id": model.id,
            "version": model.version,
            "release": "250909",
            "language": model.language,
            "artifact": model.artifact_name,
            "sourceUrl": model.source_url,
            "license": { "spdx": model.license.spdx, "url": model.license.url },
            "notices": model.notice_entries.iter().map(|notice| notice.file_name.clone()).collect::<Vec<_>>(),
            "serverCompatibility": model.server_compatibility,
            "description": "Official Czech MorfFlex2.1/PDT-C2.0 MorphoDiTa model downloaded from LINDAT after license consent.",
            "capabilities": model.capabilities,
        });
        let manifest_bytes = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| format!("model install: cannot serialize manifest: {error}"))?;
        fs::write(temporary_dir.join("model.json"), manifest_bytes)
            .map_err(|error| format!("model install: cannot write manifest: {error}"))?;
        let target_dir = models_dir.join(&model.id);
        if target_dir.exists() {
            return Err(format!(
                "model install: target already exists: {}",
                model.id
            ));
        }
        fs::rename(&temporary_dir, &target_dir)
            .map_err(|error| format!("model install: atomic install failed: {error}"))?;
        Ok(DownloadedModel {
            id: model.id.clone(),
            version: model.version.clone(),
            path: target_dir.to_string_lossy().into_owned(),
            artifact: model.artifact_name.clone(),
            sha256: model.artifact_sha256.clone(),
        })
    })();
    if install_result.is_err() {
        let _ = fs::remove_dir_all(&temporary_dir);
    }
    install_result
}

fn extract_zip_entry(
    archive: &mut ZipArchive<File>,
    archive_path: &str,
    output_path: &Path,
) -> std::result::Result<(), String> {
    let mut entry = archive
        .by_name(archive_path)
        .map_err(|error| format!("model install: missing ZIP entry {archive_path}: {error}"))?;
    if entry.is_dir() {
        return Err(format!(
            "model install: expected file but found directory {archive_path}"
        ));
    }
    let mut output = File::create(output_path)
        .map_err(|error| format!("model install: cannot create extracted file: {error}"))?;
    std::io::copy(&mut entry, &mut output)
        .map_err(|error| format!("model install: extraction failed: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("model install: extracted file flush failed: {error}"))?;
    Ok(())
}

fn is_safe_archive_path(value: &str) -> bool {
    if value.is_empty()
        || value.starts_with('/')
        || value.contains('\\')
        || value.chars().any(char::is_control)
    {
        return false;
    }
    let mut components = value.split('/').collect::<Vec<_>>();
    if components.last() == Some(&"") {
        components.pop();
    }
    !components.is_empty()
        && components
            .iter()
            .all(|component| !component.is_empty() && *component != "." && *component != "..")
}

fn is_safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && !value.contains(['/', '\\'])
        && value.chars().all(|character| !character.is_control())
}

fn is_hex(value: &str, length: usize) -> bool {
    value.len() == length && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hex_digest<D: AsRef<[u8]>>(digest: D) -> String {
    digest
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
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

#[cfg(test)]
mod model_download_tests {
    use super::*;

    #[test]
    fn validates_the_pinned_catalog() {
        let catalog = load_model_catalog().expect("catalog should be valid");
        assert_eq!(catalog.models[0].id, "czech-250909");
        assert_eq!(catalog.models[0].archive_size_bytes, 102_852_507);
    }

    #[test]
    fn rejects_untrusted_download_urls() {
        let mut catalog = load_model_catalog().expect("catalog should be valid");
        catalog.models[0].download_url = "https://example.invalid/model.zip".to_string();
        assert!(validate_model_catalog(&catalog).is_err());
    }

    #[test]
    fn allows_only_safe_archive_paths_and_a_trailing_directory_separator() {
        assert!(is_safe_archive_path("model/"));
        assert!(is_safe_archive_path("model/LICENSE"));
        assert!(!is_safe_archive_path("../model/LICENSE"));
        assert!(!is_safe_archive_path("/model/LICENSE"));
        assert!(!is_safe_archive_path("model\\\\LICENSE"));
        assert!(!is_safe_archive_path("model//LICENSE"));
    }

    fn fixture_model(archive_entries: Vec<String>) -> ModelCatalogEntry {
        let artifact = b"fixture-artifact";
        ModelCatalogEntry {
            id: "fixture".to_string(),
            version: "1.0.0".to_string(),
            language: "czech".to_string(),
            source_url: "https://example.invalid/source".to_string(),
            download_url:
                "https://lindat.mff.cuni.cz/repository/server/api/core/bitstreams/fixture"
                    .to_string(),
            archive_name: "fixture.zip".to_string(),
            archive_size_bytes: 1,
            archive_md5: "00000000000000000000000000000000".to_string(),
            archive_sha256: "0000000000000000000000000000000000000000000000000000000000000000"
                .to_string(),
            archive_prefix: "root/".to_string(),
            archive_entries,
            artifact_path: "root/model.tagger".to_string(),
            artifact_name: "model.tagger".to_string(),
            artifact_size_bytes: artifact.len() as u64,
            artifact_sha256: hex_digest(Sha256::digest(artifact)),
            license: ModelCatalogLicense {
                spdx: "CC-BY-NC-SA-4.0".to_string(),
                name: "Fixture license".to_string(),
                url: "https://creativecommons.org/licenses/by-nc-sa/4.0/".to_string(),
                commercial_use: false,
            },
            notice_entries: vec![
                ModelCatalogNotice {
                    archive_path: "root/LICENSE".to_string(),
                    file_name: "LICENSE.txt".to_string(),
                },
                ModelCatalogNotice {
                    archive_path: "root/README".to_string(),
                    file_name: "README.txt".to_string(),
                },
            ],
            server_compatibility: ModelCompatibility {
                min_server_version: "1.0.0".to_string(),
                max_server_version: Some("1.0.0".to_string()),
            },
            capabilities: vec!["tag".to_string()],
        }
    }

    fn write_fixture_zip(path: &Path, extra_entry: Option<&str>) {
        let file = File::create(path).expect("fixture ZIP should be created");
        let mut writer = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default();
        writer
            .add_directory("root/", options)
            .expect("root directory should be written");
        for (name, content) in [
            ("root/LICENSE", b"license".as_slice()),
            ("root/README", b"readme".as_slice()),
            ("root/model.tagger", b"fixture-artifact".as_slice()),
        ] {
            writer
                .start_file(name, options)
                .expect("fixture file should be written");
            writer
                .write_all(content)
                .expect("fixture content should be written");
        }
        if let Some(name) = extra_entry {
            writer
                .start_file(name, options)
                .expect("extra fixture file should be written");
            writer
                .write_all(b"unexpected")
                .expect("extra fixture content should be written");
        }
        writer.finish().expect("fixture ZIP should finish");
    }

    #[test]
    fn installs_a_valid_fixture_zip_atomically() {
        let root = std::env::temp_dir().join(format!("morphodita-model-test-{}", Uuid::new_v4()));
        let models_dir = root.join("models");
        let archive_path = root.join("fixture.zip");
        fs::create_dir_all(&models_dir).expect("fixture directory should be created");
        write_fixture_zip(&archive_path, None);
        let model = fixture_model(vec![
            "root/".to_string(),
            "root/LICENSE".to_string(),
            "root/README".to_string(),
            "root/model.tagger".to_string(),
        ]);

        let installed = install_model_archive(&archive_path, &models_dir, &model)
            .expect("fixture should install");

        assert_eq!(installed.id, "fixture");
        assert!(models_dir.join("fixture/model.tagger").is_file());
        assert!(models_dir.join("fixture/model.json").is_file());
        fs::remove_dir_all(root).expect("fixture directory should be removed");
    }

    #[test]
    fn rejects_unexpected_zip_entries_before_activation() {
        let root = std::env::temp_dir().join(format!("morphodita-model-test-{}", Uuid::new_v4()));
        let models_dir = root.join("models");
        let archive_path = root.join("fixture.zip");
        fs::create_dir_all(&models_dir).expect("fixture directory should be created");
        write_fixture_zip(&archive_path, Some("../escape"));
        let model = fixture_model(vec![
            "root/".to_string(),
            "root/LICENSE".to_string(),
            "root/README".to_string(),
            "root/model.tagger".to_string(),
            "../escape".to_string(),
        ]);

        let result = install_model_archive(&archive_path, &models_dir, &model);

        assert!(result.is_err());
        assert!(!models_dir.join("fixture").exists());
        fs::remove_dir_all(root).expect("fixture directory should be removed");
    }
}
