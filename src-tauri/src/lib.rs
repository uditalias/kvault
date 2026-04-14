pub mod cloudflare;
pub mod commands;
pub mod db;
pub mod keychain;
pub mod mock;
pub mod update;

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
            use tauri::menu::{Menu, MenuItemBuilder, Submenu, HELP_SUBMENU_ID};
            use tauri::{Emitter, Manager};

            let db_path = app.path().app_data_dir().unwrap().join("kvault.db");

            // Ensure the app data directory exists
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }

            let conn = Connection::open(&db_path)
                .expect("Failed to open database");
            db::migrations::run_migrations(&conn)
                .expect("Failed to run database migrations");

            // Dev-only: seed a mock account with realistic data so screenshots
            // and local exploration don't need a real Cloudflare token.
            #[cfg(debug_assertions)]
            {
                if let Err(e) = mock::seed(&conn) {
                    eprintln!("mock seed failed: {e}");
                }
            }

            app.manage(AppDb(Mutex::new(conn)));

            // Build the OS-default menu and append a "Check for updates…"
            // item to the Help submenu so we keep all the standard OS
            // shortcuts (Edit menu, Window menu, etc).
            let menu = Menu::default(app.handle())?;
            let check_updates = MenuItemBuilder::new("Check for updates…")
                .id("check-for-updates")
                .build(app)?;

            if let Some(help_kind) = menu.get(HELP_SUBMENU_ID) {
                if let Some(help_submenu) = help_kind.as_submenu() {
                    help_submenu.append(&check_updates)?;
                }
            } else {
                // Fallback: default menu had no Help submenu for this platform;
                // tack on a minimal Help submenu so the item is still reachable.
                let help = Submenu::with_id_and_items(
                    app.handle(),
                    HELP_SUBMENU_ID,
                    "Help",
                    true,
                    &[&check_updates],
                )?;
                menu.append(&help)?;
            }

            app.set_menu(menu)?;

            let check_updates_id = check_updates.id().clone();
            app.on_menu_event(move |app_handle, event| {
                if event.id() == &check_updates_id {
                    let _ = app_handle.emit("kvault:check-for-updates", ());
                }
            });

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
            // Update commands
            commands::update::check_for_updates,
            commands::update::dismiss_update_version,
            commands::update::get_dismissed_version,
            commands::update::open_release_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
