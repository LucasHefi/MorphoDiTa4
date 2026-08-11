pub mod backup;
pub mod commands;
pub mod db;

#[cfg(test)]
use std::alloc::{GlobalAlloc, Layout, System};
#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(test)]
struct TestAllocator;

#[cfg(test)]
static CURRENT_HEAP_BYTES: AtomicUsize = AtomicUsize::new(0);
#[cfg(test)]
static PEAK_HEAP_GROWTH_BYTES: AtomicUsize = AtomicUsize::new(0);

#[cfg(test)]
#[global_allocator]
static TEST_ALLOCATOR: TestAllocator = TestAllocator;

#[cfg(test)]
unsafe impl GlobalAlloc for TestAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc(layout) };
        if !pointer.is_null() {
            record_allocation(layout.size());
        }
        pointer
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        let pointer = unsafe { System.alloc_zeroed(layout) };
        if !pointer.is_null() {
            record_allocation(layout.size());
        }
        pointer
    }

    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        unsafe { System.dealloc(pointer, layout) };
        CURRENT_HEAP_BYTES.fetch_sub(layout.size(), Ordering::AcqRel);
    }

    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let new_pointer = unsafe { System.realloc(pointer, layout, new_size) };
        if !new_pointer.is_null() {
            if new_size >= layout.size() {
                record_allocation(new_size - layout.size());
            } else {
                CURRENT_HEAP_BYTES.fetch_sub(layout.size() - new_size, Ordering::AcqRel);
            }
        }
        new_pointer
    }
}

#[cfg(test)]
fn record_allocation(bytes: usize) {
    let current = CURRENT_HEAP_BYTES.fetch_add(bytes, Ordering::AcqRel) + bytes;
    let mut peak = PEAK_HEAP_GROWTH_BYTES.load(Ordering::Acquire);
    while current > peak {
        match PEAK_HEAP_GROWTH_BYTES.compare_exchange_weak(
            peak,
            current,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => break,
            Err(observed) => peak = observed,
        }
    }
}

#[cfg(test)]
pub(crate) fn measure_peak_heap_growth<F, R>(operation: F) -> (R, usize)
where
    F: FnOnce() -> R,
{
    let baseline = CURRENT_HEAP_BYTES.load(Ordering::Acquire);
    PEAK_HEAP_GROWTH_BYTES.store(0, Ordering::Release);
    let result = operation();
    let peak = PEAK_HEAP_GROWTH_BYTES.load(Ordering::Acquire);
    (result, peak.saturating_sub(baseline))
}

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

            let conn = db::init_db(app.handle())?;
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
            commands::word_forms_exist,
            commands::get_session,
            commands::delete_session,
            commands::search_lemmas,
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
            commands::get_model_catalog,
            commands::download_model,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| eprintln!("error while running tauri application: {error}"));
}
