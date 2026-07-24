pub mod backup;
pub mod commands;
pub mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let conn = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(db::DbState {
                conn: Mutex::new(Some(conn)),
            });

            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::save_wizard_results,
            commands::update_session_status,
            commands::insert_morphological_data,
            commands::get_sessions,
            commands::get_morphological_data,
            commands::word_form_exists,
            commands::get_session,
            commands::delete_session,
            commands::search_lemmas,
            commands::start_morphodita_server,
            commands::stop_morphodita_server,
            commands::get_offline_models_dir,
            commands::get_all_morphological_data,
            commands::delete_sessions,
            commands::delete_morphological_data,
            commands::update_session,
            commands::update_morphological_data,
            commands::search_sessions,
            commands::search_morphological_data,
            commands::backup_database,
            commands::validate_backup,
            commands::restore_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
