pub mod cloudflare;
pub mod commands;
pub mod db;
pub mod keychain;

use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppDb(pub Mutex<Connection>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            use tauri::Manager;

            let db_path = app.path().app_data_dir().unwrap().join("kvault.db");

            // Ensure the app data directory exists
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }

            let conn = Connection::open(&db_path)
                .expect("Failed to open database");
            db::migrations::run_migrations(&conn)
                .expect("Failed to run database migrations");

            app.manage(AppDb(Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Account commands
            commands::accounts::add_account,
            commands::accounts::list_accounts,
            commands::accounts::update_account,
            commands::accounts::remove_account,
            commands::accounts::validate_token,
            // Namespace commands
            commands::namespaces::list_namespaces,
            commands::namespaces::refresh_namespaces,
            // Key commands
            commands::keys::get_cached_keys,
            commands::keys::search_keys_global,
            commands::keys::get_value,
            commands::keys::put_value,
            commands::keys::delete_key,
            commands::keys::bulk_delete_keys,
            commands::keys::create_key,
            // Sync commands
            commands::sync::start_sync,
            commands::sync::get_sync_status,
            // Workspace commands
            commands::workspaces::list_workspaces,
            commands::workspaces::save_workspace,
            commands::workspaces::update_workspace,
            commands::workspaces::delete_workspace,
            // Filter commands
            commands::filters::list_saved_filters,
            commands::filters::save_filter,
            commands::filters::delete_saved_filter,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
