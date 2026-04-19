use tauri::State;
use uuid::Uuid;

use crate::db::playgrounds::{self, Playground};
use crate::AppDb;

#[tauri::command]
pub async fn list_playgrounds(
    db: State<'_, AppDb>,
    account_id: String,
) -> Result<Vec<Playground>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::list_playgrounds(&conn, &account_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_playground(
    db: State<'_, AppDb>,
    account_id: String,
    name: String,
) -> Result<Playground, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::create_playground(&conn, &id, &account_id, &name).map_err(|e| e.to_string())?;
    playgrounds::get_playground(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to load created playground".to_string())
}

#[tauri::command]
pub async fn update_playground_code(
    db: State<'_, AppDb>,
    id: String,
    code: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::update_code(&conn, &id, &code).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_playground_name(
    db: State<'_, AppDb>,
    id: String,
    name: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::update_name(&conn, &id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_playground_mode(
    db: State<'_, AppDb>,
    id: String,
    mode: String,
) -> Result<(), String> {
    if mode != "read-only" && mode != "live" {
        return Err(format!(
            "Invalid playground mode '{}' (expected 'read-only' or 'live')",
            mode
        ));
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::update_mode(&conn, &id, &mode).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_playground(db: State<'_, AppDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::delete_playground(&conn, &id).map_err(|e| e.to_string())
}

/// Returns the code content of a playground. The frontend triggers a browser
/// download with this content, so we don't need the native file dialog plugin.
#[tauri::command]
pub async fn export_playground_content(
    db: State<'_, AppDb>,
    id: String,
) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let pg = playgrounds::get_playground(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Playground not found".to_string())?;
    Ok(pg.code)
}

/// Imports a playground from raw content (the frontend reads the file via the
/// HTML File API and ships the string, so no native file-dialog plugin needed).
#[tauri::command]
pub async fn import_playground(
    db: State<'_, AppDb>,
    account_id: String,
    name: String,
    code: String,
) -> Result<Playground, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    playgrounds::insert_playground(&conn, &id, &account_id, &name, &code, "read-only")
        .map_err(|e| e.to_string())?;
    playgrounds::get_playground(&conn, &id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Failed to load imported playground".to_string())
}
